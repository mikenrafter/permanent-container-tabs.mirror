type OptionsBrowser = {
	storage: { local: { get(k: null): Promise<Record<string, unknown>>; set(i: Record<string, unknown>): Promise<void> } }
}
const optBrowser = (): OptionsBrowser => (globalThis as unknown as { browser: OptionsBrowser }).browser

interface PctSettings {
	prioritizeReopen: boolean
	suppressMacMenuItem: boolean
	suppressIsolationInfo: boolean
}

function getDefaultSettings(): PctSettings {
	return {
		prioritizeReopen: false,
		suppressMacMenuItem: false,
		suppressIsolationInfo: false,
	}
}

async function loadAndRenderSettings(): Promise<void> {
	const defaults = getDefaultSettings()
	const stored = await optBrowser().storage.local.get(null)

	const settings: PctSettings = {
		prioritizeReopen: typeof stored['prioritizeReopen'] === 'boolean' ? stored['prioritizeReopen'] : defaults.prioritizeReopen,
		suppressMacMenuItem: typeof stored['suppressMacMenuItem'] === 'boolean' ? stored['suppressMacMenuItem'] : defaults.suppressMacMenuItem,
		suppressIsolationInfo: typeof stored['suppressIsolationInfo'] === 'boolean' ? stored['suppressIsolationInfo'] : defaults.suppressIsolationInfo,
	}

	const openRadio = document.getElementById('prioritizeOpen') as HTMLInputElement | null
	const reopenRadio = document.getElementById('prioritizeReopen') as HTMLInputElement | null
	const s3 = document.getElementById('suppressMacMenuItem') as HTMLInputElement | null
	const s4 = document.getElementById('suppressIsolationInfo') as HTMLInputElement | null

	if (openRadio) openRadio.checked = !settings.prioritizeReopen
	if (reopenRadio) reopenRadio.checked = settings.prioritizeReopen
	if (s3) s3.checked = settings.suppressMacMenuItem
	if (s4) s4.checked = settings.suppressIsolationInfo
}

async function saveSettings(): Promise<void> {
	const openRadio = document.getElementById('prioritizeOpen') as HTMLInputElement | null
	const s3 = document.getElementById('suppressMacMenuItem') as HTMLInputElement | null
	const s4 = document.getElementById('suppressIsolationInfo') as HTMLInputElement | null

	await optBrowser().storage.local.set({
		prioritizeReopen: !(openRadio?.checked ?? true),
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
