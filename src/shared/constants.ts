import type { Platform, PlatformId, GlobalSettings } from './types'

// Status thresholds
export const STATUS_THRESHOLDS = {
    WARNING: 70,
    DANGER: 90,
} as const

// Default settings
export const DEFAULT_SETTINGS: GlobalSettings = {
    autoRefresh: true,
    refreshInterval: 1800,
}
export const MIN_REFRESH_INTERVAL_SECONDS = 5 * 60
export const MAX_REFRESH_INTERVAL_SECONDS = 12 * 60 * 60

// Delay between sequential platform refreshes (ms)
export const REFRESH_DELAY_MS = 2000
export const TRAY_BRIDGE_PORT = 38431
export const TRAY_BRIDGE_ENDPOINT = `http://127.0.0.1:${TRAY_BRIDGE_PORT}/api/quota-update`
export const TRAY_BRIDGE_SYNC_DEBOUNCE_MS = 500

// Platform definitions
export const PLATFORM_CONFIGS: Record<PlatformId, Omit<Platform, 'status' | 'usage' | 'lastUpdated' | 'enabled'>> = {
    'github-copilot': {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        usageUrl: 'https://github.com/settings/copilot',
        loginUrl: 'https://github.com/login',
    },
    chatgpt: {
        id: 'chatgpt',
        name: 'ChatGPT / Codex',
        usageUrl: 'https://chatgpt.com/codex/cloud/settings/usage',
        loginUrl: 'https://chatgpt.com/',
    },
    kimi: {
        id: 'kimi',
        name: 'Kimi',
        usageUrl: 'https://www.kimi.com/code/console',
        loginUrl: 'https://www.kimi.com/code/console',
    },
}

// Quota reset cycle length in days per platform
export const CYCLE_DAYS: Record<PlatformId, number> = {
    'github-copilot': 31,  // resets on the 1st at UTC 00:00 (natural month fallback)
    chatgpt: 7,            // weekly Codex quota
    kimi: 7,               // weekly usage quota
}

// Create a default (disabled) platform entry
export function createDefaultPlatform(id: PlatformId): Platform {
    const config = PLATFORM_CONFIGS[id]
    return {
        ...config,
        status: 'not_login',
        usage: null,
        lastUpdated: null,
        enabled: false,
    }
}

// All available platform IDs
export const ALL_PLATFORM_IDS: PlatformId[] = ['github-copilot', 'chatgpt', 'kimi']
