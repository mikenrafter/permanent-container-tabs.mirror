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
			overrideContext: vi.fn(),
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
	it('returns all four keys with correct defaults', () => {
		const defaults = getDefaultSettings()
		expect(defaults).toEqual({
			showOpenInNewTab: true,
			showReopenInContainer: true,
			suppressMacMenuItem: false,
			suppressIsolationInfo: false,
		})
	})
})

describe('validateSettings', () => {
	it('accepts a fully valid settings object', () => {
		const valid = {
			showOpenInNewTab: true,
			showReopenInContainer: false,
			suppressMacMenuItem: true,
			suppressIsolationInfo: false,
		}
		expect(validateSettings(valid)).toEqual(valid)
	})

	it('rejects non-boolean value for showOpenInNewTab', () => {
		const invalid = {
			showOpenInNewTab: 'yes',
			showReopenInContainer: true,
			suppressMacMenuItem: false,
			suppressIsolationInfo: false,
		}
		expect(() => validateSettings(invalid as unknown as ReturnType<typeof getDefaultSettings>)).toThrow()
	})

	it('rejects non-boolean value for showReopenInContainer', () => {
		const invalid = {
			showOpenInNewTab: true,
			showReopenInContainer: 1,
			suppressMacMenuItem: false,
			suppressIsolationInfo: false,
		}
		expect(() => validateSettings(invalid as unknown as ReturnType<typeof getDefaultSettings>)).toThrow()
	})

	it('rejects non-boolean value for suppressMacMenuItem', () => {
		const invalid = {
			showOpenInNewTab: true,
			showReopenInContainer: true,
			suppressMacMenuItem: null,
			suppressIsolationInfo: false,
		}
		expect(() => validateSettings(invalid as unknown as ReturnType<typeof getDefaultSettings>)).toThrow()
	})

	it('rejects non-boolean value for suppressIsolationInfo', () => {
		const invalid = {
			showOpenInNewTab: true,
			showReopenInContainer: true,
			suppressMacMenuItem: false,
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

	it('merges stored partial with defaults', async () => {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			showOpenInNewTab: false,
		})
		const settings = await loadSettings(browserApi.storage.local)
		expect(settings).toEqual({
			showOpenInNewTab: false,
			showReopenInContainer: true,
			suppressMacMenuItem: false,
			suppressIsolationInfo: false,
		})
	})

	it('merges multiple stored keys with defaults', async () => {
		;(browserApi.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			suppressMacMenuItem: true,
			suppressIsolationInfo: true,
		})
		const settings = await loadSettings(browserApi.storage.local)
		expect(settings).toEqual({
			showOpenInNewTab: true,
			showReopenInContainer: true,
			suppressMacMenuItem: true,
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
			showOpenInNewTab: false,
			showReopenInContainer: true,
			suppressMacMenuItem: true,
			suppressIsolationInfo: false,
		}
		await saveSettings(browserApi.storage.local, settings)
		expect(browserApi.storage.local.set).toHaveBeenCalledWith(settings)
	})
})
