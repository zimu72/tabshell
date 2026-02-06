import { Component, HostBinding } from '@angular/core'
import { X11Socket } from '../session/x11'
import { ConfigService, HostAppService, Platform, NotificationsService, PlatformService } from 'tabby-core'

/** @hidden */
@Component({
    templateUrl: './sshSettingsTab.component.pug',
})
export class SSHSettingsTabComponent {
    Platform = Platform
    defaultX11Display: string
    defaultFileZillaPath: string

    @HostBinding('class.content-box') true

    constructor (
        public config: ConfigService,
        public hostApp: HostAppService,
        private notifications: NotificationsService,
        private platformService: PlatformService,
    ) {
        const spec = X11Socket.resolveDisplaySpec()
        if ('path' in spec) {
            this.defaultX11Display = spec.path
        } else {
            this.defaultX11Display = `${spec.host}:${spec.port}`
        }

        if (hostApp.platform === Platform.Windows) {
            this.defaultFileZillaPath = 'C:\\Program Files\\FileZilla FTP Client\\filezilla.exe'
        } else if (hostApp.platform === Platform.macOS) {
            this.defaultFileZillaPath = '/Applications/FileZilla.app/Contents/MacOS/filezilla'
        } else {
            this.defaultFileZillaPath = '/usr/bin/filezilla'
        }
    }

    async testFileZilla (): Promise<void> {
        let pathToCheck = this.config.store.ssh.fileZillaPath
        if (!pathToCheck) {
            pathToCheck = await this.platformService.getFileZillaPath()
        }
        if (!pathToCheck) {
            pathToCheck = this.defaultFileZillaPath
        }
        try {
            const nodeRequire = (window as any).nodeRequire ?? (window as any).require
            if (!nodeRequire) {
                this.notifications.error('Could not check FileZilla path: Node.js integration is not available')
                return
            }
            const fs = nodeRequire('fs')
            if (fs.existsSync(pathToCheck)) {
                this.notifications.info('FileZilla found!')
            } else {
                this.notifications.error('FileZilla not found at ' + pathToCheck)
            }
        } catch (e) {
            this.notifications.error('Could not check FileZilla path: ' + (e as Error).message)
        }
    }
}
