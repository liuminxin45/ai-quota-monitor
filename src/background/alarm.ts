import { getSettings } from '../shared/storage'
import { refreshAllPlatforms } from './platformManager'

const ALARM_NAME = 'refresh-usage'

// Initialize the periodic refresh alarm — force recreation.
export async function initAlarm(): Promise<void> {
    const settings = await getSettings()

    await chrome.alarms.clear(ALARM_NAME)

    if (!settings.autoRefresh) return

    const periodInMinutes = Math.max(settings.refreshInterval / 60, 0.5)
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: periodInMinutes, periodInMinutes })
    console.log(`[AI Monitor] Alarm set: first fire in ${periodInMinutes} min, then every ${periodInMinutes} min`)
}

// Reconcile the alarm with current settings without resetting a correct schedule.
// This is important because service workers restart often in MV3.
export async function ensureAlarmConfigured(): Promise<void> {
    const settings = await getSettings()
    const desiredPeriod = Math.max(settings.refreshInterval / 60, 0.5)
    const existing = await chrome.alarms.get(ALARM_NAME)

    if (!settings.autoRefresh) {
        if (existing) {
            await chrome.alarms.clear(ALARM_NAME)
        }
        return
    }

    const existingPeriod = existing?.periodInMinutes
    if (existing && existingPeriod === desiredPeriod) {
        return
    }

    await chrome.alarms.clear(ALARM_NAME)
    await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: desiredPeriod,
        periodInMinutes: desiredPeriod,
    })
    console.log(`[AI Monitor] Alarm reconciled: first fire in ${desiredPeriod} min, then every ${desiredPeriod} min`)
}

// Update alarm when settings change
export async function updateAlarm(): Promise<void> {
    await chrome.alarms.clear(ALARM_NAME)
    await initAlarm()
}

// Handle alarm trigger
export function setupAlarmListener(): void {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === ALARM_NAME) {
            console.log('[AI Monitor] Alarm triggered, refreshing all platforms...')
            await refreshAllPlatforms()
        }
    })
}
