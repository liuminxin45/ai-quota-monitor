import { CYCLE_DAYS } from './constants'
import type { PlatformId } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function getCycleStartTimestamp(platformId: PlatformId, resetTimestamp?: number): number | undefined {
    if (!resetTimestamp) {
        return undefined
    }

    if (platformId === 'github-copilot') {
        const resetDate = new Date(resetTimestamp)
        return Date.UTC(resetDate.getUTCFullYear(), resetDate.getUTCMonth() - 1, 1, 0, 0, 0, 0)
    }

    return resetTimestamp - CYCLE_DAYS[platformId] * DAY_MS
}

export function getCycleDurationMs(platformId: PlatformId, resetTimestamp?: number): number {
    const cycleStartTimestamp = getCycleStartTimestamp(platformId, resetTimestamp)
    if (cycleStartTimestamp !== undefined && resetTimestamp !== undefined) {
        return Math.max(1, resetTimestamp - cycleStartTimestamp)
    }

    return CYCLE_DAYS[platformId] * DAY_MS
}

export function getEffectiveUsageStartTimestamp(
    platformId: PlatformId,
    resetTimestamp?: number,
    subscriptionStartedAt?: number
): number | undefined {
    const cycleStartTimestamp = getCycleStartTimestamp(platformId, resetTimestamp)
    if (cycleStartTimestamp === undefined) {
        return undefined
    }

    if (platformId !== 'github-copilot' || subscriptionStartedAt === undefined || resetTimestamp === undefined) {
        return cycleStartTimestamp
    }

    if (subscriptionStartedAt <= cycleStartTimestamp || subscriptionStartedAt >= resetTimestamp) {
        return cycleStartTimestamp
    }

    return subscriptionStartedAt
}