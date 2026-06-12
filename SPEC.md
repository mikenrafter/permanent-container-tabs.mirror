# Permanent Container Tabs — Specification

## Overview

**Permanent Container Tabs (PCT)** is a Firefox extension that replaces and extends the tab
context-menu items provided by the Multi-Account Containers (MAC) extension. It surfaces
only *permanent* (non-temporary) containers in its picker, integrates with Temporary Containers
(TC / TC+), and adds a robust "Reopen Tab in Container" action. An informational page explains
to users why a tab was silently moved into a Temporary Container when TC's global-isolation mode
is active.

---

## Feature List

### F1 — Context Menu: "Open in New Container Tab"
- Appears on right-click of any browser tab (contexts: `["tab"]`).
- Submenu lists all permanent (non-temporary) `contextualIdentities`.
- Each entry is a radio-button when it matches the current tab's container (`checked: true`,
  `enabled: false`, no icon); otherwise `type: normal` with a bundled SVG icon.
- Special entries always present at the top:
  - **No Container** (`firefox-default`) — always `type: radio`; checked when the tab is in
    no container.
  - **Temporary Container** — only shown when TC/TC+ is installed; shown as radio + checked
    when the current tab is itself in a temporary container; otherwise `type: normal` with the
    bundled `temp-container.svg` icon.
- Clicking an entry opens a **new tab** (active) in the chosen container at the same URL.
- Controlled by **Setting S1** (`prioritizeReopen: false` → shows this menu).

### F2 — Context Menu: "Reopen Tab in Container"
- Second top-level item in the tab context menu.
- Same submenu structure as F1 (permanent containers + No Container + Temporary Container).
- Clicking an entry:
  1. Opens the URL in a **new active tab** in the chosen container at index = old tab index + 1.
  2. Closes the original tab.
  3. **TC intercept check** — skipped when the chosen container is Temporary Container or TC
     is not present. Waits 500 ms, then polls every 200 ms for up to 2 s (10 polls). On each
     poll, reads the new tab via `tabs.get`. If the tab's `cookieStoreId` is now a Temporary
     Container (TC's global-isolation mode intercepted the navigation) and
     `suppressIsolationInfo` is `false`, opens `isolation-info.html` in a new active tab and
     stops polling. If `tabs.get` throws (TC closed our tab and replaced it), stops silently.
- Controlled by **Setting S2** (`prioritizeReopen: true` → shows this menu instead of F1).

### F4 — TC Global-Isolation Info Page
- When TC/TC+ is installed with global-isolation mode enabled and a navigation lands the
  tab in a Temporary Container (detected via `tabs.onUpdated` + `isTempContainer` check),
  PCT opens `src/info/isolation-info.html` in the tab (one additional tab, not replacing
  the destination).
- The page:
  - Explains that TC's global-isolation mode redirected the tab.
  - Provides links to TC documentation (TC README and TC+ README, URLs sourced from CM
    project README).
  - **"OK"** button — closes the info tab.
  - **"Never show again"** button — persists `suppressIsolationInfo: true` to storage and
    closes the info tab.
- PCT never opens the info page when `suppressIsolationInfo` is `true`.
- Controlled by **Setting S4** (`suppressIsolationInfo`, default `false`).

---

## Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `prioritizeReopen` | boolean | `false` | `false` = show F1 (Open in New), `true` = show F2 (Reopen) |
| `suppressIsolationInfo` | boolean | `false` | Never show TC isolation info page |

Settings are stored via `browser.storage.local`.

---

## Architecture

```
src/
├── manifest.json             MV2, gecko id: pct@permanentcontainertabs
├── background.ts             Entry point — constructs and initialises PctRuntime
├── constants.ts              TEMP_CONTAINERS_EXTENSION_IDS, NO_CONTAINER, TEMP_CONTAINER_SENTINEL, etc.
├── models.ts                 All TypeScript interfaces (BrowserApi, PctSettings, ContextualIdentity, …)
├── background/
│   ├── pctRuntime.ts         Orchestrator — wires listeners, owns module instances
│   ├── menuHandler.ts        Tab context menu: build, show, handle clicks (F1/F2)
│   ├── tabReopener.ts        "Reopen" action: open new tab, close old, TC intercept check (F2)
│   └── tcLayer.ts            TC/TC+ detection, isTempContainer, createTempContainer
├── preferences/
│   ├── options.html          Settings page UI
│   ├── options.ts            Form binding / settings persistence
│   └── settings.ts           Settings schema, defaults, validation
└── info/
    ├── isolation-info.html   TC isolation informational page
    └── isolation-info.ts     Button handlers (OK / Never show again)
tests/
├── menuHandler.test.ts
├── tabReopener.test.ts
├── tcLayer.test.ts
├── settings.test.ts
├── pctRuntime.test.ts
└── isolationInfo.test.ts
icons/
└── icon.svg                  Extension icon (also used as menu item icon)
```

---

## Manifest Permissions

```json
{
  "permissions": [
    "tabs",
    "menus",
    "contextMenus",
    "contextualIdentities",
    "cookies",
    "storage",
    "management",
    "<all_urls>"
  ]
}
```

`management` is required to probe TC/TC+ extension IDs via `browser.management.get()`.
`<all_urls>` is required to open the info page via `tabs.update`.

---

## Key Technical Details

### Container Filtering (TC exclusion)
`browser.contextualIdentities.query({})` returns all containers. After fetching, PCT calls
`tcLayer.isTempContainer(cookieStoreId)` for each and filters out positives before building
the submenu. Results are cached per `menus.onShown` event (one cache per menu open cycle).

### Current-Container Indicator (F1 / F2)
When building the submenu for a right-clicked tab, PCT reads `tab.cookieStoreId` and marks
the matching container entry as `checked: true` / `type: radio` / `enabled: false` with no
icon. This applies to the No Container entry, all permanent container entries, and the
Temporary Container entry (which calls `isTempContainer(tab.cookieStoreId)` to detect the
current-tab case).

### "Reopen Tab in Container" Flow (F2)
1. Call TC API (if Temporary Container selected) or `browser.tabs.create({ url, cookieStoreId, index, active: true })`.
2. Close the original tab via `browser.tabs.remove(oldTabId)`.
3. **TC intercept check** (skipped for Temporary Container target or when TC is absent):
   - `await new Promise(resolve => setTimeout(resolve, 500))` — initial 500 ms delay.
   - Loop up to 10 times (2 s polling window at 200 ms/poll):
     - `const current = await browser.tabs.get(newTabId)` — if this throws, stop silently.
     - `if (await tcLayer.isTempContainer(current.cookieStoreId))` — TC intercepted; if
       `!suppressIsolationInfo`: `browser.tabs.create({ url: infoUrl, active: true })`; return.
     - `await new Promise(resolve => setTimeout(resolve, 200))` — wait before next poll.

### TC Global Isolation Detection (F4)
1. On `tabs.onUpdated` (with `changeInfo.cookieStoreId`), check if the new `cookieStoreId`
   is a TC container via `tcLayer.isTempContainer()`.
2. Cross-reference: if the URL is NOT `about:blank`/`about:newtab` and the tab was NOT
   opened by PCT itself (`pctOpenedTabIds` set), open the info page.
3. `pctOpenedTabIds` is populated in F1/F2 and cleared after `tabs.onUpdated` fires for
   that tab (one-shot sentinel).

---

## Test Plan (TDD — write tests before implementation)

### `settings.test.ts`
- `getDefaultSettings()` returns both keys with correct defaults.
- `validateSettings()` rejects non-boolean values.
- `loadSettings()` merges stored partial with defaults (missing keys filled in).
- `saveSettings()` calls `browser.storage.local.set` with correct payload.

### `tcLayer.test.ts`
- `initialize()` detects first installed/enabled TC extension; skips disabled ones.
- `initialize()` sets `extensionId = null` when neither extension is installed.
- `isTempContainer()` returns `true` for a TC container, `false` for a permanent one.
- `isTempContainer()` returns `false` when no TC extension is present (no crash).
- `createTempContainer()` sends correct message to TC extension and returns new tab.

### `menuHandler.test.ts`
- `onShown` with `prioritizeReopen=false` builds "Open in New Container Tab" top-level item.
- `onShown` with `prioritizeReopen=true` builds "Reopen Tab in Container" top-level item.
- Submenu contains exactly `[No Container, (Temporary Container?), ...permanentContainers]`.
- Permanent temporary-container entries are excluded from submenu (filtered by caller).
- Current tab's permanent container is `checked: true`, `type: radio`, no icon.
- Current tab in No Container: No Container entry is checked.
- Current tab in Temporary Container: TC entry is `type: radio`, `checked: true`, no icon.
- Tab not in TC: TC entry is `type: normal` with `icons/temp-container.svg`.
- `onClicked` for F1 item calls `browser.tabs.create` with correct `{url, cookieStoreId}`.
- `onClicked` for F2 item calls `tabReopener.reopen`.
- `onHidden` clears per-cycle container cache.

### `tabReopener.test.ts`
- `reopen(tab, NO_CONTAINER)` creates tab at `index+1` with `active: true`, closes original.
- `reopen(tab, TEMP_CONTAINER_SENTINEL)` calls TC `createTempContainer`, closes original;
  skips the TC intercept check entirely.
- `reopen(tab, permanentCookieStoreId)` creates tab with that `cookieStoreId` and `active: true`.
- After ~400 ms: if new tab's `cookieStoreId` is a TC container, opens info page in a new
  active tab (when `suppressIsolationInfo=false`).
- Does NOT open info page when `suppressIsolationInfo=true`.
- Does NOT open info page when TC is not present.
- Does NOT open info page when the new tab is in a permanent container (no TC intercept).
- Handles `tabs.get` throwing gracefully (tab removed before check).
- TC intercept check is skipped when the chosen container is `TEMP_CONTAINER_SENTINEL`.
- Initial check fires at 500 ms, subsequent polls every 200 ms (up to 10 polls / 2 s).
- Stops polling as soon as TC intercept is detected; does not poll further after detecting.

### `pctRuntime.test.ts`
- `initialize()` calls `tcLayer.initialize()`, `menuHandler.initialize()`, and registers listeners.
- `tabs.onUpdated` with `cookieStoreId` change fires isolation-info logic when appropriate.
- `tabs.onUpdated` does NOT open info page if `suppressIsolationInfo=true`.
- `tabs.onUpdated` does NOT open info page for PCT-opened tabs.
- `tabs.onUpdated` does NOT open info page when new container is NOT a temp container.
- Info page opened via `tabs.create({ url: 'info/isolation-info.html' })`.

### `isolationInfo.test.ts`
- "OK" button message handler closes the info tab.
- "Never show again" button sets `suppressIsolationInfo: true` and closes the info tab.

---

## TC Documentation Links (for F4 info page)

- Temporary Containers (stoically): https://github.com/stoically/temporary-containers
- Temporary Containers Plus (GodKratos): https://github.com/GodKratos/temporary-containers

---

## Build System

**Nix flake** providing a `devShell` with `nodejs_22`.

**npm scripts:**
```
build     esbuild src/background.ts src/info/isolation-info.ts
          src/preferences/options.ts --bundle --platform=browser
          --format=iife --target=firefox115 --outdir=src
test      vitest run
typecheck tsc --noEmit
package   web-ext build && mv web-ext-artifacts/*.zip dist/pct.xpi
```

**TypeScript:** strict mode, ES2022, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

---

## Non-Goals (v1.0)
- No bookmark management (that is CM's domain).
- No cross-device sync.
- No security tokens / URL encoding.
- No page action button.
