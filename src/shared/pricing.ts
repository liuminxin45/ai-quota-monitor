import type { Platform } from './types'

export function getTotalMonthlyPriceRmb(platforms: Platform[]): number {
    return platforms.reduce((total, platform) => total + (platform.monthlyPriceRmb ?? 0), 0)
}

export function formatMonthlyPriceRmb(value?: number): string {
    if (value === undefined || Number.isNaN(value) || value <= 0) {
        return '未设价格'
    }

    const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
    return `¥${formatted}/月`
}

export function hasMonthlyPrice(value?: number): boolean {
    return value !== undefined && !Number.isNaN(value) && value > 0
}