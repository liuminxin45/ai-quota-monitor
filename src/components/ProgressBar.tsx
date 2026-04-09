import React from 'react'
import type { PlatformStatus } from '../shared/types'

interface ProgressBarProps {
    percentage: number
    status: PlatformStatus
}

const barColors: Record<PlatformStatus, string> = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    not_login: 'bg-gray-300',
    error: 'bg-red-300',
}

export function ProgressBar({ percentage, status }: ProgressBarProps) {
    const clamped = Math.min(100, Math.max(0, percentage))
    const color = barColors[status]

    return (
        <div className="w-full">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            <div className="flex justify-end mt-0.5">
                <span className="text-xs text-gray-500">{clamped}%</span>
            </div>
        </div>
    )
}
