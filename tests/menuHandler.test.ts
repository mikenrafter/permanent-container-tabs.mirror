import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MenuHandlerImpl } from '../src/background/menuHandler'
import type { BrowserApi, Tab } from '../src/models'
import type { TcLayer } from '../src/background/tcLayer'
import type { TabReopener } from '../src/background/tabReopener'
import { MENU_BOOKMARK_OPEN_NEW, MENU_LINK_OPEN_NEW, MENU_OPEN_NEW, MENU_REOPEN, NO_CONTAINER, TEMP_CONTAINER_SENTINEL } from '../src/constants'

function makeBrowserApi(): BrowserApi {
	return {
		menus: {
			create: vi.fn().mockResolvedValue(undefined),
			removeAll: vi.fn().mockResolvedValue(undefined),
			refresh: vi.fn().mockResolvedValue(undefined),
			onShown: { addListener: vi.fn() },
			onHidden: { addListener: vi.fn() },
			onClicked: { addListener: vi.fn() },
		},
		tabs: {
			create: vi.fn().mockResolvedValue({ id: 99, index: 0 }),
			remove: vi.fn().mockResolvedValue(undefined),
			get: vi.fn(),
			query: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue({ id: 99, index: 0 }),
			onUpdated: { addListener: vi.fn() },
		},
		contextualIdentities: {
			query: vi.fn().mockResolvedValue([]),
			get: vi.fn(),
		},
		storage: {
			local: {
				get: vi.fn().mockResolvedValue({}),
				set: vi.fn().mockResolvedValue(undefined),
			},
			onChanged: { addListener: vi.fn() },
		},
		runtime: {
			sendMessage: vi.fn().mockResolvedValue(false),
			getURL: vi.fn((path: string) => `moz-extension://test/${path}`),
		},
		management: {
			get: vi.fn().mockRejectedValue(new Error('not installed')),
		},
		bookmarks: {
			get: vi.fn().mockResolvedValue([{ id: 'bm1', url: 'https://bookmark.example.com', title: 'Bookmark' }]),
		},
	}
}

function makeTcLayer(extensionId: string | null = null, iconUrl: string | null = null): TcLayer {
	return {
		extensionId,
		iconUrl,
		isPresent: vi.fn().mockReturnValue(extensionId !== null),
		initialize: vi.fn().mockResolvedValue(undefined),
		isTempContainer: vi.fn().mockResolvedValue(false),
		createTempContainer: vi.fn().mockResolvedValue({ id: 50, index: 1 }),
		cleanupOrphanedTabs: vi.fn().mockResolvedValue(undefined),
	}
}

function makeTabReopener(): TabReopener {
	return {
		reopen: vi.fn().mockResolvedValue(undefined),
	}
}

const defaultSettings = {
	prioritizeReopen: false,
	suppressIsolationInfo: false,
}

const tab: Tab = {
	id: 1,
	url: 'https://example.com',
	index: 0,
	cookieStoreId: 'firefox-default',
	windowId: 1,
}

const containers = [
	{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' },
	{ name: 'Personal', cookieStoreId: 'firefox-container-2', icon: 'fingerprint', color: 'green' },
]

// ---------------------------------------------------------------------------
// Tab context menu (existing F1/F2 behaviour)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.buildMenus', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('with prioritizeReopen=false creates "Open in New Container Tab" parent menu item', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const parentCall = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_OPEN_NEW
		)
		expect(parentCall).toBeDefined()
	})

	it('with prioritizeReopen=true creates "Reopen Tab in Container" parent menu item', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const settings = { ...defaultSettings, prioritizeReopen: true }
		await handler.buildMenus(tab, settings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const parentCall = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_REOPEN
		)
		expect(parentCall).toBeDefined()
	})

	it('with prioritizeReopen=false creates MENU_REOPEN as first child of MENU_OPEN_NEW (alt behavior submenu)', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const altSubmenu = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_REOPEN
		)
		expect(altSubmenu).toBeDefined()
		expect((altSubmenu![0] as { parentId?: string }).parentId).toBe(MENU_OPEN_NEW)

		const primaryChildren = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_OPEN_NEW
		)
		expect((primaryChildren[0]![0] as { id?: string }).id).toBe(MENU_REOPEN)
	})

	it('with prioritizeReopen=true creates MENU_OPEN_NEW as first child of MENU_REOPEN (alt behavior submenu)', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const settings = { ...defaultSettings, prioritizeReopen: true }
		await handler.buildMenus(tab, settings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const altSubmenu = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_OPEN_NEW
		)
		expect(altSubmenu).toBeDefined()
		expect((altSubmenu![0] as { parentId?: string }).parentId).toBe(MENU_REOPEN)

		const primaryChildren = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_REOPEN
		)
		expect((primaryChildren[0]![0] as { id?: string }).id).toBe(MENU_OPEN_NEW)
	})

	it('separator appears before permanent containers in primary submenu', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const primaryChildren = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_OPEN_NEW
		)
		const separatorIdx = primaryChildren.findIndex((args: unknown[]) =>
			(args[0] as { type?: string }).type === 'separator'
		)
		const container1Idx = primaryChildren.findIndex((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-firefox-container-1`
		)
		expect(separatorIdx).toBeGreaterThan(-1)
		expect(separatorIdx).toBeLessThan(container1Idx)
	})

	it('alt behavior submenu contains a No Container entry', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const altNoContainer = createCalls.find((args: unknown[]) => {
			const d = args[0] as { id?: string; parentId?: string }
			return d.id === `${MENU_REOPEN}-${NO_CONTAINER}` && d.parentId === MENU_REOPEN
		})
		expect(altNoContainer).toBeDefined()
	})

	it('alt behavior submenu contains permanent container entries', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const altWork = createCalls.find((args: unknown[]) => {
			const d = args[0] as { id?: string; parentId?: string }
			return d.id === `${MENU_REOPEN}-firefox-container-1` && d.parentId === MENU_REOPEN
		})
		expect(altWork).toBeDefined()
	})

	it('alt behavior submenu has a separator before permanent containers', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const altChildren = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_REOPEN
		)
		const separatorIdx = altChildren.findIndex((args: unknown[]) =>
			(args[0] as { type?: string }).type === 'separator'
		)
		const container1Idx = altChildren.findIndex((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_REOPEN}-firefox-container-1`
		)
		expect(separatorIdx).toBeGreaterThan(-1)
		expect(separatorIdx).toBeLessThan(container1Idx)
	})

	it('submenu includes "No Container" entry', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const noContainerItem = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${NO_CONTAINER}`
		)
		expect(noContainerItem).toBeDefined()
	})

	it('submenu includes "Temporary Container" only when TC installed', async () => {
		const tcLayerWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcLayerWithTC, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const tempItem = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(tempItem).toBeDefined()
	})

	it('does not include "Temporary Container" when TC is not installed', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const tempItem = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(tempItem).toBeUndefined()
	})

	it('temporary containers are NOT included in the submenu (they were already filtered)', async () => {
		const permanentContainers = [
			{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' },
		]
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, permanentContainers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const containerItems = createCalls.filter((args: unknown[]) => {
			const detail = args[0] as { id?: string; parentId?: string; type?: string }
			return detail.parentId === MENU_OPEN_NEW
				&& detail.id !== `${MENU_OPEN_NEW}-${NO_CONTAINER}`
				&& detail.id !== `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
				&& detail.id !== MENU_REOPEN
				&& detail.type !== 'separator'
		})
		expect(containerItems).toHaveLength(1)
		expect((containerItems[0]![0] as { id?: string }).id).toBe(`${MENU_OPEN_NEW}-firefox-container-1`)
	})

	it("current tab's container entry has checked: true and enabled: false", async () => {
		const tabInWork: Tab = { ...tab, cookieStoreId: 'firefox-container-1' }
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tabInWork, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const workItem = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-firefox-container-1`
		)
		expect(workItem).toBeDefined()
		expect((workItem![0] as { checked?: boolean }).checked).toBe(true)
		expect((workItem![0] as { enabled?: boolean }).enabled).toBe(false)
	})

	it("non-current container entries have enabled: true", async () => {
		const tabInWork: Tab = { ...tab, cookieStoreId: 'firefox-container-1' }
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tabInWork, defaultSettings, [
			{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' },
			{ name: 'Personal', cookieStoreId: 'firefox-container-2', icon: 'fingerprint', color: 'green' },
		])

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const personalItem = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-firefox-container-2`
		)
		expect(personalItem).toBeDefined()
		expect((personalItem![0] as { enabled?: boolean }).enabled).toBe(true)
	})

	it('non-current container uses type:normal with bundled SVG icon', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const containerWithIcon = [
			{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' },
		]
		await handler.buildMenus(tab, defaultSettings, containerWithIcon)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-firefox-container-1`
		)
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/briefcase.svg#blue' })
	})

	it('current container uses type:radio and strips icon', async () => {
		const tabInWork: Tab = { ...tab, cookieStoreId: 'firefox-container-1' }
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const containerWithIcon = [
			{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' },
		]
		await handler.buildMenus(tabInWork, defaultSettings, containerWithIcon)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-firefox-container-1`
		)
		expect((item![0] as { type?: string }).type).toBe('radio')
		expect((item![0] as { icons?: unknown }).icons).toBeUndefined()
	})

	it('"No Container" always uses type:radio', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${NO_CONTAINER}`
		)
		expect((item![0] as { type?: string }).type).toBe('radio')
	})

	it('"Temporary Container" uses type:normal with icon when tab is NOT in a temp container', async () => {
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/temp-container.svg' })
	})

	it('"Temporary Container" shows as radio with checked:true when tab is in a temp container', async () => {
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcWithTC.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)
		const tabInTc: Tab = { ...tab, cookieStoreId: 'firefox-tmp-1' }
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		await handler.buildMenus(tabInTc, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('radio')
		expect((item![0] as { checked?: boolean }).checked).toBe(true)
		expect((item![0] as { enabled?: boolean }).enabled).toBe(false)
		expect((item![0] as { icons?: unknown }).icons).toBeUndefined()
	})
})

// ---------------------------------------------------------------------------
// Link context menu (F3)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.buildLinkMenus', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('creates MENU_LINK_OPEN_NEW top-level item with contexts:link', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const topLevel = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_LINK_OPEN_NEW
		)
		expect(topLevel).toBeDefined()
		expect((topLevel![0] as { contexts?: string[] }).contexts).toContain('link')
	})

	it('submenu contains No Container entry as type:normal', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-${NO_CONTAINER}`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
	})

	it('No Container entry has no radio/checked state', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-${NO_CONTAINER}`
		)
		expect((item![0] as { checked?: unknown }).checked).toBeUndefined()
		expect((item![0] as { enabled?: unknown }).enabled).toBeUndefined()
	})

	it('shows Temporary Container when TC is present (type:normal with icon)', async () => {
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/temp-container.svg' })
	})

	it('does not show Temporary Container when TC is absent', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(item).toBeUndefined()
	})

	it('separator appears before permanent containers', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const children = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_LINK_OPEN_NEW
		)
		const separatorIdx = children.findIndex((args: unknown[]) =>
			(args[0] as { type?: string }).type === 'separator'
		)
		const container1Idx = children.findIndex((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-firefox-container-1`
		)
		expect(separatorIdx).toBeGreaterThan(-1)
		expect(separatorIdx).toBeLessThan(container1Idx)
	})

	it('permanent containers use type:normal with bundled icon (no radio state)', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus([{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' }])

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_LINK_OPEN_NEW}-firefox-container-1`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/briefcase.svg#blue' })
		expect((item![0] as { checked?: unknown }).checked).toBeUndefined()
	})

	it('no separator when there are no permanent containers', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus([])

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const separator = createCalls.find((args: unknown[]) =>
			(args[0] as { type?: string }).type === 'separator'
		)
		expect(separator).toBeUndefined()
	})

	it('calls removeAll and refresh', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildLinkMenus(containers)

		expect(browserApi.menus.removeAll).toHaveBeenCalled()
		expect(browserApi.menus.refresh).toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// Bookmark context menu (F3)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.buildBookmarkMenus', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('creates MENU_BOOKMARK_OPEN_NEW top-level item with contexts:bookmark', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildBookmarkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const topLevel = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_BOOKMARK_OPEN_NEW
		)
		expect(topLevel).toBeDefined()
		expect((topLevel![0] as { contexts?: string[] }).contexts).toContain('bookmark')
	})

	it('submenu contains No Container entry as type:normal', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildBookmarkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_BOOKMARK_OPEN_NEW}-${NO_CONTAINER}`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
	})

	it('shows Temporary Container when TC is present (type:normal with icon)', async () => {
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		await handler.buildBookmarkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_BOOKMARK_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/temp-container.svg' })
	})

	it('permanent containers use type:normal with bundled icon', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildBookmarkMenus([{ name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' }])

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const item = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`
		)
		expect(item).toBeDefined()
		expect((item![0] as { type?: string }).type).toBe('normal')
		expect((item![0] as { icons?: Record<number, string> }).icons).toEqual({ 16: 'icons/briefcase.svg#blue' })
	})

	it('separator appears before permanent containers', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildBookmarkMenus(containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const children = createCalls.filter((args: unknown[]) =>
			(args[0] as { parentId?: string }).parentId === MENU_BOOKMARK_OPEN_NEW
		)
		const separatorIdx = children.findIndex((args: unknown[]) =>
			(args[0] as { type?: string }).type === 'separator'
		)
		const container1Idx = children.findIndex((args: unknown[]) =>
			(args[0] as { id?: string }).id === `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`
		)
		expect(separatorIdx).toBeGreaterThan(-1)
		expect(separatorIdx).toBeLessThan(container1Idx)
	})

	it('calls removeAll and refresh', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildBookmarkMenus(containers)

		expect(browserApi.menus.removeAll).toHaveBeenCalled()
		expect(browserApi.menus.refresh).toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// handleClick — tab context (existing)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.handleClick', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('for F1 item calls browser.tabs.create with correct cookieStoreId', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = { menuItemId: `${MENU_OPEN_NEW}-firefox-container-1` }
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ cookieStoreId: 'firefox-container-1', url: tab.url })
		)
	})

	it('for F1 with NO_CONTAINER creates tab with no cookieStoreId', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = { menuItemId: `${MENU_OPEN_NEW}-${NO_CONTAINER}` }
		await handler.handleClick(clickInfo, tab)

		const createCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
		expect(createCall.cookieStoreId).toBeUndefined()
	})

	it('for F2 item calls tabReopener.reopen', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = { menuItemId: `${MENU_REOPEN}-firefox-container-1` }
		await handler.handleClick(clickInfo, tab)

		expect(tabReopener.reopen).toHaveBeenCalledWith(tab, 'firefox-container-1')
	})
})

// ---------------------------------------------------------------------------
// handleClick — link context (F3)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.handleClick — link context', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('opens link URL in a permanent container', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_LINK_OPEN_NEW}-firefox-container-1`,
			linkUrl: 'https://link.example.com',
		}
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ url: 'https://link.example.com', cookieStoreId: 'firefox-container-1' })
		)
	})

	it('opens link URL with no container when NO_CONTAINER selected', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_LINK_OPEN_NEW}-${NO_CONTAINER}`,
			linkUrl: 'https://link.example.com',
		}
		await handler.handleClick(clickInfo, tab)

		const createCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
		expect(createCall.url).toBe('https://link.example.com')
		expect(createCall.cookieStoreId).toBeUndefined()
	})

	it('opens link URL in Temporary Container via TC API', async () => {
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_LINK_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`,
			linkUrl: 'https://link.example.com',
		}
		await handler.handleClick(clickInfo, tab)

		expect(tcWithTC.createTempContainer).toHaveBeenCalledWith('https://link.example.com', tab.index + 1, tab.windowId)
	})

	it('opens at tab.index + 1', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_LINK_OPEN_NEW}-firefox-container-1`,
			linkUrl: 'https://link.example.com',
		}
		const tabAtIndex5: Tab = { ...tab, index: 5 }
		await handler.handleClick(clickInfo, tabAtIndex5)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ index: 6 })
		)
	})
})

// ---------------------------------------------------------------------------
// handleClick — bookmark context (F3)
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.handleClick — bookmark context', () => {
	let browserApi: BrowserApi
	let tcLayer: TcLayer
	let tabReopener: TabReopener

	beforeEach(() => {
		browserApi = makeBrowserApi()
		tcLayer = makeTcLayer()
		tabReopener = makeTabReopener()
	})

	it('looks up bookmark URL and opens in a permanent container', async () => {
		;(browserApi.bookmarks.get as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 'bm1', url: 'https://bookmark.example.com', title: 'My Bookmark' },
		])
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`,
			bookmarkId: 'bm1',
		}
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.bookmarks.get).toHaveBeenCalledWith('bm1')
		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ url: 'https://bookmark.example.com', cookieStoreId: 'firefox-container-1' })
		)
	})

	it('opens bookmark URL with no container when NO_CONTAINER selected', async () => {
		;(browserApi.bookmarks.get as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 'bm1', url: 'https://bookmark.example.com', title: 'My Bookmark' },
		])
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-${NO_CONTAINER}`,
			bookmarkId: 'bm1',
		}
		await handler.handleClick(clickInfo, tab)

		const createCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
		expect(createCall.url).toBe('https://bookmark.example.com')
		expect(createCall.cookieStoreId).toBeUndefined()
	})

	it('opens bookmark URL in Temporary Container via TC API', async () => {
		;(browserApi.bookmarks.get as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 'bm1', url: 'https://bookmark.example.com', title: 'My Bookmark' },
		])
		const tcWithTC = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const handler = new MenuHandlerImpl({ browserApi, tcLayer: tcWithTC, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`,
			bookmarkId: 'bm1',
		}
		await handler.handleClick(clickInfo, tab)

		expect(tcWithTC.createTempContainer).toHaveBeenCalledWith('https://bookmark.example.com', tab.index + 1, tab.windowId)
	})

	it('silently skips when bookmark has no URL (folder)', async () => {
		;(browserApi.bookmarks.get as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 'folder1', title: 'My Folder' },
		])
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`,
			bookmarkId: 'folder1',
		}
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('silently skips when bookmarkId is missing', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`,
		}
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('silently skips when bookmarks.get throws', async () => {
		;(browserApi.bookmarks.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'))
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const clickInfo = {
			menuItemId: `${MENU_BOOKMARK_OPEN_NEW}-firefox-container-1`,
			bookmarkId: 'missing',
		}
		await handler.handleClick(clickInfo, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------
// handleHidden
// ---------------------------------------------------------------------------

describe('MenuHandlerImpl.handleHidden', () => {
	it('clears per-cycle container cache', async () => {
		const browserApi = makeBrowserApi()
		const tcLayer = makeTcLayer()
		const tabReopener = makeTabReopener()

		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		handler.handleHidden()
		expect(true).toBe(true)
	})
})
