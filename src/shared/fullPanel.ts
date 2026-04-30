const FULL_PANEL_PATH = 'src/sidepanel/index.html'

type FullPanelTarget = 'side-panel' | 'tab'

function getFullPanelUrl(): string {
    return chrome.runtime.getURL(FULL_PANEL_PATH)
}

export async function openFullPanel(windowId?: number): Promise<FullPanelTarget> {
    if (chrome.sidePanel?.open && windowId !== undefined) {
        try {
            await chrome.sidePanel.open({ windowId })
            return 'side-panel'
        } catch (error) {
            console.warn('[AI Monitor] Failed to open side panel, falling back to tab:', error)
        }
    }

    const createProperties: chrome.tabs.CreateProperties = {
        url: getFullPanelUrl(),
    }

    if (windowId !== undefined && windowId !== chrome.windows.WINDOW_ID_CURRENT) {
        createProperties.windowId = windowId
    }

    await chrome.tabs.create(createProperties)
    return 'tab'
}
