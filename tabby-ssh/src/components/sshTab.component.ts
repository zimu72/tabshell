import * as russh from 'russh'
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker'
import colors from 'ansi-colors'
import { Component, Injector, HostListener } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Platform, ProfilesService, PlatformService } from 'tabby-core'
import { BaseTerminalTabComponent, ConnectableTerminalTabComponent } from 'tabby-terminal'
import { SSHService } from '../services/ssh.service'
import { PasswordStorageService } from '../services/passwordStorage.service'
import { KeyboardInteractivePrompt, SSHSession } from '../session/ssh'
import { SSHPortForwardingModalComponent } from './sshPortForwardingModal.component'
import { SSHProfile } from '../api'
import { SSHShellSession } from '../session/shell'
import { SSHMultiplexerService } from '../services/sshMultiplexer.service'

/** @hidden */
@Component({
    selector: 'ssh-tab',
    template: `${BaseTerminalTabComponent.template} ${require('./sshTab.component.pug')}`,
    styles: [
        ...BaseTerminalTabComponent.styles,
        require('./sshTab.component.scss'),
    ],
    animations: BaseTerminalTabComponent.animations,
})
export class SSHTabComponent extends ConnectableTerminalTabComponent<SSHProfile> {
    Platform = Platform
    sshSession: SSHSession|null = null
    session: SSHShellSession|null = null
    sftpPanelVisible = false
    sftpPath = '/'
    enableToolbar = true
    activeKIPrompt: KeyboardInteractivePrompt|null = null

    constructor (
        injector: Injector,
        public ssh: SSHService,
        private passwordStorage: PasswordStorageService,
        private ngbModal: NgbModal,
        private profilesService: ProfilesService,
        private sshMultiplexer: SSHMultiplexerService,
        private platformService: PlatformService,
    ) {
        super(injector)
        this.sessionChanged$.subscribe(() => {
            this.activeKIPrompt = null
        })
    }

    ngOnInit (): void {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (!this.hasFocus) {
                return
            }
            switch (hotkey) {
                case 'home':
                    this.sendInput('\x1bOH' )
                    break
                case 'end':
                    this.sendInput('\x1bOF' )
                    break
                case 'restart-ssh-session':
                    this.reconnect()
                    break
                case 'launch-winscp':
                    if (this.sshSession) {
                        this.ssh.launchWinSCP(this.sshSession)
                    }
                    break
            }
        })

        super.ngOnInit()
    }

    async setupOneSession (injector: Injector, profile: SSHProfile, multiplex = true): Promise<SSHSession> {
        let session = await this.sshMultiplexer.getSession(profile)
        if (!multiplex || !session || !profile.options.reuseSession) {
            session = new SSHSession(injector, profile)

            if (profile.options.jumpHost) {
                const jumpConnection = (await this.profilesService.getProfiles()).find(x => x.id === profile.options.jumpHost)

                if (!jumpConnection) {
                    throw new Error(`${profile.options.host}: jump host "${profile.options.jumpHost}" not found in your config`)
                }

                const jumpSession = await this.setupOneSession(
                    this.injector,
                    this.profilesService.getConfigProxyForProfile<SSHProfile>(jumpConnection),
                )

                jumpSession.ref()
                session.willDestroy$.subscribe(() => jumpSession.unref())
                jumpSession.willDestroy$.subscribe(() => {
                    if (session?.open) {
                        session.destroy()
                    }
                })

                if (!(jumpSession.ssh instanceof russh.AuthenticatedSSHClient)) {
                    throw new Error('Jump session is not authenticated yet somehow')
                }

                try {
                    session.jumpChannel = await jumpSession.ssh.openTCPForwardChannel({
                        addressToConnectTo: profile.options.host,
                        portToConnectTo: profile.options.port ?? 22,
                        originatorAddress: '127.0.0.1',
                        originatorPort: 0,
                    })
                } catch (err) {
                    jumpSession.emitServiceMessage(colors.bgRed.black(' X ') + ` Could not set up port forward on ${jumpConnection.name}`)
                    throw err
                }
            }
        }

        this.attachSessionHandler(session.serviceMessage$, msg => {
            msg = msg.replace(/\n/g, '\r\n      ')
            this.write(`\r${colors.black.bgWhite(' SSH ')} ${msg}\r\n`)
        })

        this.attachSessionHandler(session.willDestroy$, () => {
            this.activeKIPrompt = null
        })

        this.attachSessionHandler(session.keyboardInteractivePrompt$, prompt => {
            this.activeKIPrompt = prompt
            setTimeout(() => {
                this.frontend?.scrollToBottom()
            })
        })

        if (!session.open) {
            this.write('\r\n' + colors.black.bgWhite(' SSH ') + ` Connecting to ${session.profile.name}\r\n`)

            this.startSpinner(this.translate.instant(_('Connecting')))

            try {
                await session.start()
            } finally {
                this.stopSpinner()
            }

            this.sshMultiplexer.addSession(session)
        }

        return session
    }

    protected onSessionDestroyed (): void {
        if (this.frontend) {
            // Session was closed abruptly
            this.write('\r\n' + colors.black.bgWhite(' SSH ') + ` ${this.sshSession?.profile.options.host}: session closed\r\n`)

            super.onSessionDestroyed()
        }
    }

    private async initializeSessionMaybeMultiplex (multiplex = true): Promise<void> {
        this.sshSession = await this.setupOneSession(this.injector, this.profile, multiplex)
        const session = new SSHShellSession(this.injector, this.sshSession, this.profile)

        this.setSession(session)
        this.attachSessionHandler(session.serviceMessage$, msg => {
            msg = msg.replace(/\n/g, '\r\n      ')
            this.write(`\r${colors.black.bgWhite(' SSH ')} ${msg}\r\n`)
            session.resize(this.size.columns, this.size.rows)
        })

        await session.start()

        this.session?.resize(this.size.columns, this.size.rows)
    }

    async initializeSession (): Promise<void> {
        await super.initializeSession()
        try {
            await this.initializeSessionMaybeMultiplex(true)
        } catch {
            try {
                await this.initializeSessionMaybeMultiplex(false)
            } catch (e) {
                console.error('SSH session initialization failed', e)
                this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
                return
            }
        }
    }

    showPortForwarding (): void {
        const modal = this.ngbModal.open(SSHPortForwardingModalComponent).componentInstance as SSHPortForwardingModalComponent
        modal.session = this.sshSession!
    }

    async canClose (): Promise<boolean> {
        if (!this.session?.open) {
            return true
        }
        if (!(this.profile.options.warnOnClose ?? this.config.store.ssh.warnOnClose)) {
            return true
        }
        return (await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant(_('Disconnect from {host}?'), this.profile.options),
                buttons: [
                    this.translate.instant(_('Disconnect')),
                    this.translate.instant(_('Do not close')),
                ],
                defaultId: 0,
                cancelId: 1,
            },
        )).response === 0
    }

    async openFileZilla (): Promise<void> {
        const config = this.config.store.ssh

        const nodeRequire = (window as any).nodeRequire ?? (window as any).require
        if (!nodeRequire) {
            this.notifications.error('Could not launch FileZilla: Node.js integration is not available')
            return
        }
        const fs = nodeRequire('fs')
        const os = nodeRequire('os')
        const path = nodeRequire('path')
        const isUsablePath = (p: string): boolean => {
            if (!p) {
                return false
            }
            try {
                const stat = fs.statSync(p)
                if (!stat.isFile()) {
                    return false
                }
                if (this.hostApp.platform === Platform.Linux || this.hostApp.platform === Platform.macOS) {
                    fs.accessSync(p, fs.constants.X_OK)
                }
                return true
            } catch {
                return false
            }
        }

        const resolveFileZillaPath = async (ignoreConfig = false): Promise<string|null> => {
            let pathToUse = ignoreConfig ? null : config.fileZillaPath
            if (pathToUse && !isUsablePath(pathToUse)) {
                pathToUse = null
            }
            if (!pathToUse) {
                pathToUse = await this.platformService.getFileZillaPath()
                if (pathToUse && !isUsablePath(pathToUse)) {
                    pathToUse = null
                }
            }
            if (!pathToUse) {
                if (this.hostApp.platform === Platform.Windows) {
                    const userProfile = process.env.USERPROFILE ?? os.homedir()
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
                    pathToUse = candidates.find(p => isUsablePath(p)) ?? null
                } else if (this.hostApp.platform === Platform.macOS) {
                    pathToUse = '/Applications/FileZilla.app/Contents/MacOS/filezilla'
                } else {
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
                    pathToUse = candidates.find(p => isUsablePath(p)) ?? null
                }
                if (pathToUse && !isUsablePath(pathToUse)) {
                    pathToUse = null
                }
            }
            if (pathToUse) {
                config.fileZillaPath = pathToUse
                await this.config.save()
            }
            return pathToUse
        }

        let resolvedPath = await resolveFileZillaPath(false)
        if (!resolvedPath) {
            this.notifications.error(this.translate.instant('未检测到系统安装FileZilla或TabFTP，请安装后才能使用跳转FileZilla功能'))
            return
        }

        let cwd = '/'
        if (config.fileZillaGetCwd) {
            try {
                const pwd = await this.executePwdCommand()
                if (pwd.trim()) {
                    cwd = pwd.trim()
                } else {
                    cwd = await this.session?.getWorkingDirectory() ?? '/'
                }
            } catch {
                cwd = await this.session?.getWorkingDirectory() ?? '/'
            }
        }

        if (!cwd.startsWith('/')) {
            cwd = '/' + cwd
        }

        cwd = cwd.split('/').map(p => encodeURIComponent(p)).join('/')

        const user = this.profile.options.user
        const rawHost = this.profile.options.host
        const host = rawHost.includes(':') ? `[${rawHost}]` : rawHost
        const port = this.profile.options.port ?? 22

        const args: string[] = []

        const scheme = config.fileZillaScheme

        if (scheme === 2) {
            const siteName = (config.fileZillaSiteNamePrefix || '') + this.profile.name
            args.push(`--site=${siteName}`)
        } else {
            const authUsername = (this.sshSession?.authUsername ?? user).toString()

            const password = this.sshSession?.runtimePassword
                ?? this.sshSession?.savedPassword
                ?? await this.passwordStorage.loadPassword(this.profile, authUsername)
                ?? this.profile.options.password

            const authPart = authUsername
                ? `${encodeURIComponent(authUsername)}${password ? `:${encodeURIComponent(password)}` : ''}@`
                : ''
            const url = `sftp://${authPart}${host}:${port}${cwd}`
            args.push(url)
        }

        const cp = nodeRequire('child_process')

        // For AppImage files on Linux, we need special handling
        const fileZillaDir = path.dirname(resolvedPath)
        const env = { ...process.env }
        const isAppImage = this.hostApp.platform === Platform.Linux && resolvedPath.toLowerCase().endsWith('.appimage')

        if (this.hostApp.platform === Platform.Linux) {
            // Set LD_LIBRARY_PATH to help find libfuse.so.2
            env.LD_LIBRARY_PATH = fileZillaDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '')
        }

        // For AppImage, use --appimage-extract-and-run to avoid FUSE dependency
        const finalArgs = isAppImage ? ['--appimage-extract-and-run', ...args] : args

        // Use spawn with detached mode to run FileZilla independently
        // This prevents GTK warnings from being captured as errors when FileZilla closes
        try {
            const child = cp.spawn(resolvedPath, finalArgs, {
                env,
                detached: true,
                stdio: 'ignore',
            })
            child.unref()
        } catch (error) {
            resolvedPath = await resolveFileZillaPath(true)
            if (!resolvedPath) {
                this.notifications.error(`Could not launch FileZilla: ${error.message}`)
                return
            }
            const fallbackDir = path.dirname(resolvedPath)
            const fallbackEnv = { ...process.env }
            const fallbackIsAppImage = this.hostApp.platform === Platform.Linux && resolvedPath.toLowerCase().endsWith('.appimage')
            if (this.hostApp.platform === Platform.Linux) {
                fallbackEnv.LD_LIBRARY_PATH = fallbackDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '')
            }
            const fallbackArgs = fallbackIsAppImage ? ['--appimage-extract-and-run', ...args] : args
            try {
                const child = cp.spawn(resolvedPath, fallbackArgs, {
                    env: fallbackEnv,
                    detached: true,
                    stdio: 'ignore',
                })
                child.unref()
            } catch (fallbackError) {
                this.notifications.error(`Could not launch FileZilla: ${fallbackError.message}`)
            }
        }
    }

    async executePwdCommand (): Promise<string> {
        if (!this.session) {
            return ''
        }
        return new Promise((resolve) => {
            let output = ''
            const handler = (data: string) => { output += data }

            const sub = this.session!.output$.subscribe(handler)
            this.session!.write(Buffer.from('pwd\r'))

            setTimeout(() => {
                sub.unsubscribe()

                const lines = output.replace(/\r/g, '').split('\n')
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim()
                    if (line.startsWith('/')) {
                        resolve(line)
                        return
                    }
                }
                resolve('')
            }, 1000)
        })
    }

    async openSFTP (): Promise<void> {
        this.sftpPath = await this.session?.getWorkingDirectory() ?? this.sftpPath
        setTimeout(() => {
            this.sftpPanelVisible = true
        }, 100)
    }

    @HostListener('click')
    onClick (): void {
        this.sftpPanelVisible = false
    }

    protected isSessionExplicitlyTerminated (): boolean {
        return super.isSessionExplicitlyTerminated() ||
        this.recentInputs.charCodeAt(this.recentInputs.length - 1) === 4 ||
        this.recentInputs.endsWith('exit\r')
    }
}
