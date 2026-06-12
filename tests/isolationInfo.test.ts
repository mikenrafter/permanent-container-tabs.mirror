/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockStorageSet = vi.fn().mockResolvedValue(undefined)
const mockTabsRemove = vi.fn().mockResolvedValue(undefined)
const mockTabsQuery = vi.fn().mockResolvedValue([
	{ id: 42, url: 'moz-extension://test/info/isolation-info.html' },
])

const mockBrowser = {
	storage: { local: { get: vi.fn().mockResolvedValue({}), set: mockStorageSet } },
	tabs: { query: mockTabsQuery, remove: mockTabsRemove },
}

Object.defineProperty(globalThis, 'browser', {
	value: mockBrowser,
	writable: true,
	configurable: true,
})

describe('isolation info page handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockTabsQuery.mockResolvedValue([{ id: 42, url: 'moz-extension://test/info/isolation-info.html' }])
		mockStorageSet.mockResolvedValue(undefined)
		mockTabsRemove.mockResolvedValue(undefined)

		document.body.innerHTML = `
			<button id="ok-btn">OK</button>
			<button id="never-show-btn">Never show again</button>
		`
		vi.resetModules()
	})

	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('"OK" button click closes the info tab', async () => {
		const { initIsolationInfoPage } = await import('../src/info/isolation-info')
		initIsolationInfoPage()

		const okBtn = document.getElementById('ok-btn')
		okBtn?.click()
		await new Promise(r => setTimeout(r, 0))
		await new Promise(r => setTimeout(r, 0))

		expect(mockTabsRemove).toHaveBeenCalledWith(42)
	})

	it('"Never show again" button sets suppressIsolationInfo=true and closes tab', async () => {
		const { initIsolationInfoPage } = await import('../src/info/isolation-info')
		initIsolationInfoPage()

		const neverBtn = document.getElementById('never-show-btn')
		neverBtn?.click()
		await new Promise(r => setTimeout(r, 0))
		await new Promise(r => setTimeout(r, 0))

		expect(mockStorageSet).toHaveBeenCalledWith({ suppressIsolationInfo: true })
		expect(mockTabsRemove).toHaveBeenCalledWith(42)
	})
})
