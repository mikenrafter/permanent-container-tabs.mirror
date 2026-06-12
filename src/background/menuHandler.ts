import type { BrowserApi, ContextualIdentity, MenusOnClickInfo, PctSettings, Tab } from '../models'
import type { TcLayer } from './tcLayer'
import type { TabReopener } from './tabReopener'
import {
	MENU_OPEN_NEW,
	MENU_REOPEN,
	NO_CONTAINER,
	PCT_SUFFIX,
	TEMP_CONTAINER_SENTINEL,
} from '../constants'

export interface MenuHandlerDeps {
	readonly browserApi: BrowserApi
	readonly tcLayer: TcLayer
	readonly tabReopener: TabReopener
}

export interface MenuHandler {
	initialize(): Promise<void>
	buildMenus(tab: Tab, settings: PctSettings, permanentContainers: ContextualIdentity[]): Promise<void>
	handleClick(info: MenusOnClickInfo, tab: Tab): Promise<void>
	handleHidden(): void
	markTabAsPctOpened(tabId: number): void
}

export class MenuHandlerImpl implements MenuHandler {
	private readonly browserApi: BrowserApi
	private readonly tcLayer: TcLayer
	private readonly tabReopener: TabReopener
	private _containerCache: ContextualIdentity[] | null = null

	constructor(deps: MenuHandlerDeps) {
		this.browserApi = deps.browserApi
		this.tcLayer = deps.tcLayer
		this.tabReopener = deps.tabReopener
	}

	async initialize(): Promise<void> {
		// Nothing to do at initialization — listeners are registered by PctRuntime
	}

	async buildMenus(tab: Tab, settings: PctSettings, permanentContainers: ContextualIdentity[]): Promise<void> {
		this._containerCache = permanentContainers

		await this.browserApi.menus.removeAll()

		// F3: Suppress MAC menu
		if (settings.suppressMacMenuItem) {
			this.browserApi.menus.overrideContext({ showDefaults: false })
		}

		const suffix = settings.suppressMacMenuItem ? '' : PCT_SUFFIX

		// F1: Open in New Container Tab
		if (settings.showOpenInNewTab) {
			await this.buildContainerSubmenu(MENU_OPEN_NEW, `Open in New Container Tab${suffix}`, tab, permanentContainers)
		}

		// F2: Reopen Tab in Container
		if (settings.showReopenInContainer) {
			await this.buildContainerSubmenu(MENU_REOPEN, `Reopen Tab in Container${suffix}`, tab, permanentContainers)
		}

		await this.browserApi.menus.refresh()
	}

	private async buildContainerSubmenu(
		parentId: string,
		title: string,
		tab: Tab,
		permanentContainers: ContextualIdentity[],
	): Promise<void> {
		// Create parent item
		await this.browserApi.menus.create({
			id: parentId,
			title,
			contexts: ['tab'],
		})

		// No Container (always first)
		await this.browserApi.menus.create({
			id: `${parentId}-${NO_CONTAINER}`,
			parentId,
			title: 'No Container',
			type: 'radio',
			checked: tab.cookieStoreId === NO_CONTAINER || !tab.cookieStoreId,
			contexts: ['tab'],
		})

		// Temporary Container (only if TC installed)
		if (this.tcLayer.isPresent()) {
			await this.browserApi.menus.create({
				id: `${parentId}-${TEMP_CONTAINER_SENTINEL}`,
				parentId,
				title: 'Temporary Container',
				type: 'radio',
				checked: false,
				contexts: ['tab'],
			})
		}

		// All permanent containers
		for (const container of permanentContainers) {
			await this.browserApi.menus.create({
				id: `${parentId}-${container.cookieStoreId}`,
				parentId,
				title: container.name,
				type: 'radio',
				checked: tab.cookieStoreId === container.cookieStoreId,
				contexts: ['tab'],
				icons: { 16: 'icons/icon.svg' },
			})
		}
	}

	async handleClick(info: MenusOnClickInfo, tab: Tab): Promise<void> {
		const itemId = info.menuItemId

		if (itemId.startsWith(`${MENU_OPEN_NEW}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_OPEN_NEW}-`.length)
			if (cookieStoreId === NO_CONTAINER) {
				// Open in default container — no cookieStoreId
				await this.browserApi.tabs.create({ url: tab.url, index: tab.index + 1 })
			} else if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
				await this.tcLayer.createTempContainer(tab.url ?? '', tab.index + 1, tab.windowId ?? 0)
			} else {
				await this.browserApi.tabs.create({ url: tab.url, cookieStoreId, index: tab.index + 1 })
			}
		} else if (itemId.startsWith(`${MENU_REOPEN}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_REOPEN}-`.length)
			await this.tabReopener.reopen(tab, cookieStoreId)
		}
	}

	handleHidden(): void {
		this._containerCache = null
	}

	markTabAsPctOpened(_tabId: number): void {
		// No-op here — pctRuntime manages the set
	}
}
