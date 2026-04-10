import type { PlatformId, UsageData } from './types'
import { getCycleDurationMs, getEffectiveUsageStartTimestamp } from './cycle'

export function computeBurdenScore(
    platformId: PlatformId,
    usage: UsageData,
    subscriptionStartedAt?: number,
    now = Date.now()
): number {
    const cycleMs = getCycleDurationMs(platformId, usage.resetTimestamp)
    const usageStartTimestamp = getEffectiveUsageStartTimestamp(platformId, usage.resetTimestamp, subscriptionStartedAt)

    let elapsedMs: number
    if (usageStartTimestamp !== undefined) {
        elapsedMs = Math.max(0, Math.min(cycleMs, now - usageStartTimestamp))
    } else {
        elapsedMs = 0
    }

    const elapsedFraction = cycleMs > 0 ? elapsedMs / cycleMs : 0
    if (elapsedFraction <= 0) {
        return Math.round(usage.percentage)
    }

    return Math.round(usage.percentage / elapsedFraction)
}