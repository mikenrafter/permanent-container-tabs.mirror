import { describe, it, expect, vi, beforeEach } from 'vitest'
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
			overrideContext: vi.fn(),
			onShown: { addListener: vi.fn() },
			onHidden: { addListener: vi.fn() },
			onClicked: { addListener: vi.fn() },
		},
		tabs: {
			create: vi.fn().mockResolvedValue({ id: 99, index: 1 }),
			remove: vi.fn().mockResolvedValue(undefined),
			get: vi.fn(),
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
		cleanupOrphanedTabs: vi.fn().mockResolvedValue(undefined),
	}
}

const sourceTab: Tab = {
	id: 10,
	url: 'https://example.com',
	index: 2,
	cookieStoreId: 'firefox-default',
	windowId: 1,
}

describe('TabReopenerImpl.reopen', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('reopen with NO_CONTAINER creates tab at index+1 without cookieStoreId', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, NO_CONTAINER)

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://example.com',
				index: 3,
			})
		)
		const createArg = (browserApi.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
		expect(createArg.cookieStoreId).toBeUndefined()
	})

	it('reopen with NO_CONTAINER closes original tab', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, NO_CONTAINER)

		expect(browserApi.tabs.remove).toHaveBeenCalledWith(10)
	})

	it('reopen with TEMP_CONTAINER_SENTINEL calls tcLayer.createTempContainer', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, TEMP_CONTAINER_SENTINEL)

		expect(tcLayer.createTempContainer).toHaveBeenCalledWith('https://example.com', 3, 1)
	})

	it('reopen with TEMP_CONTAINER_SENTINEL closes original tab', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, TEMP_CONTAINER_SENTINEL)

		expect(browserApi.tabs.remove).toHaveBeenCalledWith(10)
	})

	it('reopen with a permanent cookieStoreId creates tab with that cookieStoreId', async () => {
		const tcLayer = makeTcLayer()
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, 'firefox-container-1')

		expect(browserApi.tabs.create).toHaveBeenCalledWith(
			expect.objectContaining({
				cookieStoreId: 'firefox-container-1',
				url: 'https://example.com',
				index: 3,
			})
		)
	})

	it('after reopen, cleanupOrphanedTabs is called when TC is present', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		// Set up some pre-existing tabs
		;(browserApi.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: 1, index: 0, url: 'https://other.com', cookieStoreId: 'firefox-default', windowId: 1 },
			{ id: 10, index: 2, url: 'https://example.com', cookieStoreId: 'firefox-default', windowId: 1 },
		])

		await reopener.reopen(sourceTab, 'firefox-container-1')

		expect(tcLayer.cleanupOrphanedTabs).toHaveBeenCalledWith(
			1,
			expect.any(Set)
		)
	})

	it('cleanupOrphanedTabs is NOT called when TC is absent', async () => {
		const tcLayer = makeTcLayer(null)
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, 'firefox-container-1')

		expect(tcLayer.cleanupOrphanedTabs).not.toHaveBeenCalled()
	})

	it('does NOT remove the newly created tab during cleanup', async () => {
		const tcLayer = makeTcLayer('{c607c8df-14a7-4f28-894f-29e8722976af}')
		// createTempContainer returns a tab with id=50
		;(tcLayer.createTempContainer as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: 50, index: 3, cookieStoreId: 'firefox-tmp-1', windowId: 1,
		})
		const reopener = new TabReopenerImpl({ browserApi, tcLayer })

		await reopener.reopen(sourceTab, TEMP_CONTAINER_SENTINEL)

		// cleanupOrphanedTabs should be called but with the new tab's ID in preTabIds
		const cleanupCall = (tcLayer.cleanupOrphanedTabs as ReturnType<typeof vi.fn>).mock.calls[0]
		if (cleanupCall) {
			const preTabIds: Set<number | undefined> = cleanupCall[1]
			expect(preTabIds.has(50)).toBe(true)
		}
	})
})
