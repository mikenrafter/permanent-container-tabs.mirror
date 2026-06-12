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
		if (cookieStoreId === TEMP_CONTAINER_SENTINEL) {
			console.log('[PCT] reopen: skipping TC intercept check — target was TEMP_CONTAINER_SENTINEL')
			return
		}
		if (!this.tcLayer.isPresent()) {
			console.log('[PCT] reopen: skipping TC intercept check — TC not present')
			return
		}
		if (newTab.id == null) {
			console.log('[PCT] reopen: skipping TC intercept check — new tab has no id')
			return
		}

		console.log(`[PCT] reopen: starting TC intercept check for tab ${newTab.id} (target=${cookieStoreId}, url=${url}), waiting 500ms`)
		await new Promise<void>(resolve => setTimeout(resolve, 500))

		for (let i = 0; i < 10; i++) {
			const poll = `poll ${i + 1}/10`

			// Check A — our created tab by ID
			let checkAIsTC = false
			console.log(`[PCT] reopen: ${poll} — Check A: tabs.get(${newTab.id})`)
			try {
				const currentTab = await this.browserApi.tabs.get(newTab.id)
				console.log(`[PCT] reopen: ${poll} — Check A: cookieStoreId=${currentTab.cookieStoreId}`)
				if (currentTab.cookieStoreId) {
					checkAIsTC = await this.tcLayer.isTempContainer(currentTab.cookieStoreId)
					console.log(`[PCT] reopen: ${poll} — Check A: isTempContainer=${checkAIsTC}`)
				} else {
					console.log(`[PCT] reopen: ${poll} — Check A: cookieStoreId empty`)
				}
			} catch (err) {
				console.log(`[PCT] reopen: ${poll} — Check A: tabs.get threw (tab gone?):`, err)
				checkAIsTC = false
			}

			// Check B — scan window for a TC tab with matching URL
			let checkBIsTC = false
			if (!checkAIsTC && url && windowId != null) {
				console.log(`[PCT] reopen: ${poll} — Check B: scanning windowId=${windowId} for TC tabs with url=${url}`)
				const allTabs = await this.browserApi.tabs.query({ windowId })
				console.log(`[PCT] reopen: ${poll} — Check B: ${allTabs.length} tabs in window`)
				for (const t of allTabs) {
					if (t.id === newTab.id) continue
					if (!t.cookieStoreId) continue
					if (t.url !== url) continue;
					const isTemp = await this.tcLayer.isTempContainer(t.cookieStoreId)
					console.log(`[PCT] reopen: ${poll} — Check B: tab ${t.id} url=${t.url} cookieStoreId=${t.cookieStoreId} isTemp=${isTemp}`)
					if (isTemp) {
						console.log(`[PCT] reopen: ${poll} — Check B: found TC replacement tab ${t.id}`)
						checkBIsTC = true
						break
					}
				}
			}

			if (checkAIsTC || checkBIsTC) {
				const settings = await loadSettings(this.browserApi.storage.local)
				console.log(`[PCT] reopen: ${poll} — TC intercept confirmed (A=${checkAIsTC} B=${checkBIsTC}), suppressIsolationInfo=${settings.suppressIsolationInfo}`)
				if (!settings.suppressIsolationInfo) {
					const infoUrl = this.browserApi.runtime.getURL('info/isolation-info.html')
					console.log('[PCT] reopen: opening isolation info page:', infoUrl)
					await this.browserApi.tabs.create({ url: infoUrl, active: true })
				}
				return
			}

			console.log(`[PCT] reopen: ${poll} — no TC intercept found, waiting 200ms`)
			await new Promise<void>(resolve => setTimeout(resolve, 200))
		}

		console.log('[PCT] reopen: TC intercept check exhausted 10 polls with no interception detected')
	}
}
