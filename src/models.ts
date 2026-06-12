// ---- Settings ----

export interface PctSettings {
	showOpenInNewTab: boolean
	showReopenInContainer: boolean
	suppressMacMenuItem: boolean
	suppressIsolationInfo: boolean
}

// ---- Browser API types ----

export interface ContextualIdentity {
	name: string
	cookieStoreId: string
	icon: string
	iconUrl?: string
	color: string
	colorCode?: string
}

export interface Tab {
	id?: number
	url?: string
	index: number
	title?: string
	cookieStoreId?: string
	windowId?: number
}

export interface MenusOnClickInfo {
	menuItemId: string
	parentMenuItemId?: string
}

export interface MenusOnShownInfo {
	contexts: string[]
	tabId?: number
}

export interface TabChangeInfo {
	status?: string
	url?: string
	cookieStoreId?: string
}

export interface ExtensionIcon {
	size: number
	url: string
}

export interface ExtensionInfo {
	id: string
	name: string
	enabled: boolean
	type: string
	icons?: ExtensionIcon[]
}

export interface MenusCreateDetails {
	id?: string
	title?: string
	contexts?: string[]
	parentId?: string
	type?: 'normal' | 'separator' | 'radio' | 'checkbox'
	checked?: boolean
	enabled?: boolean
	icons?: Record<number, string>
}

export interface ManagementApi {
	get(extensionId: string): Promise<ExtensionInfo>
}

export interface RuntimeApi {
	sendMessage(extensionId: string, message: Record<string, unknown>): Promise<unknown>
	getURL(path: string): string
}

export interface MenusApi {
	create(details: MenusCreateDetails): Promise<void>
	refresh(): Promise<void>
	removeAll(): Promise<void>
	overrideContext(contextOptions: { showDefaults: boolean }): void
	onShown: {
		addListener(listener: (info: MenusOnShownInfo, tab: Tab) => void | Promise<void>): void
	}
	onHidden: {
		addListener(listener: () => void | Promise<void>): void
	}
	onClicked: {
		addListener(listener: (info: MenusOnClickInfo, tab?: Tab) => void | Promise<void>): void
	}
}

export interface TabsApi {
	create(details: { cookieStoreId?: string; url?: string; index?: number; windowId?: number }): Promise<Tab>
	remove(tabId: number): Promise<void>
	get(tabId: number): Promise<Tab>
	query(queryInfo: { windowId?: number; active?: boolean; currentWindow?: boolean }): Promise<Tab[]>
	update(tabId: number, updateProperties: { url?: string }): Promise<Tab>
	onUpdated: {
		addListener(listener: (id: number, changeInfo: TabChangeInfo, tab: Tab) => void | Promise<void>): void
	}
}

export interface ContextualIdentitiesApi {
	query(details: Record<string, unknown>): Promise<ContextualIdentity[]>
	get(cookieStoreId: string): Promise<ContextualIdentity>
}

export interface StorageLocalApi {
	get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>
	set(items: Record<string, unknown>): Promise<void>
}

export interface StorageChange {
	oldValue?: unknown
	newValue?: unknown
}

export interface StorageApi {
	local: StorageLocalApi
	onChanged: {
		addListener(listener: (changes: Record<string, StorageChange>) => void): void
	}
}

export interface BrowserApi {
	menus: MenusApi
	tabs: TabsApi
	contextualIdentities: ContextualIdentitiesApi
	storage: StorageApi
	runtime: RuntimeApi
	management: ManagementApi
}

export interface LoggerLike {
	log: (...args: unknown[]) => void
}
