import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Subscription } from 'rxjs'
import { ProfilesService } from '../services/profiles.service'
import { ConfigService } from '../services/config.service'
import { VaultService } from '../services/vault.service'
import { Profile, PartialProfile, ProfileGroup, PartialProfileGroup, ProfileProvider } from '../api/profileProvider'
import { HostAppService, Platform, NotificationsService, PlatformService } from '../api'
import deepClone from 'clone-deep'
import { PromptModalComponent } from './promptModal.component'
import { v4 as uuidv4 } from 'uuid'

export interface SessionNode {
    id: string
    name: string
    type: 'folder' | 'session'
    children: SessionNode[]
    profile?: PartialProfile<Profile>
    groupPath?: string
    groupId?: string
    expanded?: boolean
    parent?: SessionNode
    level: number
}

@Component({
    selector: 'session-manager',
    templateUrl: './sessionManager.component.pug',
    styleUrls: ['./sessionManager.component.scss'],
})
export class SessionManagerComponent implements OnInit, OnDestroy {
    @Input() isVisible = true
    @Output() toggle = new EventEmitter<void>()

    nodes: SessionNode[] = []
    profileGroups: PartialProfileGroup<ProfileGroup>[] = []
    filter = ''
    dragNode: SessionNode | null = null
    selectedNodes = new Set<SessionNode>()
    private configSubscription?: Subscription
    private groupIdToPath = new Map<string, string>()
    private groupPathToId = new Map<string, string>()

    constructor (
        public profilesService: ProfilesService,
        public config: ConfigService,
        private modal: NgbModal,
        private hostApp: HostAppService,
        private notifications: NotificationsService,
        private vault: VaultService,
        private platformService: PlatformService,
    ) { }

    async ngOnInit (): Promise<void> {
        await this.config.ready$.toPromise()
        await this.refresh()
        this.configSubscription = this.config.changed$.subscribe(() => {
            void this.refresh()
        })
    }

    ngOnDestroy (): void {
        this.configSubscription?.unsubscribe()
    }

    async refresh (): Promise<void> {
        const profiles = await this.profilesService.getProfiles({ includeBuiltin: false })
        this.profileGroups = await this.profilesService.getProfileGroups({ includeProfiles: false, includeNonUserGroup: false })
        this.rebuildGroupMaps()
        this.nodes = this.buildTree(profiles)
        this.filterNodes()
    }

    buildTree (profiles: PartialProfile<Profile>[]): SessionNode[] {
        const root: SessionNode[] = []
        const folderNodesByPath = new Map<string, SessionNode>()

        const ensureFolderPath = (path: string): SessionNode => {
            const parts = this.normalizeGroupPath(path).split('/').filter(Boolean)
            let currentPath = ''
            let parent: SessionNode | undefined = undefined

            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part
                let node = folderNodesByPath.get(currentPath)
                if (!node) {
                    node = {
                        id: `folder:${currentPath}`,
                        name: part,
                        type: 'folder',
                        children: [],
                        expanded: true,
                        parent,
                        level: parent ? parent.level + 1 : 0,
                        groupPath: currentPath,
                        groupId: this.groupPathToId.get(currentPath),
                    }
                    folderNodesByPath.set(currentPath, node)
                    if (parent) {
                        parent.children.push(node)
                    } else {
                        root.push(node)
                    }
                }
                parent = node
            }

            return folderNodesByPath.get(this.normalizeGroupPath(path))!
        }

        for (const group of this.profileGroups) {
            const path = this.normalizeGroupPath(group.name)
            if (path) {
                ensureFolderPath(path)
            }
        }

        for (const profile of profiles) {
            const groupId = profile.group?.trim()
            const groupPath = groupId ? this.groupIdToPath.get(groupId) ?? groupId : ''
            const folder = groupPath ? ensureFolderPath(groupPath) : null

            const node: SessionNode = {
                id: profile.id ?? uuidv4(),
                name: profile.name,
                type: 'session',
                children: [],
                profile,
                parent: folder ?? undefined,
                level: folder ? folder.level + 1 : 0,
            }

            if (folder) {
                folder.children.push(node)
            } else {
                root.push(node)
            }
        }

        const sortNodes = (nodes: SessionNode[]) => {
            nodes.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'folder' ? -1 : 1
                }
                return a.name.localeCompare(b.name)
            })
            for (const n of nodes) {
                if (n.children.length) {
                    sortNodes(n.children)
                }
            }
        }

        sortNodes(root)
        return root
    }

    filterNodes (): void {
        const query = this.filter.trim().toLowerCase()
        if (!query) {
            return
        }

        const filterTree = (nodes: SessionNode[], parent?: SessionNode): SessionNode[] => {
            const result: SessionNode[] = []
            for (const node of nodes) {
                const matches = node.name.toLowerCase().includes(query)
                const copy: SessionNode = {
                    ...node,
                    parent,
                    level: parent ? parent.level + 1 : 0,
                    expanded: node.type === 'folder' ? true : node.expanded,
                    children: [],
                }
                const filteredChildren = node.children.length ? filterTree(node.children, copy) : []
                if (matches || filteredChildren.length) {
                    copy.children = filteredChildren
                    result.push(copy)
                }
            }
            return result
        }

        this.nodes = filterTree(this.nodes)
    }

    private rebuildGroupMaps (): void {
        this.groupIdToPath.clear()
        this.groupPathToId.clear()
        for (const group of this.profileGroups) {
            const path = this.normalizeGroupPath(group.name)
            if (!path) {
                continue
            }
            this.groupIdToPath.set(group.id, path)
            this.groupPathToId.set(path, group.id)
        }
    }

    private normalizeGroupPath (path: string): string {
        return path.split('/').map(x => x.trim()).filter(Boolean).join('/')
    }

    private getFolderPathForNode (node: SessionNode | null): string {
        if (!node) {
            return ''
        }
        let current: SessionNode | undefined = node
        while (current) {
            if (current.type === 'folder' && current.groupPath) {
                return current.groupPath
            }
            current = current.parent
        }
        return ''
    }

    private async ensureProfileGroupForPath (path: string): Promise<string> {
        path = this.normalizeGroupPath(path)
        const existing = this.groupPathToId.get(path)
        if (existing) {
            return existing
        }
        await this.profilesService.newProfileGroup({ id: '', name: path })
        await this.config.save()
        await this.refresh()
        return this.groupPathToId.get(path) ?? path
    }

    private getDefaultProfileProvider (): ProfileProvider<Profile> | null {
        const providers = this.profilesService.getProviders()
        const ssh = providers.find(x => x.id === 'ssh')
        if (ssh) {
            return ssh
        }
        if (providers.length) {
            return providers[0]
        }
        return null
    }

    private async showProfileEditModal (profile: PartialProfile<Profile>, provider: ProfileProvider<Profile>): Promise<PartialProfile<Profile> | null> {
        const settingsModule = window['nodeRequire']('tabby-settings')
        const EditProfileModalComponent = settingsModule?.EditProfileModalComponent
        if (!EditProfileModalComponent) {
            throw new Error('tabby-settings does not export EditProfileModalComponent')
        }
        let modalRef: any = null
        try {
            modalRef = this.modal.open(EditProfileModalComponent, { size: 'lg' })
        } catch (e) {
            this.modal.dismissAll()
            throw e
        }

        modalRef.componentInstance.profile = deepClone(profile)
        modalRef.componentInstance.profileProvider = provider
        const result = await modalRef.result.catch(() => null)
        if (!result) {
            return null
        }
        result.type = provider.id
        return result
    }

    toggleFolder (node: SessionNode): void {
        if (node.type === 'folder') {
            node.expanded = !node.expanded
        }
    }

    onSessionClick (event: MouseEvent, node: SessionNode): void {
        if (event.ctrlKey || event.metaKey) {
            if (this.selectedNodes.has(node)) {
                this.selectedNodes.delete(node)
            } else {
                this.selectedNodes.add(node)
            }
        } else if (event.shiftKey) {
            if (this.selectedNodes.size > 0) {
                // Simple range selection: add to selection
                this.selectedNodes.add(node)
            } else {
                this.selectedNodes.add(node)
            }
        } else {
            this.selectedNodes.clear()
            this.selectedNodes.add(node)
        }
    }

    openSession (node: SessionNode | null): void {
        if (node?.type === 'folder') {
            this.toggleFolder(node)
        }
        if (node?.type === 'session' && node.profile) {
            void this.profilesService.openNewTabForProfile(node.profile)
        }
    }

    openSelected (): void {
        for (const node of this.selectedNodes) {
            if (node.type === 'session') {
                this.openSession(node)
            }
        }
    }

    async openFileZilla (): Promise<void> {
        const nodes = Array.from(this.selectedNodes).filter(n => n.type === 'session' && n.profile?.type === 'ssh')

        if (nodes.length === 0) {
            return
        }

        const config = this.config.store.ssh
        let fileZillaPath = config.fileZillaPath

        const nodeRequire = (window as any).nodeRequire ?? (window as any).require
        if (!nodeRequire) {
            this.notifications.error('Could not launch FileZilla: Node.js integration is not available')
            return
        }
        const fs = nodeRequire('fs')

        if (fileZillaPath && !fs.existsSync(fileZillaPath)) {
            fileZillaPath = null
        }

        if (!fileZillaPath) {
            fileZillaPath = await this.platformService.getFileZillaPath()

            if (!fileZillaPath) {
                if (this.hostApp.platform === Platform.Windows) {
                    const os = nodeRequire('os')
                    const path = nodeRequire('path')
                    const userProfile = process.env.USERPROFILE || os.homedir()
                    const candidates: string[] = [
                        'C:\\Program Files\\TabFTP Client\\tabftp.exe',
                        'C:\\Program Files (x86)\\TabFTP Client\\tabftp.exe',
                        path.join(userProfile, 'AppData', 'Local', 'TabFTP Client', 'tabftp.exe'),
                        path.join(userProfile, 'AppData', 'Roaming', 'TabFTP Client', 'tabftp.exe'),
                        'C:\\Program Files\\FileZilla FTP Client\\filezilla.exe',
                        'C:\\Program Files (x86)\\FileZilla FTP Client\\filezilla.exe',
                        path.join(userProfile, 'AppData', 'Local', 'FileZilla FTP Client', 'filezilla.exe'),
                        path.join(userProfile, 'AppData', 'Roaming', 'FileZilla FTP Client', 'filezilla.exe'),
                    ]
                    fileZillaPath = candidates.find(p => fs.existsSync(p)) ?? null
                } else if (this.hostApp.platform === Platform.macOS) {
                    fileZillaPath = '/Applications/FileZilla.app/Contents/MacOS/filezilla'
                } else {
                    const os = nodeRequire('os')
                    const candidates: string[] = [
                        '/usr/bin/tabftp',
                        '/usr/local/bin/tabftp',
                        '/opt/tabftp/tabftp',
                        `${os.homedir()}/.local/bin/tabftp`,
                        '/usr/bin/filezilla',
                        '/usr/local/bin/filezilla',
                        '/opt/filezilla/filezilla',
                        `${os.homedir()}/.local/bin/filezilla`,
                    ]
                    fileZillaPath = candidates.find(p => fs.existsSync(p)) ?? null
                }
            }

            if (fileZillaPath && !fs.existsSync(fileZillaPath)) {
                fileZillaPath = null
            }
            if (fileZillaPath) {
                config.fileZillaPath = fileZillaPath
                await this.config.save()
            } else {
                this.notifications.error('未检测到系统安装FileZilla或TabFTP，请安装后才能使用跳转FileZilla功能')
                return
            }
        }

        for (const node of nodes) {
            if (!node.profile) {
                continue
            }
            const profile = node.profile
            const args: string[] = []
            const options = profile.options ?? {}

            const user = options.user ?? ''
            const rawHost = options.host ?? ''
            const host = rawHost.includes(':') ? `[${rawHost}]` : rawHost
            const portForKey = options.port
            const portForUrl = options.port ?? 22

            if (config.fileZillaScheme === 2) {
                const siteName = (config.fileZillaSiteNamePrefix ?? '') + profile.name
                args.push(`--site=${siteName}`)
            } else {
                const auth = await this.loadSSHAuth(rawHost, portForKey, user, options.password)
                if (auth) {
                    const encodedUser = encodeURIComponent(auth.user)
                    const encodedPass = encodeURIComponent(auth.password)
                    args.push(`sftp://${encodedUser}:${encodedPass}@${host}:${portForUrl}`)
                } else {
                    const normalizedUser = user.trim()
                    const userPart = normalizedUser ? `${encodeURIComponent(normalizedUser)}@` : ''
                    args.push(`sftp://${userPart}${host}:${portForUrl}`)
                }
            }

            const cp = nodeRequire('child_process')
            const pathModule = nodeRequire('path')

            // For AppImage files on Linux, we need special handling
            const fileZillaDir = pathModule.dirname(fileZillaPath)
            const env = { ...process.env }
            const isAppImage = this.hostApp.platform === Platform.Linux && fileZillaPath.toLowerCase().endsWith('.appimage')

            if (this.hostApp.platform === Platform.Linux) {
                // Set LD_LIBRARY_PATH to help find libfuse.so.2
                env.LD_LIBRARY_PATH = fileZillaDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '')
            }

            // For AppImage, use --appimage-extract-and-run to avoid FUSE dependency
            const finalArgs = isAppImage ? ['--appimage-extract-and-run', ...args] : args

            // Use spawn with detached mode to run FileZilla independently
            // This prevents GTK warnings from being captured as errors when FileZilla closes
            try {
                const child = cp.spawn(fileZillaPath, finalArgs, {
                    env,
                    detached: true,
                    stdio: 'ignore',
                })
                child.unref()
            } catch (error) {
                this.notifications.error(`Could not launch FileZilla: ${error.message}`)
            }
        }
    }

    private async loadSSHAuth (host: string, port: number|undefined, preferredUser: string, fallbackPassword: string|undefined): Promise<{ user: string, password: string }|null> {
        const normalizedPreferredUser = preferredUser.trim()

        if (this.vault.isEnabled()) {
            if (normalizedPreferredUser) {
                const secret = await this.vault.getSecret('ssh:password', { user: normalizedPreferredUser, host, port })
                if (secret?.value) {
                    return { user: normalizedPreferredUser, password: secret.value }
                }
            }

            try {
                const vault = await this.vault.load()
                const matches = vault?.secrets
                    .filter(x => x.type === 'ssh:password')
                    .filter(x => (x.key as any)?.host === host)
                    .filter(x => ((x.key as any)?.port ?? undefined) === port)

                if (matches?.length) {
                    const preferred = normalizedPreferredUser ? matches.find(s => (s.key as any)?.user === normalizedPreferredUser) : null
                    const picked = preferred ?? matches[0]
                    const pickedUser = ((picked.key as any)?.user ?? '').toString()
                    const pickedPassword = picked.value
                    if (pickedUser && pickedPassword) {
                        return { user: pickedUser, password: pickedPassword }
                    }
                }
            } catch {
            }
        } else {
            try {
                const nodeRequire = (window as any).nodeRequire
                const keytar = nodeRequire?.('keytar')
                if (!keytar) {
                    return fallbackPassword && normalizedPreferredUser ? { user: normalizedPreferredUser, password: fallbackPassword } : null
                }

                const serviceKeys: string[] = []
                if (port) {
                    serviceKeys.push(`ssh@${host}:${port}`)
                }
                serviceKeys.push(`ssh@${host}`)
                if (!port) {
                    serviceKeys.push(`ssh@${host}:22`)
                }

                for (const serviceKey of serviceKeys) {
                    if (normalizedPreferredUser) {
                        const password = await keytar.getPassword(serviceKey, normalizedPreferredUser)
                        if (password) {
                            return { user: normalizedPreferredUser, password }
                        }
                    }

                    const credentials = await keytar.findCredentials(serviceKey)
                    if (credentials?.length) {
                        const preferred = normalizedPreferredUser ? credentials.find(c => c.account === normalizedPreferredUser) : null
                        const picked = preferred ?? credentials[0]
                        if (picked?.account && picked?.password) {
                            return { user: picked.account, password: picked.password }
                        }
                    }
                }
            } catch {
            }
        }

        return fallbackPassword && normalizedPreferredUser ? { user: normalizedPreferredUser, password: fallbackPassword } : null
    }

    onDragStart (event: DragEvent, node: SessionNode): void {
        this.dragNode = node
        if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', node.id)
            event.dataTransfer.effectAllowed = 'move'
        }
    }

    onDragOver (event: DragEvent, node: SessionNode): void {
        if (!this.dragNode) {
            return
        }
        if (node.id === this.dragNode.id) {
            return
        }

        event.preventDefault()
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
        }
    }

    async onDrop (event: DragEvent, targetNode: SessionNode): Promise<void> {
        event.preventDefault()
        if (!this.dragNode) {
            return
        }

        if (this.dragNode.type === 'session' && this.dragNode.profile) {
            const targetPath = targetNode.type === 'folder' ? this.getFolderPathForNode(targetNode) : this.getFolderPathForNode(targetNode.parent ?? null)
            if (targetPath) {
                this.dragNode.profile.group = await this.ensureProfileGroupForPath(targetPath)
            } else {
                delete this.dragNode.profile.group
            }
            await this.profilesService.writeProfile(this.dragNode.profile)
            await this.config.save()
            await this.refresh()
        }

        this.dragNode = null
    }

    contextMenu: { visible: boolean, x: number, y: number, node: SessionNode | null } = {
        visible: false,
        x: 0,
        y: 0,
        node: null as SessionNode | null,
    }

    onContextMenu (event: MouseEvent, node: SessionNode | null): void {
        event.preventDefault()
        event.stopPropagation()

        if (node && !this.selectedNodes.has(node)) {
            this.selectedNodes.clear()
            this.selectedNodes.add(node)
        }

        this.contextMenu = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            node,
        }
    }

    openInNewTab (node: SessionNode | null): void {
        if (node?.profile) {
            void this.profilesService.openNewTabForProfile(node.profile)
        }
    }

    async editSession (node: SessionNode | null): Promise<void> {
        if (!node?.profile) {
            return
        }
        const provider = this.profilesService.providerForProfile(node.profile)
        if (!provider) {
            return
        }
        try {
            const result = await this.showProfileEditModal(node.profile, provider)
            if (!result) {
                return
            }
            await this.profilesService.writeProfile(result)
            await this.config.save()
            await this.refresh()
        } catch (err) {
            console.error('Failed to load settings module', err)
        }
    }

    async copySession (node: SessionNode | null): Promise<void> {
        if (!node?.profile) {
            return
        }
        const newProfile = deepClone(node.profile)
        newProfile.name = `${newProfile.name} (Copy)`
        await this.profilesService.newProfile(newProfile)
        await this.config.save()
        await this.refresh()
    }

    async createSession (node: SessionNode | null): Promise<void> {
        const provider = this.getDefaultProfileProvider()
        if (!provider) {
            return
        }
        const folderPath = this.getFolderPathForNode(node)
        const groupId = folderPath ? await this.ensureProfileGroupForPath(folderPath) : undefined

        const newProfile: PartialProfile<Profile> = {
            type: provider.id,
            name: 'New Session',
            group: groupId,
            options: {},
            disableDynamicTitle: false,
            behaviorOnSessionEnd: 'auto',
            weight: 0,
            isBuiltin: false,
            isTemplate: false,
        }

        try {
            const result = await this.showProfileEditModal(newProfile, provider)
            if (!result) {
                return
            }
            await this.profilesService.newProfile(result)
            await this.config.save()
            await this.refresh()
        } catch (err) {
            console.error(err)
        }
    }

    async createFolder (node: SessionNode | null): Promise<void> {
        const modal = this.modal.open(PromptModalComponent)
        modal.componentInstance.prompt = 'New folder name'
        const name = (await modal.result.catch(() => null))?.value?.trim()
        if (!name) {
            return
        }
        const parentPath = this.getFolderPathForNode(node)
        const newPath = this.normalizeGroupPath(parentPath ? `${parentPath}/${name}` : name)
        if (!newPath) {
            return
        }
        if (this.groupPathToId.has(newPath)) {
            return
        }
        await this.profilesService.newProfileGroup({ id: '', name: newPath })
        await this.config.save()
        await this.refresh()
    }

    async deleteNode (node: SessionNode | null): Promise<void> {
        if (!node) {
            return
        }
        if (!confirm(`Delete ${node.name}?`)) {
            return
        }

        if (node.type === 'session' && node.profile) {
            await this.profilesService.deleteProfile(node.profile)
        } else {
            const path = this.getFolderPathForNode(node)
            const groupIdsToDelete = this.profileGroups
                .filter(g => this.normalizeGroupPath(g.name) === path || this.normalizeGroupPath(g.name).startsWith(`${path}/`))
                .map(g => g.id)
            for (const groupId of groupIdsToDelete) {
                await this.profilesService.deleteProfileGroup({ id: groupId, name: '' }, { deleteProfiles: true })
            }
        }

        await this.config.save()
        await this.refresh()
    }

    async exportProfiles (): Promise<void> {
        const profiles = await this.profilesService.getProfiles({ includeBuiltin: false })
        const json = JSON.stringify(profiles, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'tabby-sessions.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    async importProfiles (): Promise<void> {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async (event: any) => {
            const file = event.target.files[0]
            if (!file) {
                return
            }
            const text = await file.text()
            try {
                const profiles = JSON.parse(text)
                if (Array.isArray(profiles)) {
                    if (confirm('Replace existing profiles? Cancel to merge.')) {
                        await this.profilesService.bulkDeleteProfiles(() => true)
                    }
                    for (const p of profiles) {
                        p.id = uuidv4()
                        await this.profilesService.newProfile(p)
                    }
                    await this.refresh()
                }
            } catch (err) {
                alert('Invalid JSON')
            }
        }
        input.click()
    }
}
