import { CYCLE_DAYS } from './constants'
import { getCycleDurationMs, getCycleStartTimestamp, getEffectiveUsageStartTimestamp } from './cycle'
import type { PlatformId, QuotaTrendModel, QuotaTrendPoint, UsageData, UsageSnapshot } from './types'
import { addWorkingDuration, getWorkingDayDurationMs, getWorkingDurationBetween } from './workingTime'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const RESET_TOLERANCE_MS = 6 * HOUR_MS
const MAX_RENDER_POINTS = 28

function toSnapshot(usage: UsageData, timestamp: number, burdenScore?: number): UsageSnapshot {
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

function sortSnapshots(history: UsageSnapshot[]): UsageSnapshot[] {
    return [...history].sort((left, right) => left.timestamp - right.timestamp)
}

function samplePoints(points: QuotaTrendPoint[], maxPoints = MAX_RENDER_POINTS): QuotaTrendPoint[] {
    if (points.length <= maxPoints) {
        return points
    }

    const sampled: QuotaTrendPoint[] = []
    const lastIndex = points.length - 1
    for (let index = 0; index < maxPoints; index++) {
        const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex)
        const point = points[sourceIndex]
        if (!sampled.length || sampled[sampled.length - 1].timestamp !== point.timestamp) {
            sampled.push(point)
        }
    }
    if (sampled[sampled.length - 1].timestamp !== points[lastIndex].timestamp) {
        sampled.push(points[lastIndex])
    }
    return sampled
}

function calculateRegressionSlope(points: QuotaTrendPoint[]): number {
    if (points.length < 2) {
        return 0
    }

    const firstTimestamp = points[0].timestamp
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumXX = 0

    for (const point of points) {
        const x = getWorkingDurationBetween(firstTimestamp, point.timestamp)
        const y = point.usagePercentage
        sumX += x
        sumY += y
        sumXY += x * y
        sumXX += x * x
    }

    const count = points.length
    const denominator = count * sumXX - sumX * sumX
    if (denominator === 0) {
        return 0
    }

    return (count * sumXY - sumX * sumY) / denominator
}

function calculateCycleAverageSlope(
    platformId: PlatformId,
    latestPoint: QuotaTrendPoint,
    latestResetTimestamp?: number,
    subscriptionStartedAt?: number
): number {
    const usageStartTimestamp = getEffectiveUsageStartTimestamp(platformId, latestResetTimestamp, subscriptionStartedAt)
    if (!latestResetTimestamp || usageStartTimestamp === undefined) {
        return 0
    }

    const elapsedMs = latestPoint.timestamp - usageStartTimestamp
    if (elapsedMs <= 0) {
        return 0
    }

    const workingElapsedMs = getWorkingDurationBetween(usageStartTimestamp, latestPoint.timestamp)
    if (workingElapsedMs <= 0) {
        return 0
    }

    return latestPoint.usagePercentage / workingElapsedMs
}

function filterCurrentCycle(platformId: PlatformId, history: UsageSnapshot[]): UsageSnapshot[] {
    if (!history.length) {
        return history
    }

    const latestSnapshot = history[history.length - 1]
    const latestResetTimestamp = latestSnapshot.resetTimestamp

    if (latestResetTimestamp) {
        const cycleStart = getCycleStartTimestamp(platformId, latestResetTimestamp) ?? (latestResetTimestamp - getCycleDurationMs(platformId, latestResetTimestamp))
        return history.filter((snapshot) => {
            const sameReset =
                snapshot.resetTimestamp !== undefined &&
                Math.abs(snapshot.resetTimestamp - latestResetTimestamp) <= RESET_TOLERANCE_MS
            return sameReset || snapshot.timestamp >= cycleStart
        })
    }

    const cycleMs = CYCLE_DAYS[platformId] * DAY_MS
    return history.filter((snapshot) => snapshot.timestamp >= latestSnapshot.timestamp - cycleMs)
}

export function buildQuotaTrendModel(
    platformId: PlatformId,
    history: UsageSnapshot[],
    currentUsage?: UsageData | null,
    currentTimestamp?: number | null,
    burdenScore?: number,
    subscriptionStartedAt?: number
): QuotaTrendModel | null {
    const snapshots = sortSnapshots(history)
    const syntheticSnapshot =
        currentUsage && currentTimestamp
            ? toSnapshot(currentUsage, currentTimestamp, burdenScore)
            : undefined

    if (syntheticSnapshot) {
        const lastSnapshot = snapshots[snapshots.length - 1]
        if (
            !lastSnapshot ||
            lastSnapshot.timestamp !== syntheticSnapshot.timestamp ||
            lastSnapshot.percentage !== syntheticSnapshot.percentage ||
            lastSnapshot.used !== syntheticSnapshot.used
        ) {
            snapshots.push(syntheticSnapshot)
        }
    }

    if (!snapshots.length) {
        return null
    }

    const cycleSnapshots = filterCurrentCycle(platformId, snapshots)
    const actualPoints = cycleSnapshots.map<QuotaTrendPoint>((snapshot) => ({
        timestamp: snapshot.timestamp,
        remainingPercentage: snapshot.remainingPercentage,
        usagePercentage: snapshot.percentage,
    }))
    const latestPoint = actualPoints[actualPoints.length - 1]
    const latestResetTimestamp = cycleSnapshots[cycleSnapshots.length - 1]?.resetTimestamp
    let trendWindow: QuotaTrendModel['trendWindow'] = latestResetTimestamp ? 'cycle' : 'insufficient'
    let slope = calculateCycleAverageSlope(platformId, latestPoint, latestResetTimestamp, subscriptionStartedAt)

    if (slope <= 0 && actualPoints.length >= 2) {
        slope = calculateRegressionSlope(actualPoints)
        trendWindow = slope > 0 ? 'cycle' : 'stable'
    } else if (slope <= 0) {
        trendWindow = 'insufficient'
    }

    const forecast: QuotaTrendPoint[] = []
    let projectedDepletionTimestamp: number | undefined
    let projectedRemainingAtReset: number | undefined
    let projectedGapToResetMs: number | undefined

    if (trendWindow !== 'insufficient' && slope > 0) {
        const msToDeplete = ((100 - latestPoint.usagePercentage) / slope)
        const depletionTimestamp = addWorkingDuration(latestPoint.timestamp, msToDeplete)
        if (Number.isFinite(depletionTimestamp)) {
            projectedDepletionTimestamp = depletionTimestamp
        }
    } else if (trendWindow !== 'insufficient') {
        trendWindow = 'stable'
    }

    if (latestResetTimestamp) {
        const endTimestamp =
            projectedDepletionTimestamp && projectedDepletionTimestamp < latestResetTimestamp
                ? projectedDepletionTimestamp
                : latestResetTimestamp
        const projectedUsageAtEnd = latestPoint.usagePercentage + slope * getWorkingDurationBetween(latestPoint.timestamp, endTimestamp)
        const projectedRemainingAtEnd = Math.max(0, Math.min(100, 100 - projectedUsageAtEnd))
        projectedRemainingAtReset = projectedDepletionTimestamp && projectedDepletionTimestamp < latestResetTimestamp
            ? 0
            : projectedRemainingAtEnd
        projectedGapToResetMs = projectedDepletionTimestamp !== undefined
            ? latestResetTimestamp - projectedDepletionTimestamp
            : undefined

        forecast.push(latestPoint)
        forecast.push({
            timestamp: endTimestamp,
            remainingPercentage: projectedRemainingAtEnd,
            usagePercentage: Math.max(0, Math.min(100, projectedUsageAtEnd)),
        })
    }

    return {
        actual: samplePoints(actualPoints),
        forecast,
        latestRemainingPercentage: latestPoint.remainingPercentage,
        latestTimestamp: latestPoint.timestamp,
        resetTimestamp: latestResetTimestamp,
        projectedDepletionTimestamp,
        projectedRemainingAtReset,
        projectedUsageRatePerDay: Math.max(0, slope * getWorkingDayDurationMs()),
        projectedGapToResetMs,
        trendWindow,
    }
}
