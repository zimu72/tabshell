import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class SSHConfigProvider extends ConfigProvider {
    defaults = {
        ssh: {
            warnOnClose: false,
            winSCPPath: null,
            agentType: 'auto',
            agentPath: null,
            x11Display: null,
            knownHosts: [],
            verifyHostKeys: true,
            fileZillaPath: null,
            fileZillaScheme: 0,
            fileZillaSiteNamePrefix: '',
            fileZillaFallbackScheme: 0,
            fileZillaGetCwd: true,
            fileZillaSilent: false,
            fileZillaTimeout: 30,
        },
        hotkeys: {
            'restart-ssh-session': [],
            'launch-winscp': [],
        },
    }

    platformDefaults = { }
}
