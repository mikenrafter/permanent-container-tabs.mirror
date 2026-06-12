import type { PctSettings, StorageLocalApi } from '../models'

export function getDefaultSettings(): PctSettings {
	return {
		showOpenInNewTab: true,
		showReopenInContainer: true,
		suppressMacMenuItem: false,
		suppressIsolationInfo: false,
	}
}

export function validateSettings(settings: PctSettings): PctSettings {
	const keys: Array<keyof PctSettings> = [
		'showOpenInNewTab',
		'showReopenInContainer',
		'suppressMacMenuItem',
		'suppressIsolationInfo',
	]
	for (const key of keys) {
		if (typeof settings[key] !== 'boolean') {
			throw new Error(`Invalid settings: '${key}' must be a boolean, got ${typeof settings[key]}`)
		}
	}
	return settings
}

export async function loadSettings(storage: StorageLocalApi): Promise<PctSettings> {
	const defaults = getDefaultSettings()
	const stored = await storage.get(null)
	const merged: PctSettings = { ...defaults }

	if (typeof stored['showOpenInNewTab'] === 'boolean') {
		merged.showOpenInNewTab = stored['showOpenInNewTab']
	}
	if (typeof stored['showReopenInContainer'] === 'boolean') {
		merged.showReopenInContainer = stored['showReopenInContainer']
	}
	if (typeof stored['suppressMacMenuItem'] === 'boolean') {
		merged.suppressMacMenuItem = stored['suppressMacMenuItem']
	}
	if (typeof stored['suppressIsolationInfo'] === 'boolean') {
		merged.suppressIsolationInfo = stored['suppressIsolationInfo']
	}

	return merged
}

export async function saveSettings(storage: StorageLocalApi, settings: PctSettings): Promise<void> {
	await storage.set(settings)
}
