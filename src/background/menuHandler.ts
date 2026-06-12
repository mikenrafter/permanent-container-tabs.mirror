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

		// No Container — no icon, always radio
		const noContainerIsCurrent = tab.cookieStoreId === NO_CONTAINER || !tab.cookieStoreId
		await this.browserApi.menus.create({
			id: `${parentId}-${NO_CONTAINER}`,
			parentId,
			title: 'No Container',
			type: 'radio',
			checked: noContainerIsCurrent,
			enabled: !noContainerIsCurrent,
			contexts: ['tab'],
		})

		// Temporary Container — uses TC's own extension icon when not current;
		// radio indicator replaces the icon when current.
		if (this.tcLayer.isPresent()) {
			const tcIconUrl = this.tcLayer.iconUrl
			await this.browserApi.menus.create({
				id: `${parentId}-${TEMP_CONTAINER_SENTINEL}`,
				parentId,
				title: 'Temporary Container',
				type: tcIconUrl ? 'normal' : 'radio',
				contexts: ['tab'],
				...(tcIconUrl ? { icons: { 16: tcIconUrl } } : {}),
			})
		}

		// Permanent containers — icon replaces radio button when not current;
		// radio indicator replaces the icon when current.
		for (const container of permanentContainers) {
			const isCurrent = tab.cookieStoreId === container.cookieStoreId
			const iconUrl = container.iconUrl
			await this.browserApi.menus.create({
				id: `${parentId}-${container.cookieStoreId}`,
				parentId,
				title: container.name,
				type: isCurrent ? 'radio' : (iconUrl ? 'normal' : 'radio'),
				checked: isCurrent,
				enabled: !isCurrent,
				contexts: ['tab'],
				...(isCurrent || !iconUrl ? {} : { icons: { 16: iconUrl } }),
			})
		}
	}

	async handleClick(info: MenusOnClickInfo, tab: Tab): Promise<void> {
		const itemId = info.menuItemId

		if (itemId.startsWith(`${MENU_OPEN_NEW}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_OPEN_NEW}-`.length)
			if (cookieStoreId === NO_CONTAINER) {
				// Open in default container — no cookieStoreId
				await this.browserApi.tabs.create({ ...(tab.url !== undefined ? { url: tab.url } : {}), index: tab.index + 1 })
			} else if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
				await this.tcLayer.createTempContainer(tab.url ?? '', tab.index + 1, tab.windowId ?? 0)
			} else {
				await this.browserApi.tabs.create({ ...(tab.url !== undefined ? { url: tab.url } : {}), cookieStoreId, index: tab.index + 1 })
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
