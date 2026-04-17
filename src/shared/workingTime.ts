const HOUR_MS = 60 * 60 * 1000
const WORK_START_HOUR = 9
const WORK_END_HOUR = 24

function getWorkdayStart(timestamp: number): number {
    const date = new Date(timestamp)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), WORK_START_HOUR, 0, 0, 0).getTime()
}

function getWorkdayEnd(timestamp: number): number {
    const date = new Date(timestamp)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime()
}

function getNextWorkdayStart(timestamp: number): number {
    const dayEnd = getWorkdayEnd(timestamp)
    return dayEnd + WORK_START_HOUR * HOUR_MS
}

export function getWorkingDayDurationMs(): number {
    return (WORK_END_HOUR - WORK_START_HOUR) * HOUR_MS
}

export function getWorkingDurationBetween(startTimestamp: number, endTimestamp: number): number {
    if (endTimestamp <= startTimestamp) {
        return 0
    }

    let totalMs = 0
    let cursor = startTimestamp

    while (cursor < endTimestamp) {
        const dayStart = getWorkdayStart(cursor)
        const dayEnd = getWorkdayEnd(cursor)
        const overlapStart = Math.max(cursor, dayStart)
        const overlapEnd = Math.min(endTimestamp, dayEnd)

        if (overlapEnd > overlapStart) {
            totalMs += overlapEnd - overlapStart
        }

        cursor = dayEnd
    }

    return totalMs
}

export function addWorkingDuration(startTimestamp: number, durationMs: number): number {
    if (durationMs <= 0) {
        return startTimestamp
    }

    let remainingMs = durationMs
    let cursor = startTimestamp

    while (remainingMs > 0) {
        const dayStart = getWorkdayStart(cursor)
        const dayEnd = getWorkdayEnd(cursor)

        if (cursor < dayStart) {
            cursor = dayStart
        } else if (cursor >= dayEnd) {
            cursor = getNextWorkdayStart(cursor)
            continue
        }

        const availableMs = dayEnd - cursor
        if (remainingMs <= availableMs) {
            return cursor + remainingMs
        }

        remainingMs -= availableMs
        cursor = getNextWorkdayStart(cursor)
    }

    return cursor
}
