import { Component, Output, EventEmitter } from '@angular/core'
import { AppService } from '../services/app.service'
import { BaseTabComponent } from './baseTab.component'
import { PlatformService } from '../api/platform'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

type ComposerMode = 'broadcast' | 'buffered'

@Component({
    selector: 'command-composer',
    templateUrl: './commandComposer.component.pug',
    styleUrls: ['./commandComposer.component.scss'],
})
export class CommandComposerComponent {
    @Output() close = new EventEmitter()
    input = ''
    mode: ComposerMode = 'broadcast'
    history: string[] = []
    historyIndex = -1

    completionResults: string[] = []
    completionIndex = 0

    constructor (
        private app: AppService,
        private platform: PlatformService,
        private translate: TranslateService,
        private toastr: ToastrService,
    ) {}

    get targetCount (): number {
        return this.getTargetTabs().length
    }

    getTargetTabs (): BaseTabComponent[] {
        // Find all tabs that support sending input and have broadcast enabled
        return this.getAllConnectableTabs().filter(tab => {
            if (!tab.broadcastEnabled) {
                return false
            }
            // Check ancestors
            let parent = tab.parent
            while (parent) {
                if (!parent.broadcastEnabled) {
                    return false
                }
                parent = parent.parent
            }
            return true
        })
    }

    private applyToAllTabs (action: (tab: BaseTabComponent) => void) {
        // Apply to top level tabs (which might be containers)
        for (const tab of this.app.tabs) {
            action(tab)
            // If it's a container, apply to all its descendants
            if ('getAllTabs' in tab) {
                (tab as any).getAllTabs().forEach(action)
            }
        }
    }

    private getAllConnectableTabs (): BaseTabComponent[] {
        const tabs: BaseTabComponent[] = []
        const collectTabs = (list: BaseTabComponent[]) => {
            for (const tab of list) {
                if ('getAllTabs' in tab) {
                    collectTabs((tab as any).getAllTabs())
                } else {
                    if ('sendInput' in tab) {
                        tabs.push(tab)
                    }
                }
            }
        }
        collectTabs(this.app.tabs)
        return tabs
    }

    enableAll (): void {
        this.applyToAllTabs(tab => tab.broadcastEnabled = true)
    }

    disableAll (): void {
        this.applyToAllTabs(tab => tab.broadcastEnabled = false)
        this.toastr.info(this.translate.instant('All tabs disabled'))
    }

    onlyCurrent (): void {
        this.disableAll()

        let activeTab = this.app.activeTab
        // Recursively find the active leaf tab if the current active tab is a container (e.g. SplitTab)
        while (activeTab && 'getFocusedTab' in activeTab) {
            const focused = (activeTab as any).getFocusedTab()
            if (focused) {
                activeTab = focused
            } else {
                break
            }
        }

        if (activeTab) {
            activeTab.broadcastEnabled = true
            // Enable ancestors
            let parent = activeTab.parent
            while (parent) {
                parent.broadcastEnabled = true
                parent = parent.parent
            }
        }
    }

    invert (): void {
        this.applyToAllTabs(tab => tab.broadcastEnabled = !tab.broadcastEnabled)
    }

    send (content?: string): void {
        let text = content ?? this.input
        if (!text) {
            return
        }

        // Add to history
        this.history = this.history.filter(x => x !== text)
        this.history.unshift(text)
        if (this.history.length > 100) {
            this.history.pop()
        }
        this.historyIndex = -1
        this.completionResults = []

        const tabs = this.getTargetTabs()
        if (tabs.length === 0) {
            this.toastr.warning(this.translate.instant('No active sessions to send commands to'))
            return
        }

        // Replace newlines with carriage returns for terminal execution
        text = text.replace(/\n/g, '\r')

        // Append carriage return if not present to trigger execution
        if (!text.endsWith('\r')) {
            text += '\r'
        }

        const data = Buffer.from(text)
        for (const tab of tabs) {
            try {
                (tab as any).sendInput(data)
            } catch (e) {
                console.error('Failed to send input to tab', tab.title, e)
            }
        }

        if (this.mode === 'buffered') {
            this.history.push(this.input)
            this.input = ''
        }
    }

    onInput (): void {
        if (this.mode === 'broadcast') {
            // In broadcast mode, we send characters immediately
            // But we need to handle this carefully.
            // Actually, ngModelChange fires after the value changed.
            // For true real-time character-by-character, we might need a different approach
            // because `input` will contain the whole text.
            // But if we just clear `input` after sending, it works for single chars.
            // However, that breaks backspace and cursor movement if we aren't careful.

            // "Real-time" implies sending keystrokes.
            // The MultifocusService sends raw input data from one terminal to others.
            // Here we are typing in a textarea.

            // Simple implementation: Send the diff? Or just use keydown.
        }
    }

    async onKeyDown (event: KeyboardEvent): Promise<void> {
        if (this.completionResults.length > 0) {
            if (event.key === 'ArrowUp') {
                event.preventDefault()
                this.completionIndex = Math.max(0, this.completionIndex - 1)
                return
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault()
                this.completionIndex = Math.min(this.completionResults.length - 1, this.completionIndex + 1)
                return
            }
            if (event.key === 'Tab') {
                event.preventDefault()
                this.completionIndex = (this.completionIndex + 1) % this.completionResults.length
                return
            }
            if (event.key === 'Enter') {
                event.preventDefault()
                this.applyCompletion(this.completionResults[this.completionIndex])
                return
            }
            if (event.key === 'Escape') {
                event.preventDefault()
                this.completionResults = []
                return
            }
        }

        // History navigation (Buffered mode only)
        if (this.mode === 'buffered') {
            if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++
                    this.input = this.history[this.historyIndex]
                }
                return
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (this.historyIndex > -1) {
                    this.historyIndex--
                    this.input = this.historyIndex === -1 ? '' : this.history[this.historyIndex]
                }
                return
            }
        }

        if (this.mode === 'broadcast') {
            // In broadcast mode, we intercept keys and send them
            // We prevent default to stop the textarea from filling up,
            // effectively acting as a "passthrough" keyboard

            event.preventDefault()

            // Handle special keys
            let data: Buffer | string | null = null

            if (event.key === 'Enter') {
                data = '\r'
            } else if (event.key === 'Backspace') {
                data = '\x7f'
            } else if (event.key === 'ArrowUp') {
                data = '\x1b[A'
            } else if (event.key === 'ArrowDown') {
                data = '\x1b[B'
            } else if (event.key === 'ArrowLeft') {
                data = '\x1b[D'
            } else if (event.key === 'ArrowRight') {
                data = '\x1b[C'
            } else if (event.key === 'Home') {
                data = '\x1b[H'
            } else if (event.key === 'End') {
                data = '\x1b[F'
            } else if (event.key === 'PageUp') {
                data = '\x1b[5~'
            } else if (event.key === 'PageDown') {
                data = '\x1b[6~'
            } else if (event.key === 'Delete') {
                data = '\x1b[3~'
            } else if (event.key === 'Insert') {
                data = '\x1b[2~'
            } else if (event.key === 'Escape') {
                data = '\x1b'
            } else if (event.key === 'Tab') {
                data = '\t'
            } else if (event.key.length === 1) {
                if (event.ctrlKey) {
                    if (event.key === ' ') {
                        data = '\x00'
                    } else {
                        const charCode = event.key.toUpperCase().charCodeAt(0)
                        if (charCode >= 64 && charCode <= 95) {
                            data = String.fromCharCode(charCode - 64)
                        }
                    }
                } else {
                    data = event.key
                }
            } else {
                // Handle control keys mapping if needed
                // This is a simplified implementation
            }

            if (data) {
                const tabs = this.getTargetTabs()
                const buffer = Buffer.from(data)
                for (const tab of tabs) {
                    (tab as any).sendInput(buffer)
                }
            }
        } else {
            // Buffered mode
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                this.send()
            }
        }
    }

    applyCompletion (result: string): void {
        this.input = result
        this.completionResults = []
    }

    async onContextMenu (event: MouseEvent): Promise<void> {
        event.preventDefault()
        const items = [
            {
                label: this.translate.instant('Real-time broadcast'),
                type: 'radio',
                checked: this.mode === 'broadcast',
                click: () => {
                    this.mode = 'broadcast'
                },
            },
            {
                label: this.translate.instant('Buffered input'),
                type: 'radio',
                checked: this.mode === 'buffered',
                click: () => {
                    this.mode = 'buffered'
                },
            },
            { type: 'separator' },
            {
                label: this.translate.instant('Clear history'),
                click: () => {
                    this.history = []
                },
            },
        ]

        this.platform.popupContextMenu(items as any, event)
    }
}
