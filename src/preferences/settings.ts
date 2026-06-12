import type { PctSettings, StorageLocalApi } from '../models'

export function getDefaultSettings(): PctSettings {
	return {
		prioritizeReopen: false,
		suppressMacMenuItem: false,
		suppressIsolationInfo: false,
	}
}

export function validateSettings(settings: PctSettings): PctSettings {
	const keys: Array<keyof PctSettings> = [
		'prioritizeReopen',
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

	if (typeof stored['prioritizeReopen'] === 'boolean') {
		merged.prioritizeReopen = stored['prioritizeReopen']
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
	await storage.set(settings as unknown as Record<string, unknown>)
}
