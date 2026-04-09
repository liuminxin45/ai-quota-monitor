import React from 'react'
import type { PlatformStatus } from '../shared/types'

const statusConfig: Record<PlatformStatus, { label: string; color: string; bg: string }> = {
    ok: { label: '正常', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    warning: { label: '警告', color: 'text-amber-700', bg: 'bg-amber-100' },
    danger: { label: '危险', color: 'text-red-700', bg: 'bg-red-100' },
    not_login: { label: '未登录', color: 'text-gray-600', bg: 'bg-gray-100' },
    error: { label: '失败', color: 'text-red-700', bg: 'bg-red-100' },
}

interface StatusBadgeProps {
    status: PlatformStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const config = statusConfig[status]
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${status === 'ok'
                        ? 'bg-emerald-500'
                        : status === 'warning'
                            ? 'bg-amber-500'
                            : status === 'danger' || status === 'error'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                    }`}
            />
            {config.label}
        </span>
    )
}
