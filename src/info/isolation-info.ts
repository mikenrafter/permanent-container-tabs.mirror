declare const browser: {
	storage: {
		local: {
			get(keys?: null | string | string[]): Promise<Record<string, unknown>>
			set(items: Record<string, unknown>): Promise<void>
		}
	}
	tabs: {
		query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string }): Promise<Array<{ id?: number; url?: string }>>
		remove(tabId: number): Promise<void>
	}
}

async function closeInfoTab(): Promise<void> {
	const tabs = await browser.tabs.query({ currentWindow: true })
	const currentUrl = window.location.href
	const thisTab = tabs.find(t => t.url && currentUrl.includes('isolation-info.html'))
	// Fallback: find any isolation-info tab
	const tab = thisTab ?? tabs.find(t => t.url?.includes('isolation-info'))
	if (tab?.id != null) {
		await browser.tabs.remove(tab.id)
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
			browser.storage.local
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
