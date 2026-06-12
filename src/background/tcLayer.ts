import type { BrowserApi, LoggerLike, Tab } from '../models'
import { TEMP_CONTAINERS_EXTENSION_IDS } from '../constants'

export interface TcLayerDeps {
	readonly browserApi: BrowserApi
	readonly logger: LoggerLike
}

export interface TcLayer {
	readonly extensionId: string | null
	/** 16-px icon URL for the TC extension itself, or null if TC is not installed. */
	readonly iconUrl: string | null
	isPresent(): boolean
	initialize(): Promise<void>
	isTempContainer(cookieStoreId: string): Promise<boolean>
	createTempContainer(url: string, index: number, windowId: number): Promise<Tab>
	cleanupOrphanedTabs(windowId: number, preTabIds: ReadonlySet<number | undefined>): Promise<void>
}

export class TcLayerImpl implements TcLayer {
	private readonly browserApi: BrowserApi
	private readonly logger: LoggerLike
	private _extensionId: string | null = null
	private _iconUrl: string | null = null

	constructor(deps: TcLayerDeps) {
		this.browserApi = deps.browserApi
		this.logger = deps.logger
	}

	get extensionId(): string | null {
		return this._extensionId
	}

	get iconUrl(): string | null {
		return this._iconUrl
	}

	isPresent(): boolean {
		return this._extensionId !== null
	}

	async initialize(): Promise<void> {
		for (const extensionId of TEMP_CONTAINERS_EXTENSION_IDS) {
			try {
				const extensionInfo = await this.browserApi.management.get(extensionId)
				if (extensionInfo.enabled) {
					this._extensionId = extensionId
					const icon = extensionInfo.icons?.find(i => i.size === 16) ?? extensionInfo.icons?.[0]
					this._iconUrl = icon?.url ?? null
					this.debug('Temporary Containers detected:', extensionInfo.name, extensionId)
					return
				}
			} catch {
				// Extension not installed — try next
			}
		}
		this._extensionId = null
		this.debug('No Temporary Containers extension found')
	}

	async isTempContainer(cookieStoreId: string): Promise<boolean> {
		if (!this._extensionId) return false
		try {
			return await this.browserApi.runtime.sendMessage(
				this._extensionId,
				{ method: 'isTempContainer', cookieStoreId },
			) as boolean
		} catch {
			return false
		}
	}

	async createTempContainer(url: string, index: number, windowId: number): Promise<Tab> {
		if (!this._extensionId) throw new Error('No Temporary Containers extension detected')
		const tab = await this.browserApi.runtime.sendMessage(this._extensionId, {
			method: 'createTempContainer',
			url,
			index,
			windowId,
		})
		return tab as Tab
	}

	async cleanupOrphanedTabs(
		windowId: number,
		preTabIds: ReadonlySet<number | undefined>,
	): Promise<void> {
		this.debug('cleanupOrphanedTabs: pre-redirect tab IDs', [...preTabIds])

		let iteration = 0
		while (iteration++ < 6) {
			await new Promise(resolve => setTimeout(resolve, 150))
			try {
				const tabs = await this.browserApi.tabs.query({ windowId })
				for (const tab of tabs) {
					if (preTabIds.has(tab.id)) continue
					if (tab.id === undefined || !tab.cookieStoreId) continue

					const isTemp = await this.isTempContainer(tab.cookieStoreId)
					if (isTemp && tab.url === 'about:blank') {
						this.debug('cleanupOrphanedTabs: removing TC orphan tab', tab.id, tab.cookieStoreId)
						await this.browserApi.tabs.remove(tab.id)
					}
				}
			} catch (error) {
				this.debug('cleanupOrphanedTabs: error', error)
			}
		}
	}

	private debug(...args: unknown[]): void {
		this.logger.log(...args)
	}
}
