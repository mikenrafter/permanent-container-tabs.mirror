type OptionsBrowser = {
	storage: { local: { get(k: null): Promise<Record<string, unknown>>; set(i: Record<string, unknown>): Promise<void> } }
}
const optBrowser = (): OptionsBrowser => (globalThis as unknown as { browser: OptionsBrowser }).browser

interface PctSettings {
	showOpenInNewTab: boolean
	showReopenInContainer: boolean
	suppressMacMenuItem: boolean
	suppressIsolationInfo: boolean
}

function getDefaultSettings(): PctSettings {
	return {
		showOpenInNewTab: true,
		showReopenInContainer: true,
		suppressMacMenuItem: false,
		suppressIsolationInfo: false,
	}
}

async function loadAndRenderSettings(): Promise<void> {
	const defaults = getDefaultSettings()
	const stored = await optBrowser().storage.local.get(null)

	const settings: PctSettings = {
		showOpenInNewTab: typeof stored['showOpenInNewTab'] === 'boolean' ? stored['showOpenInNewTab'] : defaults.showOpenInNewTab,
		showReopenInContainer: typeof stored['showReopenInContainer'] === 'boolean' ? stored['showReopenInContainer'] : defaults.showReopenInContainer,
		suppressMacMenuItem: typeof stored['suppressMacMenuItem'] === 'boolean' ? stored['suppressMacMenuItem'] : defaults.suppressMacMenuItem,
		suppressIsolationInfo: typeof stored['suppressIsolationInfo'] === 'boolean' ? stored['suppressIsolationInfo'] : defaults.suppressIsolationInfo,
	}

	const s1 = document.getElementById('showOpenInNewTab') as HTMLInputElement | null
	const s2 = document.getElementById('showReopenInContainer') as HTMLInputElement | null
	const s3 = document.getElementById('suppressMacMenuItem') as HTMLInputElement | null
	const s4 = document.getElementById('suppressIsolationInfo') as HTMLInputElement | null

	if (s1) s1.checked = settings.showOpenInNewTab
	if (s2) s2.checked = settings.showReopenInContainer
	if (s3) s3.checked = settings.suppressMacMenuItem
	if (s4) s4.checked = settings.suppressIsolationInfo
}

async function saveSettings(): Promise<void> {
	const s1 = document.getElementById('showOpenInNewTab') as HTMLInputElement | null
	const s2 = document.getElementById('showReopenInContainer') as HTMLInputElement | null
	const s3 = document.getElementById('suppressMacMenuItem') as HTMLInputElement | null
	const s4 = document.getElementById('suppressIsolationInfo') as HTMLInputElement | null

	await optBrowser().storage.local.set({
		showOpenInNewTab: s1?.checked ?? true,
		showReopenInContainer: s2?.checked ?? true,
		suppressMacMenuItem: s3?.checked ?? false,
		suppressIsolationInfo: s4?.checked ?? false,
	})
}

document.addEventListener('DOMContentLoaded', () => {
	loadAndRenderSettings().catch(console.error)

	const form = document.getElementById('settings-form')
	form?.addEventListener('change', () => {
		saveSettings().catch(console.error)
	})
})
