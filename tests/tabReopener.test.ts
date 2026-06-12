import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TabReopenerImpl } from '../src/background/tabReopener'
import type { BrowserApi, Tab } from '../src/models'
import type { TcLayer } from '../src/background/tcLayer'
import { NO_CONTAINER, TEMP_CONTAINER_SENTINEL } from '../src/constants'

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
			create: vi.fn().mockResolvedValue({ id: 99, index: 1 }),
			remove: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue({ id: 99, index: 1, cookieStoreId: 'firefox-container-1' }),
			query: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockResolvedValue({ id: 99, index: 1 }),
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

function makeTcLayer(extensionId: string | null = null): TcLayer {
	return {
		extensionId,
		iconUrl: null,
		isPresent: vi.fn().mockReturnValue(extensionId !== null),
		initialize: vi.fn().mockResolvedValue(undefined),
		isTempContainer: vi.fn().mockResolvedValue(false),
		createTempContainer: vi.fn().mockResolvedValue({ id: 50, index: 1, cookieStoreId: 'firefox-tmp-1' }),
	}
}

const sourceTab: Tab = {
	id: 10,
	url: 'https://example.com',
	index: 2,
	cookieStoreId: 'firefox-default',
	windowId: 1,
}

describe('TabReopenerImpl.reopen — basic open/close', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('reopen with NO_CONTAINER creates tab at index+1 with active:true, no cookieStoreId', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		const promise = reopener.reopen(sourceTab, NO_CONTAINER)
		await vi.runAllTimersAsync()
		await promise

		const createArg = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
		expect(createArg.url).toBe('https://example.com')
		expect(createArg.index).toBe(3)
		expect(createArg.active).toBe(true)
		expect(createArg.cookieStoreId).toBeUndefined()
	})

	it('reopen with NO_CONTAINER closes original tab', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		const promise = reopener.reopen(sourceTab, NO_CONTAINER)
		await vi.runAllTimersAsync()
		await promise

		expect(browserApi.tabs.remove).toHaveBeenCalledWith(10)
	})

	it('reopen with TEMP_CONTAINER_SENTINEL calls tcLayer.createTempContainer', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		const promise = reopener.reopen(sourceTab, TEMP_CONTAINER_SENTINEL)
		await vi.runAllTimersAsync()
		await promise

		expect(tcLayer.createTempContainer).toHaveBeenCalledWith('https://example.com', 3, 1)
	})

	it('reopen with TEMP_CONTAINER_SENTINEL closes original tab', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		const promise = reopener.reopen(sourceTab, TEMP_CONTAINER_SENTINEL)
		await vi.runAllTimersAsync()
		await promise

		expect(browserApi.tabs.remove).toHaveBeenCalledWith(10)
	})

	it('reopen with a permanent cookieStoreId creates tab with that cookieStoreId and active:true', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		const promise = reopener.reopen(sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({
				cookieStoreId: 'firefox-container-1',
				url: 'https://example.com',
				index: 3,
				active: true,
			})
		)
	})
})

describe('TabReopenerImpl.reopen — TC intercept check', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('opens isolation info in a new active tab when TC intercepted and suppressIsolationInfo=false', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 99, index: 1, cookieStoreId: 'firefox-tmp-42',
		})
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			suppressIsolationInfo: false,
		})

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		const createCalls = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls
		const infoCall = createCalls.find((args: unknown[]) =>
			(args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeDefined()
		expect((infoCall![0] as { active?: boolean }).active).toBe(true)
	})

	it('does NOT open info page when suppressIsolationInfo=true', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 99, index: 1, cookieStoreId: 'firefox-tmp-42',
		})
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			suppressIsolationInfo: true,
		})

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		const createCalls = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls
		const infoCall = createCalls.find((args: unknown[]) =>
			(args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeUndefined()
	})

	it('does NOT open info page when TC is not present', async () => {
		const tcLayer = makeTcLayer(null)
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 99, index: 1, cookieStoreId: 'firefox-container-1',
		})

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		const createCalls = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls
		const infoCall = createCalls.find((args: unknown[]) =>
			(args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeUndefined()
	})

	it('does NOT open info page when new tab is in a permanent container (no TC intercept)', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(false)
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 99, index: 1, cookieStoreId: 'firefox-container-1',
		})

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		const createCalls = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls
		const infoCall = createCalls.find((args: unknown[]) =>
			(args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeUndefined()
	})

	it('continues polling (does not stop) when tabs.get throws, resolves after exhausting polls', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No tab with id: 99'))

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await expect(promise).resolves.toBeUndefined()
		// tabs.get was attempted on every poll despite throwing each time
		expect(browserApi.tabs.get).toHaveBeenCalledTimes(10)
	})

	it('detects TC replacement tab with matching URL when original tab was removed', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No tab with id: 99'))
		;(browserApi.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 200, url: 'https://example.com', cookieStoreId: 'firefox-tmp-1', index: 1, windowId: 1 },
		])
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockImplementation(
			async (id: string) => id.startsWith('firefox-tmp')
		)
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ suppressIsolationInfo: false })

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.advanceTimersByTimeAsync(500) // first poll: tabs.get throws, scan finds TC replacement
		await promise

		const infoCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls.find(
			(args: unknown[]) => (args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeDefined()
		expect((infoCall![0] as { active?: boolean }).active).toBe(true)
	})

	it('ignores TC replacement tab whose URL does not match the original', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No tab with id: 99'))
		;(browserApi.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 200, url: 'https://different.com', cookieStoreId: 'firefox-tmp-1', index: 1, windowId: 1 },
		])
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(true)

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		const infoCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls.find(
			(args: unknown[]) => (args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeUndefined()
	})

	it('skips TC intercept check entirely when chosen container is TEMP_CONTAINER_SENTINEL', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, TEMP_CONTAINER_SENTINEL)
		await vi.runAllTimersAsync()
		await promise

		expect(browserApi.tabs.get).not.toHaveBeenCalled()
	})

	it('initial check fires at 500ms, not before', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(false)

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')

		await vi.advanceTimersByTimeAsync(499)
		expect(browserApi.tabs.get).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(1)
		expect(browserApi.tabs.get).toHaveBeenCalledWith(99)

		await vi.runAllTimersAsync()
		await promise
	})

	it('polls every 200ms and stops immediately on TC detection', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		let calls = 0
		;(browserApi.tabs.get as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			calls++
			return { id: 99, index: 1, cookieStoreId: calls >= 3 ? 'firefox-tmp-1' : 'firefox-container-1' }
		})
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockImplementation(
			async (id: string) => id.startsWith('firefox-tmp')
		)
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			suppressIsolationInfo: false,
		})

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')

		await vi.advanceTimersByTimeAsync(500) // poll 1 — not TC
		expect(browserApi.tabs.get).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(200) // poll 2 — not TC
		expect(browserApi.tabs.get).toHaveBeenCalledTimes(2)

		await vi.advanceTimersByTimeAsync(200) // poll 3 — TC detected, info shown, stop
		await promise
		expect(browserApi.tabs.get).toHaveBeenCalledTimes(3)

		const infoCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls.find(
			(args: unknown[]) => (args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeDefined()
	})

	it('stops polling without showing info after exhausting 10 polls when no TC intercept', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		;(tcLayer.isTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue(false)

		const promise = reopener_reopen(browserApi, tcLayer, sourceTab, 'firefox-container-1')
		await vi.runAllTimersAsync()
		await promise

		expect(browserApi.tabs.get).toHaveBeenCalledTimes(10)
		const infoCall = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls.find(
			(args: unknown[]) => (args[0] as { url?: string }).url?.includes('isolation-info.html')
		)
		expect(infoCall).toBeUndefined()
	})
})

function reopener_reopen(browserApi: BrowserApi, tcLayer: TcLayer, tab: Tab, cookieStoreId: string) {
	const reopener = new TabReopenerImpl({ browserApi, tcLayer })
	return reopener.reopen(tab, cookieStoreId)
}
