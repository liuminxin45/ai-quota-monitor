import type { Platform } from './types'

export function sortPlatformsByBurdenDesc(platforms: Platform[]): Platform[] {
    return [...platforms].sort((left, right) => {
        const leftScore = left.burdenScore
        const rightScore = right.burdenScore

        if (leftScore === undefined && rightScore === undefined) return 0
        if (leftScore === undefined) return 1
        if (rightScore === undefined) return -1

        return rightScore - leftScore
    })
}