type PageBrowser = {
	storage: { local: { set(items: Record<string, unknown>): Promise<void> } }
	tabs: {
		query(q: { currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string }>>
		remove(tabId: number): Promise<void>
	}
}

const pageBrowser = (): PageBrowser => (globalThis as unknown as { browser: PageBrowser }).browser

async function closeInfoTab(): Promise<void> {
	const tabs = await pageBrowser().tabs.query({ currentWindow: true })
	const thisTab = tabs.find(t => t.url?.includes('isolation-info'))
	if (thisTab?.id != null) {
		await pageBrowser().tabs.remove(thisTab.id)
	}
}

export function initIsolationInfoPage(): void {
	const okBtn = document.getElementById('ok-btn')
	const neverBtn = document.getElementById('never-show-btn')

	if (okBtn) {
		okBtn.addEventListener('click', () => {
			closeInfoTab().catch(console.error)
		})
	}

	if (neverBtn) {
		neverBtn.addEventListener('click', () => {
			pageBrowser().storage.local
				.set({ suppressIsolationInfo: true })
				.then(() => closeInfoTab())
				.catch(console.error)
		})
	}
}

// Auto-init when loaded in browser
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		initIsolationInfoPage()
	})
}
