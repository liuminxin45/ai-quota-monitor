const OPEN_SIDE_PANEL_MENU_ID = 'open-sidepanel'

async function openSidePanelForWindow(windowId?: number): Promise<void> {
    if (windowId !== undefined) {
        await chrome.sidePanel.open({ windowId })
        return
    }

    const win = await chrome.windows.getLastFocused()
    if (win.id !== undefined) {
        await chrome.sidePanel.open({ windowId: win.id })
    }
}

export async function setupContextMenu(): Promise<void> {
    try {
        await chrome.contextMenus.removeAll()
    } catch {
        // ignore remove errors on fresh installs
    }

    chrome.contextMenus.create({
        id: OPEN_SIDE_PANEL_MENU_ID,
        title: '打开 AI Monitor 侧边栏',
        contexts: ['action'],
    })
}

export function setupContextMenuListener(): void {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId === OPEN_SIDE_PANEL_MENU_ID) {
            await openSidePanelForWindow(tab?.windowId)
        }
    })
}

export { openSidePanelForWindow }