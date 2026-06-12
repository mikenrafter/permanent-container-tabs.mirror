import { PctRuntimeImpl } from './background/pctRuntime'
import { TcLayerImpl } from './background/tcLayer'
import { MenuHandlerImpl } from './background/menuHandler'
import { TabReopenerImpl } from './background/tabReopener'
import type { BrowserApi } from './models'

declare global {
	var browser: BrowserApi
	interface Window {
		browser: BrowserApi
	}
}

const browserApi = globalThis.browser

const tcLayer = new TcLayerImpl({ browserApi, logger: console })
const tabReopener = new TabReopenerImpl({ browserApi, tcLayer })
const menuHandler = new MenuHandlerImpl({ browserApi, tcLayer, tabReopener })
const runtime = new PctRuntimeImpl({ browserApi, tcLayer, menuHandler })

runtime.initialize().catch(console.error)
