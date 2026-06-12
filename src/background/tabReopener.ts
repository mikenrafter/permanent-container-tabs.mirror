import type { BrowserApi, Tab } from '../models'
import type { TcLayer } from './tcLayer'
import { loadSettings } from '../preferences/settings'
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

		let newTab: Tab

		if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
			newTab = await this.tcLayer.createTempContainer(url ?? '', index, windowId ?? 0)
		} else if (cookieStoreId === NO_CONTAINER) {
			newTab = await this.browserApi.tabs.create({ ...(url !== undefined ? { url } : {}), index, active: true })
		} else {
			newTab = await this.browserApi.tabs.create({ ...(url !== undefined ? { url } : {}), cookieStoreId, index, active: true })
		}

		if (tab.id != null) {
			await this.browserApi.tabs.remove(tab.id)
		}

		// TC intercept check — only when TC is present and we didn't deliberately open in TC
		if (cookieStoreId === TEMP_CONTAINER_SENTINEL || !this.tcLayer.isPresent() || newTab.id == null) return

		await new Promise(resolve => setTimeout(resolve, 400))

		let currentTab: Tab
		try {
			currentTab = await this.browserApi.tabs.get(newTab.id)
		} catch {
			// TC may have closed and replaced our tab
			return
		}

		if (!currentTab.cookieStoreId) return
		const isNowInTc = await this.tcLayer.isTempContainer(currentTab.cookieStoreId)
		if (!isNowInTc) return

		const settings = await loadSettings(this.browserApi.storage.local)
		if (settings.suppressIsolationInfo) return

		const infoUrl = this.browserApi.runtime.getURL('info/isolation-info.html')
		await this.browserApi.tabs.create({ url: infoUrl, active: true })
	}
}
