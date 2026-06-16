import type { BrowserApi, ContextualIdentity, MenusOnClickInfo, PctSettings, Tab } from '../models'
import type { TcLayer } from './tcLayer'
import type { TabReopener } from './tabReopener'
import {
	MENU_BOOKMARK_OPEN_NEW,
	MENU_LINK_OPEN_NEW,
	MENU_OPEN_NEW,
	MENU_REOPEN,
	NO_CONTAINER,
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
	buildLinkMenus(permanentContainers: ContextualIdentity[]): Promise<void>
	buildBookmarkMenus(permanentContainers: ContextualIdentity[]): Promise<void>
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

		if (settings.prioritizeReopen) {
			await this.buildPrimarySubmenu(MENU_REOPEN, 'Reopen Tab in Container', MENU_OPEN_NEW, 'Open in New Container Tab', tab, permanentContainers)
		} else {
			await this.buildPrimarySubmenu(MENU_OPEN_NEW, 'Open in New Container Tab', MENU_REOPEN, 'Reopen Tab in Container', tab, permanentContainers)
		}

		await this.browserApi.menus.refresh()
	}

	async buildLinkMenus(permanentContainers: ContextualIdentity[]): Promise<void> {
		this._containerCache = permanentContainers

		await this.browserApi.menus.removeAll()

		await this.browserApi.menus.create({
			id: MENU_LINK_OPEN_NEW,
			title: 'Open Link in New Container Tab',
			contexts: ['link'],
		})

		await this.buildFlatContainerItems(MENU_LINK_OPEN_NEW, permanentContainers, ['link'])

		await this.browserApi.menus.refresh()
	}

	async buildBookmarkMenus(permanentContainers: ContextualIdentity[]): Promise<void> {
		this._containerCache = permanentContainers

		await this.browserApi.menus.removeAll()

		await this.browserApi.menus.create({
			id: MENU_BOOKMARK_OPEN_NEW,
			title: 'Open Bookmark in New Container Tab',
			contexts: ['bookmark'],
		})

		await this.buildFlatContainerItems(MENU_BOOKMARK_OPEN_NEW, permanentContainers, ['bookmark'])

		await this.browserApi.menus.refresh()
	}

	private async buildPrimarySubmenu(
		primaryId: string,
		primaryTitle: string,
		altId: string,
		altTitle: string,
		tab: Tab,
		permanentContainers: ContextualIdentity[],
	): Promise<void> {
		await this.browserApi.menus.create({
			id: primaryId,
			title: primaryTitle,
			contexts: ['tab'],
		})

		// Alt behavior submenu — first child of primary
		await this.browserApi.menus.create({
			id: altId,
			parentId: primaryId,
			title: altTitle,
			contexts: ['tab'],
		})
		await this.buildContainerItems(altId, tab, permanentContainers)

		await this.buildContainerItems(primaryId, tab, permanentContainers)
	}

	private async buildContainerItems(
		parentId: string,
		tab: Tab,
		permanentContainers: ContextualIdentity[],
	): Promise<void> {
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

		// Temporary Container — radio if current tab is in TC, normal+icon otherwise
		if (this.tcLayer.isPresent()) {
			const tabIsInTc = !!tab.cookieStoreId && await this.tcLayer.isTempContainer(tab.cookieStoreId)
			await this.browserApi.menus.create({
				id: `${parentId}-${TEMP_CONTAINER_SENTINEL}`,
				parentId,
				title: 'Temporary Container',
				type: tabIsInTc ? 'radio' : 'normal',
				checked: tabIsInTc,
				enabled: !tabIsInTc,
				contexts: ['tab'],
				...(tabIsInTc ? {} : { icons: { 16: 'icons/temp-container.svg' } }),
			})
		}

		// Separator before permanent containers
		if (permanentContainers.length > 0) {
			await this.browserApi.menus.create({
				id: `${parentId}-separator`,
				parentId,
				type: 'separator',
				contexts: ['tab'],
			})
		}

		// Permanent containers — bundled SVG icon (icons/${icon}.svg#${color}) replaces
		// radio button when not current; radio indicator replaces icon when current.
		for (const container of permanentContainers) {
			const isCurrent = tab.cookieStoreId === container.cookieStoreId
			const bundledIcon = `icons/${container.icon}.svg#${container.color}`
			await this.browserApi.menus.create({
				id: `${parentId}-${container.cookieStoreId}`,
				parentId,
				title: container.name,
				type: isCurrent ? 'radio' : 'normal',
				checked: isCurrent,
				enabled: !isCurrent,
				contexts: ['tab'],
				...(isCurrent ? {} : { icons: { 16: bundledIcon } }),
			})
		}
	}

	// Flat container list for link/bookmark contexts — no radio/current-container state.
	private async buildFlatContainerItems(
		parentId: string,
		permanentContainers: ContextualIdentity[],
		contexts: string[],
	): Promise<void> {
		await this.browserApi.menus.create({
			id: `${parentId}-${NO_CONTAINER}`,
			parentId,
			title: 'No Container',
			type: 'normal',
			contexts,
		})

		if (this.tcLayer.isPresent()) {
			await this.browserApi.menus.create({
				id: `${parentId}-${TEMP_CONTAINER_SENTINEL}`,
				parentId,
				title: 'Temporary Container',
				type: 'normal',
				contexts,
				icons: { 16: 'icons/temp-container.svg' },
			})
		}

		if (permanentContainers.length > 0) {
			await this.browserApi.menus.create({
				id: `${parentId}-separator`,
				parentId,
				type: 'separator',
				contexts,
			})
		}

		for (const container of permanentContainers) {
			await this.browserApi.menus.create({
				id: `${parentId}-${container.cookieStoreId}`,
				parentId,
				title: container.name,
				type: 'normal',
				contexts,
				icons: { 16: `icons/${container.icon}.svg#${container.color}` },
			})
		}
	}

	async handleClick(info: MenusOnClickInfo, tab: Tab): Promise<void> {
		const itemId = info.menuItemId

		if (itemId.startsWith(`${MENU_OPEN_NEW}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_OPEN_NEW}-`.length)
			await this.openUrlInContainer(tab.url, cookieStoreId, tab)
		} else if (itemId.startsWith(`${MENU_REOPEN}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_REOPEN}-`.length)
			await this.tabReopener.reopen(tab, cookieStoreId)
		} else if (itemId.startsWith(`${MENU_LINK_OPEN_NEW}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_LINK_OPEN_NEW}-`.length)
			await this.openUrlInContainer(info.linkUrl, cookieStoreId, tab)
		} else if (itemId.startsWith(`${MENU_BOOKMARK_OPEN_NEW}-`)) {
			const cookieStoreId = itemId.slice(`${MENU_BOOKMARK_OPEN_NEW}-`.length)
			const url = await this.resolveBookmarkUrl(info.bookmarkId)
			if (!url) return
			await this.openUrlInContainer(url, cookieStoreId, tab)
		}
	}

	private async openUrlInContainer(url: string | undefined, cookieStoreId: string, tab: Tab): Promise<void> {
		if (cookieStoreId === NO_CONTAINER) {
			await this.browserApi.tabs.create({ ...(url !== undefined ? { url } : {}), index: tab.index + 1 })
		} else if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
			await this.tcLayer.createTempContainer(url ?? '', tab.index + 1, tab.windowId ?? 0)
		} else {
			await this.browserApi.tabs.create({ ...(url !== undefined ? { url } : {}), cookieStoreId, index: tab.index + 1 })
		}
	}

	private async resolveBookmarkUrl(bookmarkId: string | undefined): Promise<string | undefined> {
		if (!bookmarkId) return undefined
		try {
			const nodes = await this.browserApi.bookmarks.get(bookmarkId)
			return nodes[0]?.url
		} catch {
			return undefined
		}
	}

	handleHidden(): void {
		this._containerCache = null
	}

	markTabAsPctOpened(_tabId: number): void {
		// No-op here — pctRuntime manages the set
	}
}
