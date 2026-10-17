/**
 * The context menus in a real Firefox: reopening a tab moves it into the
 * picked container, and a link opens in the picked container without
 * touching the current tab.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectedTab, settle, type FirefoxSession } from 'firefox-addon-live'
import { addonMenuItem, addonSubmenuItem, setSettings, startPct, tabSummary, waitForAddonItem, waitForTabs } from './pct'

const TAB_MENU = 'tabContextMenu'
const PAGE_MENU = 'contentAreaContextMenu'

let session: FirefoxSession
let work: number
let personal: number

beforeAll(async () => {
	session = await startPct({
		width: 800,
		height: 562,
		pages: {
			'mail.example': { title: 'Mail' },
			'news.example': { title: 'News', body: '<h1>News</h1><p><a id="story" href="http://news.example/story">Read the story</a></p>' },
		},
	})
	work = await session.ensureContainer('Work', 'blue', 'briefcase')
	personal = await session.ensureContainer('Personal', 'green', 'fingerprint')
}, 90_000)

afterAll(async () => {
	await session?.close()
})

beforeEach(async () => {
	await setSettings(session, { prioritizeReopen: false })
})

async function openTabMenu(primary: string): Promise<void> {
	await session.realClick(selectedTab, { button: 3 })
	await session.waitForPopup(TAB_MENU)
	await waitForAddonItem(session, TAB_MENU, primary)
}

describe('tab context menu', () => {
	it('lists the top-level action, the alternate action and every container', async () => {
		await session.openTab('http://mail.example/inbox')
		await settle(session)
		await openTabMenu('Open in New Container Tab')
		await session.realClick(addonMenuItem(TAB_MENU, 'Open in New Container Tab'))
		await waitForAddonItem(session, TAB_MENU, 'Work')
		const labels = await session.chrome(`
			const top = [...document.getElementById('tabContextMenu').querySelectorAll('menu')]
				.find((menu) => menu.id.includes('pct_permanentcontainertabs') && menu.label === 'Open in New Container Tab')
			return [...top.menupopup.children].filter((item) => item.localName !== 'menuseparator').map((item) => item.label)`)
		// Alternate action first, then No Container, then every container (Firefox's defaults included).
		expect(labels).toEqual(['Reopen Tab in Container', 'No Container', 'Personal', 'Work', 'Banking', 'Shopping'])
		await session.keys('Escape')
		await session.keys('Escape')
	})

	it('Reopen Tab in Container replaces the tab with one in the picked container', async () => {
		await setSettings(session, { prioritizeReopen: true })
		await session.openTab('http://mail.example/reopen')
		await settle(session)
		await openTabMenu('Reopen Tab in Container')
		await session.realClick(addonMenuItem(TAB_MENU, 'Reopen Tab in Container'))
		await waitForAddonItem(session, TAB_MENU, 'Work')
		await session.realClick(addonMenuItem(TAB_MENU, 'Work'))

		await waitForTabs(session, (tabs) => tabs.length === 1 && tabs[0]!.userContextId === work, 'tab never moved into Work')
		expect(await tabSummary(session)).toEqual([{ url: 'http://mail.example/reopen', userContextId: work, selected: true }])
	})

	it('the alternate submenu opens a copy in a new container tab and keeps the original', async () => {
		await setSettings(session, { prioritizeReopen: true })
		await session.openTab('http://mail.example/alternate', work)
		await settle(session)
		await openTabMenu('Reopen Tab in Container')
		await session.realClick(addonMenuItem(TAB_MENU, 'Reopen Tab in Container'))
		await waitForAddonItem(session, TAB_MENU, 'Open in New Container Tab')
		await session.realClick(addonMenuItem(TAB_MENU, 'Open in New Container Tab'))
		await waitForAddonItem(session, TAB_MENU, 'Personal')
		await session.realClick(addonSubmenuItem(TAB_MENU, 'Open in New Container Tab', 'Personal'))

		await waitForTabs(session, (tabs) => tabs.length === 2, 'no second tab opened')
		expect((await tabSummary(session)).map(({ url, userContextId }) => ({ url, userContextId }))).toEqual([
			{ url: 'http://mail.example/alternate', userContextId: work },
			{ url: 'http://mail.example/alternate', userContextId: personal },
		])
	})
})

describe('link context menu', () => {
	it('Open Link in New Container Tab opens the link in the picked container', async () => {
		await session.openTab('http://news.example/')
		await settle(session)
		await session.realClick({ content: '#story' }, { button: 3 })
		await session.waitForPopup(PAGE_MENU)
		await waitForAddonItem(session, PAGE_MENU, 'Open Link in New Container Tab')
		await session.realClick(addonMenuItem(PAGE_MENU, 'Open Link in New Container Tab'))
		await waitForAddonItem(session, PAGE_MENU, 'Personal')
		await session.realClick(addonMenuItem(PAGE_MENU, 'Personal'))

		await waitForTabs(session, (tabs) => tabs.length === 2 && tabs[1]!.url === 'http://news.example/story', 'link never opened')
		expect((await tabSummary(session)).map(({ url, userContextId }) => ({ url, userContextId }))).toEqual([
			{ url: 'http://news.example/', userContextId: 0 },
			{ url: 'http://news.example/story', userContextId: personal },
		])
	})
})
