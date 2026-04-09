import { initializeStorage } from '../shared/storage'
import { ensureAlarmConfigured, initAlarm, setupAlarmListener } from './alarm'
import { setupContextMenu, setupContextMenuListener } from './contextMenu'
import { setupMessageListener } from './messaging'

// Extension installed or updated
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[AI Monitor] Extension installed/updated')
    await initializeStorage()
    await initAlarm()
    await setupContextMenu()

    // Keep extension action bound to the popup; side panel is opened explicitly.
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    } catch {
        // sidePanel API may not be available in all environments
        console.warn('[AI Monitor] sidePanel API not available')
    }
})

// Service worker startup
chrome.runtime.onStartup.addListener(async () => {
    console.log('[AI Monitor] Service worker started')
    await initAlarm()
})

// Setup listeners
setupAlarmListener()
setupMessageListener()
setupContextMenuListener()

void (async () => {
    await initializeStorage()
    await ensureAlarmConfigured()
})()

console.log('[AI Monitor] Background service worker loaded')
