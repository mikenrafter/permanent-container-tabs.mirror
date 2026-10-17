/**
 * Regenerates the README / product-page captures in product-page/ from a real
 * Firefox with Permanent Container Tabs loaded, on a private Xvfb display:
 *
 *   usage-reopen     tab context menu → Reopen Tab in Container → Work
 *   usage-link       link context menu → Open Link in New Container Tab → Shopping
 *   usage-alternate  Reopen Tab in Container → Open in New Container Tab → Banking
 *   usage-settings   about:addons settings: make Reopen the top-level action
 *                    (taller, so the whole settings page shows)
 *
 * Each scene writes a 640px-wide GIF (real X pointer, recorded with ffmpeg) and
 * a PNG still. Pages are local fixtures served for *.example hosts. The harness
 * is firefox-addon-live (a flake input; see flake.nix).
 *
 * Usage (inside `nix develop`):
 *   npm run capture:readme                  # every scene
 *   npm run capture:readme -- reopen link   # only these scenes
 *   OUT_DIR=/tmp/shots npm run capture:readme
 */

import { resolve } from 'node:path'
import {
	GLIDE,
	openAddonPreferences,
	runCaptures,
	selectedTab,
	settle,
	signInPage,
	type FirefoxSession,
	type Target,
} from 'firefox-addon-live'
import { EXTENSION_ID, EXTENSION_SOURCE, addonMenuItem, addonSubmenuItem, setSettings, waitForAddonItem } from '../tests/live/pct'

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const TAB_MENU = 'tabContextMenu'
const PAGE_MENU = 'contentAreaContextMenu'
/** Window height for the settings capture: the about:addons card plus the whole options page. */
const SETTINGS_HEIGHT = 700

await runCaptures({
	outDir: resolve(import.meta.dirname, '../product-page'),
	session: {
		addon: { source: EXTENSION_SOURCE, id: EXTENSION_ID },
		pages: {
			'mail.example': signInPage('Mail', '#6d4aff'),
			'bank.example': signInPage('Bank', '#1f8a5b'),
			'shop.example': signInPage('Shop', '#e0672a'),
			'news.example': newsPage(),
		},
	},
	async setup(session) {
		await seedBookmarks(session)
		// Reopen is the top-level action in these scenes; the settings scene shows how to get there.
		await setSettings(session, { prioritizeReopen: true })
	},
	scenes: {
		reopen: {
			async run(session, kit) {
				await session.openTab('http://mail.example/')
				await settle(session)
				const stop = await kit.record('usage-reopen')
				await sleep(600)
				await session.realClick(selectedTab, { button: 3, glide: GLIDE })
				await session.waitForPopup(TAB_MENU)
				await waitForAddonItem(session, TAB_MENU, 'Reopen Tab in Container')
				await sleep(400)
				const reopen = addonMenuItem(TAB_MENU, 'Reopen Tab in Container')
				await session.pointerTo(reopen, GLIDE)
				await enterSubmenu(session, reopen, addonSubmenuItem(TAB_MENU, 'Reopen Tab in Container', 'Work'))
				await sleep(600)
				await kit.still('usage-reopen')
				await session.pointerClick()
				await sleep(400)
				await parkPointer(session)
				await sleep(1_600)
				await stop()
			},
		},

		link: {
			async run(session, kit) {
				await session.openTab('http://news.example/')
				await settle(session)
				const stop = await kit.record('usage-link')
				await sleep(600)
				await session.realClick({ content: '#deal' }, { button: 3, glide: GLIDE })
				await session.waitForPopup(PAGE_MENU)
				await waitForAddonItem(session, PAGE_MENU, 'Open Link in New Container Tab')
				await sleep(400)
				const open = addonMenuItem(PAGE_MENU, 'Open Link in New Container Tab')
				await session.pointerTo(open, GLIDE)
				await enterSubmenu(session, open, addonSubmenuItem(PAGE_MENU, 'Open Link in New Container Tab', 'Shopping'))
				await sleep(600)
				await kit.still('usage-link')
				await session.pointerClick()
				await sleep(400)
				await parkPointer(session)
				await sleep(1_600)
				await stop()
			},
		},

		alternate: {
			async run(session, kit) {
				await session.openTab('http://bank.example/')
				await settle(session)
				const stop = await kit.record('usage-alternate')
				await sleep(600)
				await session.realClick(selectedTab, { button: 3, glide: GLIDE })
				await session.waitForPopup(TAB_MENU)
				await waitForAddonItem(session, TAB_MENU, 'Reopen Tab in Container')
				await sleep(400)
				const reopen = addonMenuItem(TAB_MENU, 'Reopen Tab in Container')
				await session.pointerTo(reopen, GLIDE)
				const alternate = addonSubmenuItem(TAB_MENU, 'Reopen Tab in Container', 'Open in New Container Tab')
				await enterSubmenu(session, reopen, alternate)
				await enterSubmenu(session, alternate, addonSubmenuItem(TAB_MENU, 'Open in New Container Tab', 'Banking'))
				await sleep(600)
				await kit.still('usage-alternate')
				await session.pointerClick()
				await sleep(400)
				await parkPointer(session)
				await sleep(1_600)
				await stop()
			},
		},

		settings: {
			// Tall enough for the add-on card and the whole settings page, unscrolled.
			frame: { width: 800, height: SETTINGS_HEIGHT },
			async run(session, kit) {
				await setSettings(session, { prioritizeReopen: false })
				await openAddonPreferences(session)
				await settle(session)
				const stop = await kit.record('usage-settings')
				await sleep(600)
				await session.pointerTo({ inlineOptions: '#prioritizeReopen' }, GLIDE)
				await sleep(400)
				await session.pointerClick()
				await sleep(700)
				await kit.still('usage-settings')
				await sleep(1_200)
				await stop()
			},
		},
	},
})

/**
 * Moves from a highlighted menu item into its open submenu: across first, on
 * the item's own row, then to `target`. A straight diagonal would cross
 * sibling items and switch submenus on the way.
 */
async function enterSubmenu(session: FirefoxSession, from: Target, target: Target): Promise<void> {
	await session.waitForTarget(target)
	await sleep(300)
	const row = await session.screenRect(from)
	const item = await session.screenRect(target)
	await session.pointerToPoint(item.x + 24, row.y + row.height / 2, GLIDE / 2)
	await session.pointerTo(target, GLIDE)
}

/** A few toolbar bookmarks, so the bookmarks toolbar looks lived-in. */
async function seedBookmarks(session: FirefoxSession): Promise<void> {
	await session.chromeAsync(`
		const toolbar = PlacesUtils.bookmarks.toolbarGuid
		for (const [title, url] of [['Mail', 'http://mail.example/'], ['Bank', 'http://bank.example/'], ['Daily Brief', 'http://news.example/'], ['Shop', 'http://shop.example/']]) {
			await PlacesUtils.bookmarks.insert({ parentGuid: toolbar, title, url })
		}
		return true`)
}

/** Moves the pointer off the menus, over the page, once a menu item is clicked. */
async function parkPointer(session: FirefoxSession): Promise<void> {
	await session.pointerToPoint(560, 420, GLIDE)
}

function newsPage() {
	return {
		title: 'Daily Brief',
		body: `
<style>
	body { padding: 24px 40px; }
	header { font-weight: 700; font-size: 22px; letter-spacing: -0.5px; border-bottom: 2px solid #1c1b22; padding-bottom: 10px; }
	article { margin: 22px 0; max-width: 560px; }
	article h2 { margin: 0 0 6px; font-size: 18px; }
	article p { margin: 0; color: #555; font-size: 14px; }
	a { color: #2a5bd7; }
</style>
<header>Daily Brief</header>
<article>
	<h2>City council approves new bike lanes</h2>
	<p>Work starts next month on the riverside route.</p>
</article>
<article>
	<h2><a id="deal" href="http://shop.example/deals">Spring sale: 30% off headphones</a></h2>
	<p>The deals page is live until Sunday.</p>
</article>
<article>
	<h2>Weekend weather: sun, then showers</h2>
	<p>Bring an umbrella for Sunday afternoon.</p>
</article>`,
	}
}
