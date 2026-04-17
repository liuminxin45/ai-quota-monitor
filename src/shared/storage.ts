import type { AppState, Platform, GlobalSettings, PlatformId, UsageData, UsageSnapshot } from './types'
import { DEFAULT_SETTINGS, createDefaultPlatform, ALL_PLATFORM_IDS } from './constants'
import { getCycleDurationMs } from './cycle'
import { computeBurdenScore } from './burden'

const STORAGE_KEY_PLATFORMS = 'platforms'
const STORAGE_KEY_SETTINGS = 'settings'
const STORAGE_KEY_USAGE_HISTORY_PREFIX = 'usage-history:'
const HISTORY_DEDUP_WINDOW_MS = 5 * 60 * 1000
const HISTORY_RETENTION_BUFFER_MS = 2 * 24 * 60 * 60 * 1000
const HISTORY_MAX_POINTS = 240

function toUsageSnapshot(usage: UsageData, timestamp: number, burdenScore?: number): UsageSnapshot {
    return {
        timestamp,
        used: usage.used,
        total: usage.total,
        unit: usage.unit,
        percentage: usage.percentage,
        remainingPercentage: Math.max(0, 100 - usage.percentage),
        resetTimestamp: usage.resetTimestamp,
        burdenScore,
    }
}

function pruneUsageHistory(
    platformId: PlatformId,
    history: UsageSnapshot[],
    latestTimestamp: number,
    latestResetTimestamp?: number
): UsageSnapshot[] {
    const retentionMs = getCycleDurationMs(platformId, latestResetTimestamp) + HISTORY_RETENTION_BUFFER_MS
    const cutoff = latestTimestamp - retentionMs
    return history.filter((snapshot) => snapshot.timestamp >= cutoff).slice(-HISTORY_MAX_POINTS)
}

export function getUsageHistoryStorageKey(platformId: PlatformId): string {
    return `${STORAGE_KEY_USAGE_HISTORY_PREFIX}${platformId}`
}

export async function getUsageHistory(platformId: PlatformId): Promise<UsageSnapshot[]> {
    const key = getUsageHistoryStorageKey(platformId)
    const result = await chrome.storage.local.get(key)
    return (result[key] as UsageSnapshot[] | undefined) ?? []
}

export async function appendUsageSnapshot(
    platformId: PlatformId,
    usage: UsageData,
    burdenScore?: number,
    timestamp = Date.now()
): Promise<UsageSnapshot[]> {
    const key = getUsageHistoryStorageKey(platformId)
    const history = await getUsageHistory(platformId)
    const nextSnapshot = toUsageSnapshot(usage, timestamp, burdenScore)
    const lastSnapshot = history[history.length - 1]

    if (
        lastSnapshot &&
        Math.abs(nextSnapshot.timestamp - lastSnapshot.timestamp) < HISTORY_DEDUP_WINDOW_MS &&
        lastSnapshot.used === nextSnapshot.used &&
        lastSnapshot.total === nextSnapshot.total &&
        lastSnapshot.percentage === nextSnapshot.percentage &&
        lastSnapshot.resetTimestamp === nextSnapshot.resetTimestamp
    ) {
        return history
    }

    const nextHistory = pruneUsageHistory(platformId, [...history, nextSnapshot], nextSnapshot.timestamp, nextSnapshot.resetTimestamp)
    await chrome.storage.local.set({ [key]: nextHistory })
    return nextHistory
}

// Get all platforms from storage
export async function getPlatforms(): Promise<Platform[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_PLATFORMS)
    return (result[STORAGE_KEY_PLATFORMS] as Platform[] | undefined) ?? []
}

// Save platforms to storage
export async function setPlatforms(platforms: Platform[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_PLATFORMS]: platforms })
}

// Update a single platform in storage
export async function updatePlatform(
    platformId: PlatformId,
    updates: Partial<Platform>
): Promise<void> {
    const platforms = await getPlatforms()
    const index = platforms.findIndex((p) => p.id === platformId)
    if (index !== -1) {
        platforms[index] = { ...platforms[index], ...updates }
        await setPlatforms(platforms)
    }
}

// Get global settings
export async function getSettings(): Promise<GlobalSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS)
    return (result[STORAGE_KEY_SETTINGS] as GlobalSettings | undefined) ?? DEFAULT_SETTINGS
}

// Save global settings
export async function setSettings(settings: GlobalSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings })
}

export async function updateSettings(updates: Partial<GlobalSettings>): Promise<void> {
    const settings = await getSettings()
    await setSettings({ ...settings, ...updates })
}

export async function markRefreshAllCompleted(timestamp = Date.now()): Promise<void> {
    await updateSettings({ lastRefreshAllAt: timestamp })
}

export async function updateCopilotSubscriptionStartedAt(subscriptionStartedAt?: number): Promise<void> {
    const platforms = await getPlatforms()
    const index = platforms.findIndex((platform) => platform.id === 'github-copilot')
    if (index === -1) {
        return
    }

    const current = platforms[index]
    const nextBurdenScore = current.usage
        ? computeBurdenScore('github-copilot', current.usage, subscriptionStartedAt)
        : current.burdenScore

    platforms[index] = {
        ...current,
        subscriptionStartedAt,
        burdenScore: nextBurdenScore,
    }

    await setPlatforms(platforms)
}

export async function updatePlatformMonthlyPrice(platformId: PlatformId, monthlyPriceRmb?: number): Promise<void> {
    const platforms = await getPlatforms()
    const index = platforms.findIndex((platform) => platform.id === platformId)
    if (index === -1) {
        return
    }

    platforms[index] = {
        ...platforms[index],
        monthlyPriceRmb,
    }

    await setPlatforms(platforms)
}

// Get full app state
export async function getAppState(): Promise<AppState> {
    const [platforms, settings] = await Promise.all([getPlatforms(), getSettings()])
    return { platforms, settings }
}

// Initialize storage with defaults (called on install/update)
// Always merges DEFAULT_SETTINGS so code changes to defaults take effect on reload.
export async function initializeStorage(): Promise<void> {
    const existing = await getPlatforms()
    if (existing.length === 0) {
        const defaults = ALL_PLATFORM_IDS.map(createDefaultPlatform)
        await setPlatforms(defaults)
    }
    // Merge stored settings with current defaults so updated defaults always win
    const stored = await chrome.storage.local.get(STORAGE_KEY_SETTINGS)
    const existingSettings = (stored[STORAGE_KEY_SETTINGS] as Partial<GlobalSettings> | undefined) ?? {}
    await setSettings({ ...DEFAULT_SETTINGS, ...existingSettings })
}

// Listen for storage changes
export function onStorageChange(
    callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): () => void {
    const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
    ) => {
        if (areaName === 'local') {
            callback(changes)
        }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
}
