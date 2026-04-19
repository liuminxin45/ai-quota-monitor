import React from 'react'
import type { PlatformStatus } from '../shared/types'

const statusConfig: Record<PlatformStatus, { label: string; tone: string; dot: string }> = {
    ok: { label: '正常', tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200', dot: 'bg-stone-400' },
    warning: { label: '警告', tone: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
    danger: { label: '危险', tone: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', dot: 'bg-rose-500' },
    not_login: { label: '未登录', tone: 'bg-stone-100 text-stone-600 ring-1 ring-stone-200', dot: 'bg-stone-400' },
    error: { label: '失败', tone: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', dot: 'bg-rose-500' },
}

interface StatusBadgeProps {
    status: PlatformStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const config = statusConfig[status]
    return (
        <span className={`status-pill ${config.tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    )
}
