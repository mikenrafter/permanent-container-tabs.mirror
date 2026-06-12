import type { BrowserApi, Tab } from '../models'
import type { TcLayer } from './tcLayer'
import { NO_CONTAINER, TEMP_CONTAINER_SENTINEL } from '../constants'

export interface TabReopenerDeps {
	readonly browserApi: BrowserApi
	readonly tcLayer: TcLayer
}

export interface TabReopener {
	reopen(tab: Tab, cookieStoreId: string): Promise<void>
}

export class TabReopenerImpl implements TabReopener {
	private readonly browserApi: BrowserApi
	private readonly tcLayer: TcLayer

	constructor(deps: TabReopenerDeps) {
		this.browserApi = deps.browserApi
		this.tcLayer = deps.tcLayer
	}

	async reopen(tab: Tab, cookieStoreId: string): Promise<void> {
		const url = tab.url
		const index = tab.index + 1
		const windowId = tab.windowId

		// Snapshot pre-existing tab IDs for orphan cleanup
		let preTabIds: Set<number | undefined> | null = null
		if (this.tcLayer.isPresent() && windowId != null) {
			const existingTabs = await this.browserApi.tabs.query({ windowId })
			preTabIds = new Set(existingTabs.map(t => t.id))
		}

		let newTabId: number | undefined

		if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
			// Open in a fresh Temporary Container via TC API
			const newTab = await this.tcLayer.createTempContainer(url ?? '', index, windowId ?? 0)
			newTabId = newTab.id
			// Close original tab
			if (tab.id != null) {
				await this.browserApi.tabs.remove(tab.id)
			}
		} else if (cookieStoreId === NO_CONTAINER) {
			// Open in default container (no cookieStoreId)
			const newTab = await this.browserApi.tabs.create({ url, index })
			newTabId = newTab.id
			if (tab.id != null) {
				await this.browserApi.tabs.remove(tab.id)
			}
		} else {
			// Open in a specific permanent container
			const newTab = await this.browserApi.tabs.create({ url, cookieStoreId, index })
			newTabId = newTab.id
			if (tab.id != null) {
				await this.browserApi.tabs.remove(tab.id)
			}
		}

		// Cleanup orphaned TC tabs
		if (this.tcLayer.isPresent() && preTabIds != null && windowId != null) {
			// Include the newly created tab in preTabIds so it won't be cleaned up
			if (newTabId != null) {
				preTabIds.add(newTabId)
			}
			await this.tcLayer.cleanupOrphanedTabs(windowId, preTabIds)
		}
	}
}
