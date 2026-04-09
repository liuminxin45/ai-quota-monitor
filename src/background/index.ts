import { initializeStorage } from '../shared/storage'
import { ensureAlarmConfigured, initAlarm, setupAlarmListener } from './alarm'
import { setupMessageListener } from './messaging'

// Extension installed or updated
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[AI Monitor] Extension installed/updated')
    await initializeStorage()
    await initAlarm()

    // Configure side panel to open on action click
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
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

void (async () => {
    await initializeStorage()
    await ensureAlarmConfigured()
})()

console.log('[AI Monitor] Background service worker loaded')
