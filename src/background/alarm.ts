import { getSettings } from '../shared/storage'
import { MIN_REFRESH_INTERVAL_SECONDS, MAX_REFRESH_INTERVAL_SECONDS } from '../shared/constants'
import { refreshAllPlatforms } from './platformManager'

const ALARM_NAME = 'refresh-usage'
const AUTO_REFRESH_GRACE_MS = 90 * 1000

function clampRefreshIntervalSeconds(refreshInterval: number): number {
    return Math.min(Math.max(refreshInterval, MIN_REFRESH_INTERVAL_SECONDS), MAX_REFRESH_INTERVAL_SECONDS)
}

function toPeriodInMinutes(refreshInterval: number): number {
    return Math.max(clampRefreshIntervalSeconds(refreshInterval) / 60, 0.5)
}

// Initialize the periodic refresh alarm — force recreation.
export async function initAlarm(): Promise<void> {
    const settings = await getSettings()

    await chrome.alarms.clear(ALARM_NAME)

    if (!settings.autoRefresh) return

    const periodInMinutes = toPeriodInMinutes(settings.refreshInterval)
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: periodInMinutes, periodInMinutes })
    console.log(`[AI Monitor] Alarm set: first fire in ${periodInMinutes} min, then every ${periodInMinutes} min`)
}

// Reconcile the alarm with current settings without resetting a correct schedule.
// This is important because service workers restart often in MV3.
export async function ensureAlarmConfigured(): Promise<void> {
    const settings = await getSettings()
    const desiredPeriod = toPeriodInMinutes(settings.refreshInterval)
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

export async function refreshIfOverdue(): Promise<void> {
    const settings = await getSettings()
    if (!settings.autoRefresh) {
        return
    }

    const refreshIntervalSeconds = clampRefreshIntervalSeconds(settings.refreshInterval)
    const refreshIntervalMs = refreshIntervalSeconds * 1000
    const lastRefreshAllAt = settings.lastRefreshAllAt ?? 0
    const elapsedMs = Date.now() - lastRefreshAllAt

    if (!lastRefreshAllAt || elapsedMs >= refreshIntervalMs + AUTO_REFRESH_GRACE_MS) {
        console.log('[AI Monitor] Auto refresh overdue, refreshing immediately...')
        await refreshAllPlatforms()
    }
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
