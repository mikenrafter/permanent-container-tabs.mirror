import type { BrowserApi, ContextualIdentity, Tab, TabChangeInfo } from '../models'
import type { TcLayer } from './tcLayer'
import type { MenuHandler } from './menuHandler'
import { loadSettings } from '../preferences/settings'

export interface PctRuntimeDeps {
	readonly browserApi: BrowserApi
	readonly tcLayer: TcLayer
	readonly menuHandler: MenuHandler
}

export interface PctRuntime {
	initialize(): Promise<void>
	markTabAsPctOpened(tabId: number): void
}

export class PctRuntimeImpl implements PctRuntime {
	private readonly browserApi: BrowserApi
	private readonly tcLayer: TcLayer
	private readonly menuHandler: MenuHandler
	private readonly pctOpenedTabIds: Set<number> = new Set()

	constructor(deps: PctRuntimeDeps) {
		this.browserApi = deps.browserApi
		this.tcLayer = deps.tcLayer
		this.menuHandler = deps.menuHandler
	}

	markTabAsPctOpened(tabId: number): void {
		this.pctOpenedTabIds.add(tabId)
	}

	async initialize(): Promise<void> {
		await this.tcLayer.initialize()
		await this.menuHandler.initialize()

		// Register menus.onShown
		this.browserApi.menus.onShown.addListener(async (info, tab) => {
			if (!info.contexts.includes('tab')) return
			const settings = await loadSettings(this.browserApi.storage.local)
			// Fetch permanent containers
			const allContainers = await this.browserApi.contextualIdentities.query({})
			const permanentContainers: ContextualIdentity[] = []
			for (const c of allContainers) {
				const isTemp = await this.tcLayer.isTempContainer(c.cookieStoreId)
				if (!isTemp) permanentContainers.push(c)
			}
			await this.menuHandler.buildMenus(tab, settings, permanentContainers)
		})

		// Register menus.onHidden
		this.browserApi.menus.onHidden.addListener(() => {
			this.menuHandler.handleHidden()
		})

		// Register menus.onClicked
		this.browserApi.menus.onClicked.addListener(async (info, tab) => {
			if (!tab) return
			await this.menuHandler.handleClick(info, tab)
		})

		// Register tabs.onUpdated for F4 isolation info
		this.browserApi.tabs.onUpdated.addListener(async (id, changeInfo, tab) => {
			await this.handleTabUpdated(id, changeInfo, tab)
		})
	}

	private async handleTabUpdated(id: number, changeInfo: TabChangeInfo, tab: Tab): Promise<void> {
		// Only care about cookieStoreId changes
		if (!changeInfo.cookieStoreId) return

		// Load settings to check suppressIsolationInfo
		const settings = await loadSettings(this.browserApi.storage.local)
		if (settings.suppressIsolationInfo) return

		// Check if this tab was opened by PCT itself
		if (this.pctOpenedTabIds.has(id)) {
			this.pctOpenedTabIds.delete(id)
			return
		}

		// Check if new cookieStoreId is a temp container
		const isTemp = await this.tcLayer.isTempContainer(changeInfo.cookieStoreId)
		if (!isTemp) return

		// Skip about:blank and about:newtab
		const url = tab.url ?? ''
		if (url === 'about:blank' || url === 'about:newtab') return

		// Open the isolation info page
		const infoUrl = this.browserApi.runtime.getURL('info/isolation-info.html')
		await this.browserApi.tabs.create({ url: infoUrl })
	}
}
