import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TcLayerImpl } from '../src/background/tcLayer'
import type { BrowserApi } from '../src/models'

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

describe('TcLayerImpl.initialize', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('stores the first enabled TC extension ID', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
			if (id === '{c607c8df-14a7-4f28-894f-29e8722976af}') {
				return { id, name: 'Temporary Containers', enabled: true, type: 'extension' }
			}
			throw new Error('not installed')
		})
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.extensionId).toBe('{c607c8df-14a7-4f28-894f-29e8722976af}')
	})

	it('stores the 16px icon URL from the extension info', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
			if (id === '{c607c8df-14a7-4f28-894f-29e8722976af}') {
				return {
					id,
					name: 'Temporary Containers',
					enabled: true,
					type: 'extension',
					icons: [
						{ size: 48, url: 'moz-extension://tc/icons/icon48.png' },
						{ size: 16, url: 'moz-extension://tc/icons/icon16.png' },
					],
				}
			}
			throw new Error('not installed')
		})
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.iconUrl).toBe('moz-extension://tc/icons/icon16.png')
	})

	it('falls back to first icon when no 16px entry exists', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
			if (id === '{c607c8df-14a7-4f28-894f-29e8722976af}') {
				return {
					id, name: 'Temporary Containers', enabled: true, type: 'extension',
					icons: [{ size: 48, url: 'moz-extension://tc/icons/icon48.png' }],
				}
			}
			throw new Error('not installed')
		})
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.iconUrl).toBe('moz-extension://tc/icons/icon48.png')
	})

	it('sets iconUrl to null when TC is not installed', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not installed'))
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.iconUrl).toBeNull()
	})

	it('skips disabled extensions and uses the next', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
			if (id === '{c607c8df-14a7-4f28-894f-29e8722976af}') {
				return { id, name: 'Temporary Containers', enabled: false, type: 'extension' }
			}
			if (id === '{1ea2fa75-677e-4702-b06a-50fc7d06fe7e}') {
				return { id, name: 'Temporary Containers Plus', enabled: true, type: 'extension' }
			}
			throw new Error('not installed')
		})
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.extensionId).toBe('{1ea2fa75-677e-4702-b06a-50fc7d06fe7e}')
	})

	it('sets extensionId to null when neither extension is installed', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not installed'))
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		expect(layer.extensionId).toBeNull()
	})
})

describe('TcLayerImpl.isTempContainer', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('returns true for a TC container', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: '{c607c8df-14a7-4f28-894f-29e8722976af}',
			name: 'Temporary Containers',
			enabled: true,
			type: 'extension',
		})
		;(browserApi.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(true)
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		const result = await layer.isTempContainer('firefox-tmp-1')
		expect(result).toBe(true)
	})

	it('returns false for a permanent container', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: '{c607c8df-14a7-4f28-894f-29e8722976af}',
			name: 'Temporary Containers',
			enabled: true,
			type: 'extension',
		})
		;(browserApi.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(false)
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		const result = await layer.isTempContainer('firefox-container-1')
		expect(result).toBe(false)
	})

	it('returns false when no TC extension present (no crash)', async () => {
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not installed'))
		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		const result = await layer.isTempContainer('firefox-tmp-1')
		expect(result).toBe(false)
		expect(browserApi.runtime.sendMessage).not.toHaveBeenCalled()
	})
})

describe('TcLayerImpl.createTempContainer', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('sends createTempContainer message with url, index, windowId', async () => {
		const extensionId = '{c607c8df-14a7-4f28-894f-29e8722976af}'
		;(browserApi.management.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: extensionId,
			name: 'Temporary Containers',
			enabled: true,
			type: 'extension',
		})
		const createdTab = { id: 42, index: 3, url: 'https://example.com', cookieStoreId: 'firefox-tmp-1' }
		;(browserApi.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(createdTab)

		const layer = new TcLayerImpl({ browserApi, logger: console })
		await layer.initialize()
		const result = await layer.createTempContainer('https://example.com', 3, 1)

		expect(browserApi.runtime.sendMessage).toHaveBeenCalledWith(extensionId, {
			method: 'createTempContainer',
			url: 'https://example.com',
			index: 3,
			windowId: 1,
		})
		expect(result).toEqual(createdTab)
	})
})

