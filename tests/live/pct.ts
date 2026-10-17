/**
 * Starts a live Firefox (see firefox-addon-live) with Permanent Container Tabs
 * loaded from `src/`, plus helpers for its context menus.
 */

import { resolve } from 'node:path'
import { FirefoxSession, waitFor, type FirefoxSessionOptions, type Target } from 'firefox-addon-live'

export const EXTENSION_ID = 'pct@permanentcontainertabs'
export const EXTENSION_SOURCE = resolve(import.meta.dirname, '../../src')

/** Run `npm run build` first; the add-on loads from the built `src/`. */
export function startPct(options: Omit<FirefoxSessionOptions, 'addon'> = {}): Promise<FirefoxSession> {
	return FirefoxSession.start({ ...options, addon: { source: EXTENSION_SOURCE, id: EXTENSION_ID } })
}

/**
 * One of this add-on's items in the open popup `popupId`, by label. Firefox
 * has its own "Open Link in New Container Tab", so match only items the add-on
 * created (their ids carry the add-on's widget id).
 */
export const addonMenuItem = (popupId: string, label: string): Target => ({
	find: `return [...document.getElementById(args[0]).querySelectorAll('menu, menuitem')]
		.find((item) => !item.hidden && item.id.includes('pct_permanentcontainertabs') && item.label === args[1]
			&& item.closest('menupopup').state === 'open')`,
	args: [popupId, label],
})

/** An item inside one of the add-on's submenus, e.g. ('Open in New Container Tab', 'Personal'). */
export const addonSubmenuItem = (popupId: string, menuLabel: string, label: string): Target => ({
	find: `const menu = [...document.getElementById(args[0]).querySelectorAll('menu')]
		.find((item) => item.id.includes('pct_permanentcontainertabs') && item.label === args[1] && item.menupopup.state === 'open')
	return menu && [...menu.menupopup.children].find((item) => item.label === args[2])`,
	args: [popupId, menuLabel, label],
})

/** Waits for the add-on to finish building its items in a just-opened context menu. */
export async function waitForAddonItem(session: FirefoxSession, popupId: string, label: string): Promise<void> {
	await session.waitForTarget(addonMenuItem(popupId, label), 5_000)
}

/** Stores the add-on's settings, as the options page would. */
export async function setSettings(session: FirefoxSession, settings: { prioritizeReopen?: boolean, suppressIsolationInfo?: boolean }): Promise<void> {
	await session.asExtension('await browser.storage.local.set(args[0]); return true', [settings])
}

/** Every open tab (probe tabs excluded): URL and container. */
export async function tabSummary(session: FirefoxSession): Promise<Array<{ url: string, userContextId: number, selected: boolean }>> {
	return await session.chrome(`
		return gBrowser.tabs.filter((tab) => !tab.hidden).map((tab) => ({
			url: tab.linkedBrowser.currentURI.spec,
			userContextId: tab.userContextId,
			selected: tab.selected,
		}))`) as Array<{ url: string, userContextId: number, selected: boolean }>
}

/** Waits until the tab strip matches `predicate`. */
export async function waitForTabs(session: FirefoxSession, predicate: (tabs: Awaited<ReturnType<typeof tabSummary>>) => boolean, message: string): Promise<void> {
	await waitFor(async () => predicate(await tabSummary(session)) || undefined, 10_000, message)
}
