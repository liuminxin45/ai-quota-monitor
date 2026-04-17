import type { PlatformId, UsageData } from './types'
import { getCycleDurationMs, getEffectiveUsageStartTimestamp } from './cycle'
import { getWorkingDurationBetween } from './workingTime'

export function computeBurdenScore(
    platformId: PlatformId,
    usage: UsageData,
    subscriptionStartedAt?: number,
    now = Date.now()
): number {
    const cycleMs = getCycleDurationMs(platformId, usage.resetTimestamp)
    const usageStartTimestamp = getEffectiveUsageStartTimestamp(platformId, usage.resetTimestamp, subscriptionStartedAt)

    let elapsedMs: number
    let totalMs: number
    if (usageStartTimestamp !== undefined) {
        elapsedMs = getWorkingDurationBetween(usageStartTimestamp, Math.min(now, usage.resetTimestamp ?? now))
        totalMs = getWorkingDurationBetween(usageStartTimestamp, usage.resetTimestamp ?? (usageStartTimestamp + cycleMs))
    } else {
        elapsedMs = 0
        totalMs = 0
    }

    const elapsedFraction = totalMs > 0 ? elapsedMs / totalMs : 0
    if (elapsedFraction <= 0) {
        return Math.round(usage.percentage)
    }

    return Math.round(usage.percentage / elapsedFraction)
}
