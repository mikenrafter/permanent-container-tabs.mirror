/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock browser API globally before importing the module
const mockStorageSet = vi.fn().mockResolvedValue(undefined)
const mockTabsRemove = vi.fn().mockResolvedValue(undefined)
const mockTabsQuery = vi.fn().mockResolvedValue([{ id: 42, url: 'moz-extension://test/info/isolation-info.html', index: 0 }])

const mockBrowser = {
	storage: {
		local: {
			get: vi.fn().mockResolvedValue({}),
			set: mockStorageSet,
		},
	},
	tabs: {
		query: mockTabsQuery,
		remove: mockTabsRemove,
	},
}

declare global {
	interface Window {
		browser: typeof mockBrowser
	}
}

// Set up the browser global before module import
Object.defineProperty(globalThis, 'browser', {
	value: mockBrowser,
	writable: true,
	configurable: true,
})

describe('isolation info page handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockTabsQuery.mockResolvedValue([{ id: 42, url: 'moz-extension://test/info/isolation-info.html', index: 0 }])
		mockStorageSet.mockResolvedValue(undefined)
		mockTabsRemove.mockResolvedValue(undefined)

		// Set up a minimal DOM
		document.body.innerHTML = `
			<button id="ok-btn">OK</button>
			<button id="never-show-btn">Never show again</button>
		`
	})

	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('"OK" button click closes the info tab', async () => {
		const { initIsolationInfoPage } = await import('../src/info/isolation-info')
		initIsolationInfoPage()

		const okBtn = document.getElementById('ok-btn')
		okBtn?.click()
		await Promise.resolve()
		await Promise.resolve()

		expect(mockTabsRemove).toHaveBeenCalledWith(42)
	})

	it('"Never show again" button sets suppressIsolationInfo=true and closes tab', async () => {
		const { initIsolationInfoPage } = await import('../src/info/isolation-info')
		initIsolationInfoPage()

		const neverBtn = document.getElementById('never-show-btn')
		neverBtn?.click()
		await Promise.resolve()
		await Promise.resolve()

		expect(mockStorageSet).toHaveBeenCalledWith({ suppressIsolationInfo: true })
		expect(mockTabsRemove).toHaveBeenCalledWith(42)
	})
})
