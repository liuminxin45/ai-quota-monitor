// Platform identifiers for MVP
export type PlatformId = 'github-copilot' | 'chatgpt' | 'kimi'

// Platform health status
export type PlatformStatus = 'ok' | 'warning' | 'danger' | 'not_login' | 'error'

// Usage data for a single platform
export interface UsageData {
    used: number
    total: number
    unit: string // e.g. 'requests', 'tokens', 'messages'
    percentage: number // 0-100
    resetTime?: string // raw text from platform page (for fallback display)
    resetTimestamp?: number // epoch ms — when the quota resets (for unified countdown UI)
}

export interface UsageSnapshot {
    timestamp: number
    used: number
    total: number
    unit: string
    percentage: number
    remainingPercentage: number
    resetTimestamp?: number
    burdenScore?: number
}

export interface QuotaTrendPoint {
    timestamp: number
    remainingPercentage: number
    usagePercentage: number
}

export interface QuotaTrendModel {
    actual: QuotaTrendPoint[]
    forecast: QuotaTrendPoint[]
    latestRemainingPercentage: number
    latestTimestamp: number
    resetTimestamp?: number
    projectedDepletionTimestamp?: number
    projectedRemainingAtReset?: number
    projectedUsageRatePerDay: number
    projectedGapToResetMs?: number
    trendWindow: 'insufficient' | 'recent' | 'cycle' | 'stable'
}

// Full platform entity
export interface Platform {
    id: PlatformId
    name: string
    usageUrl: string
    loginUrl: string
    status: PlatformStatus
    usage: UsageData | null
    lastUpdated: number | null
    enabled: boolean
    errorMessage?: string
    monthlyPriceRmb?: number
    subscriptionStartedAt?: number
    /**
     * Projected usage % at end of reset cycle, based on current burn rate.
     * <60 = 轻松, 60-100 = 适中, 100-140 = 偏重, >140 = 过载
     */
    burdenScore?: number
}

// Global settings
export interface GlobalSettings {
    autoRefresh: boolean
    refreshInterval: number // seconds, default 60
    lastRefreshAllAt?: number
}

// Full persisted state
export interface AppState {
    settings: GlobalSettings
    platforms: Platform[]
}

export interface TrayPlatformSnapshot {
    id: PlatformId
    name: string
    enabled: boolean
    status: PlatformStatus
    remainingPercentage: number | null
    usedPercentage: number | null
    lastUpdated: number | null
    errorMessage?: string
}

export interface TrayQuotaUpdatePayload {
    platforms: TrayPlatformSnapshot[]
    generatedAt: number
}

export interface TrayBridgeResponse {
    ok: boolean
    error?: string
}

// --- Messages ---

export type MessageType =
    | 'SCRAPE_USAGE'
    | 'USAGE_RESULT'
    | 'REFRESH_ALL'
    | 'REFRESH_ONE'
    | 'OPEN_LOGIN'
    | 'GET_STATE'
    | 'STATE_UPDATED'
    | 'ADD_PLATFORM'
    | 'REMOVE_PLATFORM'

export interface BaseMessage {
    type: MessageType
}

export interface ScrapeUsageMessage extends BaseMessage {
    type: 'SCRAPE_USAGE'
    platformId: PlatformId
}

export interface UsageResultMessage extends BaseMessage {
    type: 'USAGE_RESULT'
    platformId: PlatformId
    success: boolean
    usage?: UsageData
    error?: string
}

export interface RefreshAllMessage extends BaseMessage {
    type: 'REFRESH_ALL'
}

export interface RefreshOneMessage extends BaseMessage {
    type: 'REFRESH_ONE'
    platformId: PlatformId
}

export interface OpenLoginMessage extends BaseMessage {
    type: 'OPEN_LOGIN'
    platformId: PlatformId
}

export interface GetStateMessage extends BaseMessage {
    type: 'GET_STATE'
}

export interface AddPlatformMessage extends BaseMessage {
    type: 'ADD_PLATFORM'
    platformId: PlatformId
}

export interface RemovePlatformMessage extends BaseMessage {
    type: 'REMOVE_PLATFORM'
    platformId: PlatformId
}

export type AppMessage =
    | ScrapeUsageMessage
    | UsageResultMessage
    | RefreshAllMessage
    | RefreshOneMessage
    | OpenLoginMessage
    | GetStateMessage
    | AddPlatformMessage
    | RemovePlatformMessage
