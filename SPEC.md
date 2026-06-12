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
- Each item is a radio-button entry; the **current** container of the tab is pre-checked.
- Special entries always present at the top:
  - **No Container** (`firefox-default`) — opens in default container.
  - **Temporary Container** — only shown when TC/TC+ is installed; calls TC runtime API to
    create an ephemeral container.
- Clicking an entry opens a **new tab** in the chosen container at the same URL.
- Menu icon: the extension's SVG icon (16 px).
- Controlled by **Setting S1** (`showOpenInNewTab`, default `true`).

### F2 — Context Menu: "Reopen Tab in Container"
- Second top-level item in the tab context menu.
- Same submenu structure as F1 (permanent containers + No Container + Temporary Container).
- Clicking an entry:
  1. Opens the URL in a new tab in the chosen container (index = old tab index + 1).
  2. Closes the original tab.
  3. Cleans up any TC-created orphan `about:blank` tabs (poll × 6 @ 150 ms — mirrors CM
     `cleanupOrphanedTabs`).
- Controlled by **Setting S2** (`showReopenInContainer`, default `true`).

### F3 — Suppress MAC "Open in New Container Tab"
- When enabled, calls `browser.menus.overrideContext({ showDefaults: false })` from
  `menus.onShown` to suppress the MAC extension's own "Open in New Container Tab" item.
- Because `showDefaults: false` hides all browser-native tab-menu items as well, PCT
  recreates the essential native entries: Pin/Unpin Tab, Mute/Unmute Tab, Duplicate Tab,
  Select Tab, Move Tab, Reload Tab, Close Tab. (Best-effort; actual availability depends
  on Firefox version.)
- When F3 is **OFF** (default), the two PCT menu items have their labels suffixed with
  `(PCT)` so users can distinguish them from MAC's identically-named item.
- When F3 is **ON**, labels drop the suffix.
- Controlled by **Setting S3** (`suppressMacMenuItem`, default `false`).

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
| `showOpenInNewTab` | boolean | `true` | Show "Open in New Container Tab (PCT)" menu |
| `showReopenInContainer` | boolean | `true` | Show "Reopen Tab in Container" menu |
| `suppressMacMenuItem` | boolean | `false` | Suppress MAC's own context-menu entry |
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
│   ├── menuHandler.ts        Tab context menu: build, show, handle clicks (F1/F2/F3)
│   ├── tabReopener.ts        "Reopen" action: open new tab, close old, TC orphan cleanup (F2)
│   └── tcLayer.ts            TC/TC+ detection, isTempContainer, createTempContainer, orphan cleanup
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
the matching container entry as `checked: true` (radio semantics).

### "Reopen Tab in Container" Robustness (F2)
Mirrors CM's hotswap activation:
1. Snapshot all current tab IDs in the window (`preTabIds`).
2. Call TC API (if Temporary Container selected) or `browser.tabs.create({ url, cookieStoreId, index })`.
3. Close the original tab via `browser.tabs.remove(oldTabId)`.
4. Poll 6× at 150 ms for orphan TC-created `about:blank` tabs — any tab whose ID was not in
   `preTabIds`, is in a temporary container, and has URL `about:blank` is closed.

### Suppress MAC Menu (F3)
From `menus.onShown`, when S3 is enabled:
```typescript
browser.menus.overrideContext({ showDefaults: false })
```
This hides all other extensions' tab context-menu items (including MAC) as well as Firefox's
native items. PCT then creates its own entries plus best-effort native replacements. The toggle
ships with a visible warning in the settings UI: "This will also hide all other extensions'
tab context menus."

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
- `getDefaultSettings()` returns all four keys with correct defaults.
- `validateSettings()` rejects non-boolean values.
- `loadSettings()` merges stored partial with defaults (missing keys filled in).
- `saveSettings()` calls `browser.storage.local.set` with correct payload.

### `tcLayer.test.ts`
- `initialize()` detects first installed/enabled TC extension; skips disabled ones.
- `initialize()` sets `extensionId = null` when neither extension is installed.
- `isTempContainer()` returns `true` for a TC container, `false` for a permanent one.
- `isTempContainer()` returns `false` when no TC extension is present (no crash).
- `createTempContainer()` sends correct message to TC extension and returns new tab.
- `cleanupOrphanedTabs()` removes TC-created blank tabs not in `preTabIds`, polls up to 6 times.

### `menuHandler.test.ts`
- `onShown` with S1=true builds a top-level "Open in New Container Tab" item.
- `onShown` with S2=true builds a top-level "Reopen Tab in Container" item.
- `onShown` with S1=false omits the first item.
- `onShown` with S2=false omits the second item.
- Submenu contains exactly `[No Container, (Temporary Container?), ...permanentContainers]`.
- Temporary container entries are excluded from submenu.
- Current tab's container is `checked: true` in the submenu.
- `onClicked` for F1 item calls `browser.tabs.create` with correct `{url, cookieStoreId}`.
- `onClicked` for F2 item calls `tabReopener.reopen`.
- `onShown` with S3=true calls `browser.menus.overrideContext({ showDefaults: false })`.
- `onShown` with S3=false does NOT call `overrideContext`.
- Menu labels include `(PCT)` suffix when S3=false, drop suffix when S3=true.
- `onHidden` clears per-cycle container cache.

### `tabReopener.test.ts`
- `reopen(tab, NO_CONTAINER)` creates tab at `index+1`, closes original, does not call TC API.
- `reopen(tab, TEMP_CONTAINER_SENTINEL)` calls TC `createTempContainer`, closes original.
- `reopen(tab, permanentCookieStoreId)` creates tab with that `cookieStoreId`.
- After reopen, `cleanupOrphanedTabs` is called.
- `cleanupOrphanedTabs` removes tabs whose IDs were not in `preTabIds` and are in a temp container.
- `cleanupOrphanedTabs` does not remove the newly-created permanent tab.

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
