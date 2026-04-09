import type { AppState, Platform, GlobalSettings, PlatformId } from './types'
import { DEFAULT_SETTINGS, createDefaultPlatform, ALL_PLATFORM_IDS } from './constants'

const STORAGE_KEY_PLATFORMS = 'platforms'
const STORAGE_KEY_SETTINGS = 'settings'

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
    await setSettings({ ...DEFAULT_SETTINGS, ...existingSettings, refreshInterval: DEFAULT_SETTINGS.refreshInterval })
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
