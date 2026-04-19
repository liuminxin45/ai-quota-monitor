import React from 'react'
import type { PlatformStatus } from '../shared/types'

interface ProgressBarProps {
    percentage: number
    status: PlatformStatus
}

const barColors: Record<PlatformStatus, string> = {
    ok: 'bg-emerald-600',
    warning: 'bg-amber-500',
    danger: 'bg-rose-600',
    not_login: 'bg-stone-300',
    error: 'bg-rose-300',
}

export function ProgressBar({ percentage, status }: ProgressBarProps) {
    const clamped = Math.min(100, Math.max(0, percentage))
    const color = barColors[status]

    return (
        <div className="w-full">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200/80">
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            <div className="mt-1 flex justify-end">
                <span className="text-[11px] text-stone-500">{clamped}%</span>
            </div>
        </div>
    )
}
