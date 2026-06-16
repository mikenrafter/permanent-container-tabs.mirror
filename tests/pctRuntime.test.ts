import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PctRuntimeImpl } from '../src/background/pctRuntime'
import type { BrowserApi, Tab, TabChangeInfo } from '../src/models'
import type { TcLayer } from '../src/background/tcLayer'
import type { MenuHandler } from '../src/background/menuHandler'

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

function makeTcLayer(extensionId: string | null = null): TcLayer {
	return {
		extensionId,
		iconUrl: null,
		isPresent: vi.fn().mockReturnValue(extensionId !== null),
		initialize: vi.fn().mockResolvedValue(undefined),
		isTempContainer: vi.fn().mockResolvedValue(extensionId !== null),
		createTempContainer: vi.fn().mockResolvedValue({ id: 50, index: 1 }),
		cleanupOrphanedTabs: vi.fn().mockResolvedValue(undefined),
	}
}

function makeMenuHandler(): MenuHandler {
	return {
		initialize: vi.fn().mockResolvedValue(undefined),
		buildMenus: vi.fn().mockResolvedValue(undefined),
		buildLinkMenus: vi.fn().mockResolvedValue(undefined),
		buildBookmarkMenus: vi.fn().mockResolvedValue(undefined),
		handleClick: vi.fn().mockResolvedValue(undefined),
		handleHidden: vi.fn(),
		markTabAsPctOpened: vi.fn(),
	}
}

describe('PctRuntimeImpl.initialize', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('calls tcLayer.initialize() and menuHandler.initialize()', async () => {
		const tcLayer = makeTcLayer()
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		expect(tcLayer.initialize).toHaveBeenCalled()
		expect(menuHandler.initialize).toHaveBeenCalled()
	})

	it('registers menus.onShown listener', async () => {
		const tcLayer = makeTcLayer()
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		expect(browserApi.menus.onShown.addListener).toHaveBeenCalled()
	})

	it('registers menus.onHidden listener', async () => {
		const tcLayer = makeTcLayer()
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		expect(browserApi.menus.onHidden.addListener).toHaveBeenCalled()
	})

	it('registers menus.onClicked listener', async () => {
		const tcLayer = makeTcLayer()
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		expect(browserApi.menus.onClicked.addListener).toHaveBeenCalled()
	})

	it('registers tabs.onUpdated listener', async () => {
		const tcLayer = makeTcLayer()
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		expect(browserApi.tabs.onUpdated.addListener).toHaveBeenCalled()
	})

})

// ---------------------------------------------------------------------------
// onShown context routing
// ---------------------------------------------------------------------------

describe('PctRuntimeImpl onShown context routing', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	async function setupAndGetOnShownListener(
		menuHandler: MenuHandler,
	): Promise<(info: { contexts: string[] }, tab: Tab) => void> {
		const tcLayer = makeTcLayer()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		const addListenerCalls = (browserApi.menus.onShown.addListener as ReturnType<typeof vi.fn>).mock.calls
		return addListenerCalls[0]?.[0] as (info: { contexts: string[] }, tab: Tab) => void
	}

	const stubTab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-default', windowId: 1 }

	it('tab context calls menuHandler.buildMenus', async () => {
		const menuHandler = makeMenuHandler()
		const listener = await setupAndGetOnShownListener(menuHandler)

		listener({ contexts: ['tab'] }, stubTab)
		// allow microtasks to flush
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildMenus).toHaveBeenCalled()
		expect(menuHandler.buildLinkMenus).not.toHaveBeenCalled()
		expect(menuHandler.buildBookmarkMenus).not.toHaveBeenCalled()
	})

	it('link context calls menuHandler.buildLinkMenus', async () => {
		const menuHandler = makeMenuHandler()
		const listener = await setupAndGetOnShownListener(menuHandler)

		listener({ contexts: ['link'] }, stubTab)
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildLinkMenus).toHaveBeenCalled()
		expect(menuHandler.buildMenus).not.toHaveBeenCalled()
		expect(menuHandler.buildBookmarkMenus).not.toHaveBeenCalled()
	})

	it('bookmark context calls menuHandler.buildBookmarkMenus', async () => {
		const menuHandler = makeMenuHandler()
		const listener = await setupAndGetOnShownListener(menuHandler)

		listener({ contexts: ['bookmark'] }, stubTab)
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildBookmarkMenus).toHaveBeenCalled()
		expect(menuHandler.buildMenus).not.toHaveBeenCalled()
		expect(menuHandler.buildLinkMenus).not.toHaveBeenCalled()
	})

	it('unrecognised context calls none of the build methods', async () => {
		const menuHandler = makeMenuHandler()
		const listener = await setupAndGetOnShownListener(menuHandler)

		listener({ contexts: ['page'] }, stubTab)
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildMenus).not.toHaveBeenCalled()
		expect(menuHandler.buildLinkMenus).not.toHaveBeenCalled()
		expect(menuHandler.buildBookmarkMenus).not.toHaveBeenCalled()
	})

	it('link context passes filtered permanent containers to buildLinkMenus', async () => {
		const permanentContainer = { name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' }
		const tempContainer = { name: 'Tmp-1', cookieStoreId: 'firefox-tmp-1', icon: 'circle', color: 'red' }
		;(browserApi.contextualIdentities.query as ReturnType<typeof vi.fn>).mockResolvedValue([permanentContainer, tempContainer])

		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
			Promise.resolve(id === 'firefox-tmp-1')
		)
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		const listener = (browserApi.menus.onShown.addListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
			(info: { contexts: string[] }, tab: Tab) => void

		listener({ contexts: ['link'] }, stubTab)
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildLinkMenus).toHaveBeenCalledWith([permanentContainer])
	})

	it('bookmark context passes filtered permanent containers to buildBookmarkMenus', async () => {
		const permanentContainer = { name: 'Work', cookieStoreId: 'firefox-container-1', icon: 'briefcase', color: 'blue' }
		const tempContainer = { name: 'Tmp-1', cookieStoreId: 'firefox-tmp-1', icon: 'circle', color: 'red' }
		;(browserApi.contextualIdentities.query as ReturnType<typeof vi.fn>).mockResolvedValue([permanentContainer, tempContainer])

		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
			Promise.resolve(id === 'firefox-tmp-1')
		)
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		const listener = (browserApi.menus.onShown.addListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
			(info: { contexts: string[] }, tab: Tab) => void

		listener({ contexts: ['bookmark'] }, stubTab)
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(menuHandler.buildBookmarkMenus).toHaveBeenCalledWith([permanentContainer])
	})
})

// ---------------------------------------------------------------------------
// tabs.onUpdated isolation info (existing)
// ---------------------------------------------------------------------------

describe('PctRuntimeImpl tabs.onUpdated isolation info', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	async function setupAndGetListener(
		tcLayer: TcLayer,
		storageData: Record<string, unknown> = {}
	): Promise<(id: number, changeInfo: TabChangeInfo, tab: Tab) => Promise<void>> {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue(storageData)
		const menuHandler = makeMenuHandler()
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		const addListenerCalls = (browserApi.tabs.onUpdated.addListener as ReturnType<typeof vi.fn>).mock.calls
		const listener = addListenerCalls[0]?.[0] as (id: number, changeInfo: TabChangeInfo, tab: Tab) => Promise<void>
		return listener
	}

	it('opens info page when tab gets a temp container cookieStoreId', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const listener = await setupAndGetListener(tcLayer, { prioritizeReopen: false, suppressIsolationInfo: false })

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-tmp-1', windowId: 1 }
		await listener(1, { cookieStoreId: 'firefox-tmp-1' }, tab)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ url: expect.stringContaining('isolation-info.html') })
		)
	})

	it('does NOT open info page when suppressIsolationInfo=true', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const listener = await setupAndGetListener(tcLayer, { prioritizeReopen: false, suppressIsolationInfo: true })

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-tmp-1', windowId: 1 }
		await listener(1, { cookieStoreId: 'firefox-tmp-1' }, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('does NOT open info page when cookieStoreId change is NOT a temp container', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(false)

		const listener = await setupAndGetListener(tcLayer)

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-container-1', windowId: 1 }
		await listener(1, { cookieStoreId: 'firefox-container-1' }, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('does NOT open info page when changeInfo has no cookieStoreId', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const listener = await setupAndGetListener(tcLayer)

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-tmp-1', windowId: 1 }
		// No cookieStoreId in changeInfo
		await listener(1, { url: 'https://example.com' }, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('does NOT open info page for a PCT-opened tab', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const menuHandler = makeMenuHandler()
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({})
		const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })
		await runtime.initialize()

		// Mark tab 1 as PCT-opened
		runtime.markTabAsPctOpened(1)

		const addListenerCalls = (browserApi.tabs.onUpdated.addListener as ReturnType<typeof vi.fn>).mock.calls
		const listener = addListenerCalls[0]?.[0] as (id: number, changeInfo: TabChangeInfo, tab: Tab) => Promise<void>

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-tmp-1', windowId: 1 }
		await listener(1, { cookieStoreId: 'firefox-tmp-1' }, tab)

		expect(browserApi.tabs.create).not.toHaveBeenCalled()
	})

	it('opens info page via tabs.create with isolation-info.html URL', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const listener = await setupAndGetListener(tcLayer, { prioritizeReopen: false, suppressIsolationInfo: false })

		const tab: Tab = { id: 1, url: 'https://example.com', index: 0, cookieStoreId: 'firefox-tmp-1', windowId: 1 }
		await listener(1, { cookieStoreId: 'firefox-tmp-1' }, tab)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({ url: 'moz-extension://test/info/isolation-info.html' })
		)
	})
})
