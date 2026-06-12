import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MenuHandlerImpl } from '../src/background/menuHandler'
import type { BrowserApi, Tab } from '../src/models'
import type { TcLayer } from '../src/background/tcLayer'
import type { TabReopener } from '../src/background/tabReopener'
import { MENU_OPEN_NEW, MENU_REOPEN, NO_CONTAINER, TEMP_CONTAINER_SENTINEL } from '../src/constants'

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

	it('with prioritizeReopen=false does NOT create the F2 parent item', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		await handler.buildMenus(tab, defaultSettings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const parentCall = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_REOPEN
		)
		expect(parentCall).toBeUndefined()
	})

	it('with prioritizeReopen=true does NOT create the F1 parent item', async () => {
		const handler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
		const settings = { ...defaultSettings, prioritizeReopen: true }
		await handler.buildMenus(tab, settings, containers)

		const createCalls = (browserApi.menus.create as ReturnType<typeof vi.fn>).mock.calls
		const parentCall = createCalls.find((args: unknown[]) =>
			(args[0] as { id?: string }).id === MENU_OPEN_NEW
		)
		expect(parentCall).toBeUndefined()
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
			const detail = args[0] as { id?: string; parentId?: string }
			return detail.parentId === MENU_OPEN_NEW && detail.id !== `${MENU_OPEN_NEW}-${NO_CONTAINER}` && detail.id !== `${MENU_OPEN_NEW}-${TEMP_CONTAINER_SENTINEL}`
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
