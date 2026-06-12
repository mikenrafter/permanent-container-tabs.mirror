import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	getDefaultSettings,
	validateSettings,
	loadSettings,
	saveSettings,
} from '../src/preferences/settings'
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

describe('getDefaultSettings', () => {
	it('returns all keys with correct defaults', () => {
		const defaults = getDefaultSettings()
		expect(defaults).toEqual({
			prioritizeReopen: false,
			suppressIsolationInfo: false,
		})
	})
})

describe('validateSettings', () => {
	it('accepts a fully valid settings object', () => {
		const valid = {
			prioritizeReopen: true,
			suppressIsolationInfo: false,
		}
		expect(validateSettings(valid)).toEqual(valid)
	})

	it('rejects non-boolean value for prioritizeReopen', () => {
		const invalid = {
			prioritizeReopen: 'yes',
			suppressIsolationInfo: false,
		}
		expect(() => validateSettings(invalid as unknown as ReturnType<typeof getDefaultSettings>)).toThrow()
	})

	it('rejects non-boolean value for suppressIsolationInfo', () => {
		const invalid = {
			prioritizeReopen: false,
			suppressIsolationInfo: 0,
		}
		expect(() => validateSettings(invalid as unknown as ReturnType<typeof getDefaultSettings>)).toThrow()
	})
})

describe('loadSettings', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('returns defaults when storage is empty', async () => {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({})
		const settings = await loadSettings(browserApi.storage.local)
		expect(settings).toEqual(getDefaultSettings())
	})

	it('merges stored prioritizeReopen=true with defaults', async () => {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			prioritizeReopen: true,
		})
		const settings = await loadSettings(browserApi.storage.local)
		expect(settings).toEqual({
			prioritizeReopen: true,
			suppressIsolationInfo: false,
		})
	})

	it('merges stored suppressIsolationInfo=true with defaults', async () => {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			suppressIsolationInfo: true,
		})
		const settings = await loadSettings(browserApi.storage.local)
		expect(settings).toEqual({
			prioritizeReopen: false,
			suppressIsolationInfo: true,
		})
	})
})

describe('saveSettings', () => {
	let browserApi: BrowserApi

	beforeEach(() => {
		browserApi = makeBrowserApi()
	})

	it('calls storage.local.set with the full settings object', async () => {
		const settings = {
			prioritizeReopen: true,
			suppressIsolationInfo: false,
		}
		await saveSettings(browserApi.storage.local, settings)
		expect(browserApi.storage.local.set).toHaveBeenCalledWith(settings)
	})
})
