/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Component, Input, HostListener, HostBinding, ViewChildren, ViewChild, ElementRef, NgZone, OnDestroy, AfterViewInit } from '@angular/core'
import { trigger, style, animate, transition, state } from '@angular/animations'
import { NgbDropdown, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Subject } from 'rxjs'
import { debounceTime, takeUntil } from 'rxjs/operators'

import { HostAppService, Platform } from '../api/hostApp'
import { HotkeysService } from '../services/hotkeys.service'
import { Logger, LogService } from '../services/log.service'
import { ConfigService } from '../services/config.service'
import { ThemesService } from '../services/themes.service'
import { UpdaterService } from '../services/updater.service'
import { CommandService } from '../services/commands.service'

import { BaseTabComponent } from './baseTab.component'
import { SafeModeModalComponent } from './safeModeModal.component'
import { TabBodyComponent } from './tabBody.component'
import { SplitTabComponent } from './splitTab.component'
import { AppService, Command, CommandLocation, FileTransfer, HostWindowService, PlatformService, NotificationsService, TranslateService } from '../api'

// 标签溢出常量
const TAB_OVERFLOW_CONSTANTS = {
    OVERFLOW_BUTTON_WIDTH: 50,
    MIN_TAB_WIDTH: 100,
    MAX_TAB_WIDTH: 200,
    DEFAULT_TAB_WIDTH: 150,
    RESIZE_DEBOUNCE_MS: 100,
}

function makeTabAnimation (dimension: string, size: number) {
    return [
        state('in', style({
            'flex-basis': '{{size}}',
            [dimension]: '{{size}}',
        }), {
            params: { size: `${size}px` },
        }),
        transition(':enter', [
            style({
                'flex-basis': '1px',
                [dimension]: '1px',
            }),
            animate('250ms ease-out', style({
                'flex-basis': '{{size}}',
                [dimension]: '{{size}}',
            })),
        ]),
        transition(':leave', [
            style({
                'flex-basis': 'auto',
                'padding-left': '*',
                'padding-right': '*',
                [dimension]: '*',
            }),
            animate('250ms ease-in-out', style({
                'padding-left': 0,
                'padding-right': 0,
                [dimension]: '0',
            })),
        ]),
    ]
}

/** @hidden */
@Component({
    selector: 'app-root',
    templateUrl: './appRoot.component.pug',
    styleUrls: ['./appRoot.component.scss'],
    animations: [
        trigger('animateTab', makeTabAnimation('width', 200)),
    ],
})
export class AppRootComponent implements AfterViewInit, OnDestroy {
    Platform = Platform
    @Input() ready = false
    @Input() leftToolbarButtons: Command[]
    @Input() rightToolbarButtons: Command[]
    @HostBinding('class.platform-win32') platformClassWindows = process.platform === 'win32'
    @HostBinding('class.platform-darwin') platformClassMacOS = process.platform === 'darwin'
    @HostBinding('class.platform-linux') platformClassLinux = process.platform === 'linux'
    @HostBinding('class.no-tabs') noTabs = true
    @ViewChildren(TabBodyComponent) tabBodies: TabBodyComponent[]
    @ViewChild('activeTransfersDropdown') activeTransfersDropdown: NgbDropdown
    @ViewChild('tabsWrapper') tabsWrapperRef!: ElementRef<HTMLElement>
    unsortedTabs: BaseTabComponent[] = []
    tileMode = false
    updatesAvailable = false
    activeTransfers: FileTransfer[] = []
    isSessionManagerVisible = true
    isCommandComposerVisible = true
    commandComposerHeight = 150
    private logger: Logger

    // 标签溢出相关属性
    private visibleTabsCache: BaseTabComponent[] = []
    private hiddenTabsCache: BaseTabComponent[] = []
    private tabWidthCache: Map<string, number> = new Map()
    private containerWidth = 0
    private resizeObserver: ResizeObserver | null = null
    private resize$ = new Subject<number>()
    private destroy$ = new Subject<void>()

    constructor (
        private hotkeys: HotkeysService,
        private commands: CommandService,
        public updater: UpdaterService,
        public hostWindow: HostWindowService,
        public hostApp: HostAppService,
        public config: ConfigService,
        public app: AppService,
        platform: PlatformService,
        log: LogService,
        ngbModal: NgbModal,
        _themes: ThemesService,
        private notifications: NotificationsService,
        private translate: TranslateService,
        private zone: NgZone,
    ) {
        // document.querySelector('app-root')?.remove()
        this.logger = log.create('main')
        this.logger.info('v', platform.getAppVersion())

        // 设置 resize 防抖处理
        this.resize$.pipe(
            debounceTime(TAB_OVERFLOW_CONSTANTS.RESIZE_DEBOUNCE_MS),
            takeUntil(this.destroy$),
        ).subscribe(width => {
            this.zone.run(() => {
                this.containerWidth = width
                this.calculateTabOverflow()
            })
        })

        this.app.tileModeChange$.subscribe(mode => {
            if (mode && this.app.tabs.length > 16) {
                this.notifications.error(this.translate.instant('Too many tabs for tile mode (max 16)'))
                this.app.toggleTileMode()
                return
            }
            this.tileMode = mode
            if (mode) {
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'))
                    this.app.tabs.forEach(t => t.emitVisibility(true))
                }, 100)
            }
        })

        this.hotkeys.hotkey$.subscribe((hotkey: string) => {
            if (hotkey.startsWith('tab-')) {
                const index = parseInt(hotkey.split('-')[1])
                if (index <= this.app.tabs.length) {
                    this.app.selectTab(this.app.tabs[index - 1])
                }
            }
            if (this.app.activeTab) {
                if (hotkey === 'close-tab') {
                    this.app.closeTab(this.app.activeTab, true)
                }
                if (hotkey === 'toggle-last-tab') {
                    this.app.toggleLastTab()
                }
                if (hotkey === 'next-tab') {
                    this.app.nextTab()
                }
                if (hotkey === 'previous-tab') {
                    this.app.previousTab()
                }
                if (hotkey === 'move-tab-left') {
                    this.app.moveSelectedTabLeft()
                }
                if (hotkey === 'move-tab-right') {
                    this.app.moveSelectedTabRight()
                }
                if (hotkey === 'duplicate-tab') {
                    this.app.duplicateTab(this.app.activeTab)
                }
                if (hotkey === 'restart-tab') {
                    this.app.duplicateTab(this.app.activeTab)
                    this.app.closeTab(this.app.activeTab, true)
                }
                if (hotkey === 'explode-tab' && this.app.activeTab instanceof SplitTabComponent) {
                    this.app.explodeTab(this.app.activeTab)
                }
                if (hotkey === 'combine-tabs' && this.app.activeTab instanceof SplitTabComponent) {
                    this.app.combineTabsInto(this.app.activeTab)
                }
            }
            if (hotkey === 'reopen-tab') {
                this.app.reopenLastTab()
            }
            if (hotkey === 'toggle-fullscreen') {
                hostWindow.toggleFullscreen()
            }
        })

        this.hostWindow.windowCloseRequest$.subscribe(async () => {
            this.app.closeWindow()
        })

        if (window['safeModeReason']) {
            ngbModal.open(SafeModeModalComponent)
        }

        this.app.tabOpened$.subscribe(tab => {
            this.unsortedTabs.push(tab)
            this.noTabs = false
            this.app.emitTabDragEnded()
            // 标签添加后重新计算溢出
            this.invalidateTabWidthCache()
            this.calculateTabOverflow()
        })

        this.app.tabRemoved$.subscribe(tab => {
            for (const tabBody of this.tabBodies) {
                if (tabBody.tab === tab) {
                    tabBody.detach()
                }
            }
            this.unsortedTabs = this.unsortedTabs.filter(x => x !== tab)
            this.noTabs = app.tabs.length === 0
            this.app.emitTabDragEnded()
            // 标签删除后重新计算溢出
            this.invalidateTabWidthCache()
            this.calculateTabOverflow()
        })

        // 监听活动标签变化
        this.app.activeTabChange$.subscribe(() => {
            this.calculateTabOverflow()
        })

        platform.fileTransferStarted$.subscribe(transfer => {
            this.activeTransfers.push(transfer)
            this.activeTransfersDropdown.open()
        })

        config.ready$.toPromise().then(async () => {
            this.leftToolbarButtons = await this.getToolbarButtons(false)
            this.rightToolbarButtons = await this.getToolbarButtons(true)

            setInterval(() => {
                if (this.config.store.enableAutomaticUpdates) {
                    this.updater.check().then(available => {
                        this.updatesAvailable = available
                    })
                }
            }, 3600 * 12 * 1000)
        })
    }

    async ngOnInit () {
        this.config.ready$.toPromise().then(() => {
            this.ready = true
            this.app.emitReady()
        })
    }

    ngAfterViewInit () {
        // 设置 ResizeObserver 监听标签容器宽度变化
        this.setupResizeObserver()
    }

    ngOnDestroy () {
        this.destroy$.next()
        this.destroy$.complete()
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }
    }

    private setupResizeObserver () {
        // 延迟设置，确保 DOM 已渲染
        setTimeout(() => {
            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    this.resize$.next(entry.contentRect.width)
                }
            })
            this.resizeObserver.observe(this.tabsWrapperRef.nativeElement)
            this.containerWidth = this.tabsWrapperRef.nativeElement.clientWidth
            this.calculateTabOverflow()
        }, 100)
    }

    /**
     * 计算标签溢出状态
     * 确保活动标签始终可见，从右向左隐藏非活动标签
     */
    calculateTabOverflow () {
        const tabs = this.app.tabs
        if (tabs.length === 0 || this.hasVerticalTabs() || this.tileMode) {
            this.visibleTabsCache = [...tabs]
            this.hiddenTabsCache = []
            return
        }

        const availableWidth = this.containerWidth
        if (availableWidth <= 0) {
            this.visibleTabsCache = [...tabs]
            this.hiddenTabsCache = []
            return
        }

        const activeTab = this.app.activeTab
        const tabWidth = this.getEstimatedTabWidth()
        const overflowButtonWidth = TAB_OVERFLOW_CONSTANTS.OVERFLOW_BUTTON_WIDTH

        // 计算可以显示多少个标签
        let maxVisibleTabs = Math.floor(availableWidth / tabWidth)

        // 如果所有标签都能显示，不需要溢出按钮
        if (maxVisibleTabs >= tabs.length) {
            this.visibleTabsCache = [...tabs]
            this.hiddenTabsCache = []
            return
        }

        // 需要溢出按钮，重新计算可见标签数量
        maxVisibleTabs = Math.floor((availableWidth - overflowButtonWidth) / tabWidth)
        maxVisibleTabs = Math.max(1, maxVisibleTabs) // 至少显示一个标签

        // 确保活动标签可见
        const activeIndex = activeTab ? tabs.indexOf(activeTab) : 0

        // 计算可见标签范围
        let startIndex = 0
        let endIndex = maxVisibleTabs

        // 如果活动标签在可见范围之外，调整范围
        if (activeIndex >= maxVisibleTabs) {
            // 活动标签在右侧，调整窗口使其可见
            endIndex = activeIndex + 1
            startIndex = Math.max(0, endIndex - maxVisibleTabs)
        }

        // 分割标签为可见和隐藏
        this.visibleTabsCache = tabs.slice(startIndex, endIndex)
        this.hiddenTabsCache = [
            ...tabs.slice(0, startIndex),
            ...tabs.slice(endIndex),
        ]

        // 确保活动标签在可见列表中
        if (activeTab && !this.visibleTabsCache.includes(activeTab)) {
            // 强制将活动标签加入可见列表
            this.visibleTabsCache = [activeTab]
            this.hiddenTabsCache = tabs.filter(t => t !== activeTab)
        }
    }

    /**
     * 获取估算的标签宽度
     */
    private getEstimatedTabWidth (): number {
        if (this.config.store.appearance.flexTabs) {
            return TAB_OVERFLOW_CONSTANTS.DEFAULT_TAB_WIDTH
        }
        return TAB_OVERFLOW_CONSTANTS.MAX_TAB_WIDTH
    }

    /**
     * 使标签宽度缓存失效
     */
    private invalidateTabWidthCache () {
        this.tabWidthCache.clear()
    }

    /**
     * 获取可见标签列表
     */
    getVisibleTabs (): BaseTabComponent[] {
        if (this.hasVerticalTabs() || this.tileMode) {
            return this.app.tabs
        }
        return this.visibleTabsCache.length > 0 ? this.visibleTabsCache : this.app.tabs
    }

    /**
     * 获取隐藏标签列表
     */
    getHiddenTabs (): BaseTabComponent[] {
        if (this.hasVerticalTabs() || this.tileMode) {
            return []
        }
        return this.hiddenTabsCache
    }

    /**
     * 检查标签是否被隐藏
     */
    isTabHidden (tab: BaseTabComponent): boolean {
        return this.hiddenTabsCache.includes(tab)
    }

    /**
     * 获取标签在原始数组中的索引
     */
    getOriginalTabIndex (tab: BaseTabComponent): number {
        return this.app.tabs.indexOf(tab)
    }

    /**
     * 从下拉菜单选择隐藏的标签
     */
    selectHiddenTab (tab: BaseTabComponent) {
        this.app.selectTab(tab)
        // 选择后重新计算溢出状态
        setTimeout(() => {
            this.calculateTabOverflow()
        }, 0)
    }

    toggleSessionManager () {
        this.isSessionManagerVisible = !this.isSessionManagerVisible
    }

    onCommandComposerResizeStart (event: MouseEvent): void {
        const startHeight = this.commandComposerHeight
        const startY = event.pageY
        const onMove = (e: MouseEvent) => {
            this.commandComposerHeight = Math.max(50, startHeight - (e.pageY - startY))
        }
        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    getTileCols (): number {
        return Math.ceil(Math.sqrt(this.app.tabs.length))
    }

    getTileCellStyles (tab: BaseTabComponent): any {
        if (!this.tileMode) {
            return {}
        }
        const index = this.app.tabs.indexOf(tab)
        const count = this.app.tabs.length
        const cols = this.getTileCols()
        const isLast = index === count - 1

        const baseWidth = 100 / cols
        let width = baseWidth

        if (isLast) {
            const itemsInLastRow = count % cols || cols
            const emptySlots = cols - itemsInLastRow
            if (emptySlots > 0) {
                width = baseWidth * (1 + emptySlots)
            }
        }

        return {
            'flex-basis': `${width}%`,
            'max-width': `${width}%`,
            'order': index,
        }
    }

    toggleCommandComposer (): void {
        this.isCommandComposerVisible = !this.isCommandComposerVisible
    }

    @HostListener('dragover')
    onDragOver () {
        return false
    }

    @HostListener('drop')
    onDrop () {
        return false
    }

    hasVerticalTabs () {
        return this.config.store.appearance.tabsLocation === 'left' || this.config.store.appearance.tabsLocation === 'right'
    }

    get targetTabSize (): any {
        if (this.hasVerticalTabs()) {
            return '*'
        }
        return this.config.store.appearance.flexTabs ? '*' : '200px'
    }

    onTabsReordered (event: CdkDragDrop<BaseTabComponent[]>) {
        const tab: BaseTabComponent = event.item.data
        if (!this.app.tabs.includes(tab)) {
            if (tab.parent instanceof SplitTabComponent) {
                tab.parent.removeTab(tab)
                this.app.wrapAndAddTab(tab)
            }
        }
        moveItemInArray(this.app.tabs, event.previousIndex, event.currentIndex)
        this.app.emitTabsChanged()
    }

    onTransfersChange () {
        if (this.activeTransfers.length === 0) {
            this.activeTransfersDropdown.close()
        }
    }

    @HostBinding('class.vibrant') get isVibrant () {
        return this.config.store?.appearance.vibrancy
    }

    private async getToolbarButtons (aboveZero: boolean): Promise<Command[]> {
        return (await this.commands.getCommands({ tab: this.app.activeTab ?? undefined }))
            .filter(x => x.locations?.includes(aboveZero ? CommandLocation.RightToolbar : CommandLocation.LeftToolbar))
    }

    toggleMaximize (): void {
        this.hostWindow.toggleMaximize()
    }

    protected isTitleBarNeeded (): boolean {
        return (
            this.config.store.appearance.frame === 'full'
            ||
                this.hostApp.platform !== Platform.macOS
                && this.config.store.appearance.frame === 'thin'
                && this.config.store.appearance.tabsLocation !== 'top'
                && this.config.store.appearance.tabsLocation !== 'bottom'
        )
    }
}
