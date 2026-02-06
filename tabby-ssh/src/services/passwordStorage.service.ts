import * as keytar from 'keytar'
import { Injectable } from '@angular/core'
import { ConfigService, NotificationsService, VaultService } from 'tabby-core'
import { SSHProfile } from '../api'

export const VAULT_SECRET_TYPE_PASSWORD = 'ssh:password'
export const VAULT_SECRET_TYPE_PASSPHRASE = 'ssh:key-passphrase'

@Injectable({ providedIn: 'root' })
export class PasswordStorageService {
    constructor (
        private vault: VaultService,
        private config: ConfigService,
        private notifications: NotificationsService,
    ) { }

    async savePassword (profile: SSHProfile, password: string, username?: string): Promise<void> {
        const account = username ?? profile.options.user
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForConnection(profile, account)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSWORD, key, value: password })
            profile.options.password = undefined
            return
        } else {
            try {
                if (!account) {
                    profile.options.password = password
                    await this.config.save()
                    return
                }
                const key = this.getKeytarKeyForConnection(profile)
                await this.withTimeout(keytar.setPassword(key, account, password), 3000)
                profile.options.password = undefined
            } catch (e) {
                console.warn('Keytar failed to save password, falling back to config:', e)
                profile.options.password = password
                try {
                    await this.config.save()
                    this.notifications.notice('Saved password in profile config')
                } catch {
                    this.notifications.error('Could not save password', this.formatKeytarError(e))
                    throw e
                }
            }
        }
    }

    async deletePassword (profile: SSHProfile, username?: string): Promise<void> {
        const account = username ?? profile.options.user
        profile.options.password = undefined
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForConnection(profile, account)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSWORD, key)
        } else {
            try {
                if (account) {
                    const key = this.getKeytarKeyForConnection(profile)
                    await this.withTimeout(keytar.deletePassword(key, account), 3000)
                }
            } catch (e) {
                console.warn('Keytar failed to delete password:', e)
            }
        }
        try {
            await this.config.save()
        } catch { }
    }

    async loadPassword (profile: SSHProfile, username?: string): Promise<string|null> {
        const account = username ?? profile.options.user
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForConnection(profile, account)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSWORD, key))?.value ?? null
        } else {
            if (!account) {
                return profile.options.password ?? null
            }
            const key = this.getKeytarKeyForConnection(profile)
            try {
                const keytarPassword = await this.withTimeout(keytar.getPassword(key, account), 3000)
                if (keytarPassword) {
                    profile.options.password = undefined
                    return keytarPassword
                }
            } catch (e) {
                console.warn('Could not load password from keytar:', e)
            }
            return profile.options.password ?? null
        }
    }

    async savePrivateKeyPassword (id: string, password: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.addSecret({ type: VAULT_SECRET_TYPE_PASSPHRASE, key, value: password })
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            try {
                await this.withTimeout(keytar.setPassword(key, 'user', password), 3000)
            } catch (e) {
                this.notifications.error('Could not save key passphrase', this.formatKeytarError(e))
                throw e
            }
        }
    }

    async deletePrivateKeyPassword (id: string): Promise<void> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            await this.vault.removeSecret(VAULT_SECRET_TYPE_PASSPHRASE, key)
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            try {
                await this.withTimeout(keytar.deletePassword(key, 'user'), 3000)
            } catch (e) {
                this.notifications.error('Could not delete key passphrase', this.formatKeytarError(e))
                throw e
            }
        }
    }

    async loadPrivateKeyPassword (id: string): Promise<string|null> {
        if (this.vault.isEnabled()) {
            const key = this.getVaultKeyForPrivateKey(id)
            return (await this.vault.getSecret(VAULT_SECRET_TYPE_PASSPHRASE, key))?.value ?? null
        } else {
            const key = this.getKeytarKeyForPrivateKey(id)
            try {
                return await this.withTimeout(keytar.getPassword(key, 'user'), 3000)
            } catch {
                return null
            }
        }
    }

    private withTimeout<T> (promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Keytar timeout')), ms)),
        ])
    }

    private formatKeytarError (error: unknown): string|undefined {
        const message = error instanceof Error ? error.message : `${error}`
        if (!message || message === 'undefined') {
            return undefined
        }
        if (process.platform !== 'linux') {
            return message
        }
        if (message.includes('org.freedesktop.secrets')) {
            return `${message}\n\nMissing Secret Service provider. On Ubuntu this is usually gnome-keyring.`
        }
        if (message.includes('No such file or directory') && message.includes('libsecret')) {
            return `${message}\n\nMissing libsecret runtime (libsecret-1.so.0).`
        }
        return message
    }

    private getKeytarKeyForConnection (profile: SSHProfile): string {
        let key = `ssh@${profile.options.host}`
        if (profile.options.port) {
            key = `ssh@${profile.options.host}:${profile.options.port}`
        }
        return key
    }

    private getKeytarKeyForPrivateKey (id: string): string {
        return `ssh-private-key:${id}`
    }

    private getVaultKeyForConnection (profile: SSHProfile, username?: string) {
        return {
            user: username ?? profile.options.user,
            host: profile.options.host,
            port: profile.options.port,
        }
    }

    private getVaultKeyForPrivateKey (id: string) {
        return { hash: id }
    }
}
