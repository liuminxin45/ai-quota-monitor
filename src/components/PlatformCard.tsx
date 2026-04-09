import React, { useState } from 'react'
import type { Platform } from '../shared/types'
import { StatusBadge } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { sendToBackground } from '../shared/messaging'
import { CYCLE_DAYS } from '../shared/constants'

interface PlatformCardProps {
    platform: Platform
    compact?: boolean
}

// Platform logo/icon colors
const platformColors: Record<string, string> = {
    'github-copilot': 'bg-gray-900',
    chatgpt: 'bg-green-600',
    kimi: 'bg-blue-600',
}

const platformInitials: Record<string, string> = {
    'github-copilot': 'GH',
    chatgpt: 'GP',
    kimi: 'Ki',
}

function timeAgo(timestamp: number | null): string {
    if (!timestamp) return '从未更新'
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return '刚刚'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} 分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前`
    return `${Math.floor(hours / 24)} 天前`
}

// Burden score → display config
// Score = projected end-of-cycle usage %; < 100 = likely within quota, > 100 = likely to run out
function getBurdenConfig(score: number): {
    label: string
    meaning: string
    color: string
    bg: string
    dot: string
} {
    if (score < 25) {
        return {
            label: '空载',
            meaning: '当前消耗极低，这个周期内大概率用不完，最适合优先使用。',
            color: 'text-emerald-800',
            bg: 'bg-emerald-100',
            dot: 'bg-emerald-600',
        }
    }
    if (score < 45) {
        return {
            label: '很轻',
            meaning: '当前负荷很低，额度非常宽裕，优先使用风险很小。',
            color: 'text-lime-800',
            bg: 'bg-lime-100',
            dot: 'bg-lime-600',
        }
    }
    if (score < 60) {
        return {
            label: '轻松',
            meaning: '整体仍然宽裕，按当前速度使用基本不会接近上限。',
            color: 'text-green-800',
            bg: 'bg-green-100',
            dot: 'bg-green-600',
        }
    }
    if (score < 80) {
        return {
            label: '平稳',
            meaning: '消耗节奏较稳定，额度仍在安全区间内。',
            color: 'text-cyan-800',
            bg: 'bg-cyan-100',
            dot: 'bg-cyan-600',
        }
    }
    if (score < 100) {
        return {
            label: '紧凑',
            meaning: '接近周期上限，但按当前速度理论上仍能勉强撑到重置。',
            color: 'text-sky-800',
            bg: 'bg-sky-100',
            dot: 'bg-sky-600',
        }
    }
    if (score < 125) {
        return {
            label: '偏高',
            meaning: '如果继续按当前速度使用，较大概率会在重置前耗尽。',
            color: 'text-amber-800',
            bg: 'bg-amber-100',
            dot: 'bg-amber-600',
        }
    }
    if (score < 160) {
        return {
            label: '吃紧',
            meaning: '当前负荷明显偏高，应该尽快切换到额度更宽裕的平台。',
            color: 'text-orange-800',
            bg: 'bg-orange-100',
            dot: 'bg-orange-600',
        }
    }
    return {
        label: '过载',
        meaning: '按当前消耗速度，这个平台会明显提前耗尽，不建议继续优先使用。',
        color: 'text-red-800',
        bg: 'bg-red-100',
        dot: 'bg-red-600',
    }
}

// Compute countdown info — cycle-aware so progress bar fills over the correct period
function getResetCountdown(platformId: string, resetTimestamp?: number, resetTime?: string): {
    text: string
    urgency: 'relaxed' | 'normal' | 'soon' | 'imminent'
    /** 0–1: fraction of cycle elapsed (0 = just reset, 1 = about to reset) */
    progress: number
} | null {
    if (!resetTimestamp) {
        if (resetTime) return { text: resetTime, urgency: 'normal', progress: 0.5 }
        return null
    }
    const now = Date.now()
    const diffMs = resetTimestamp - now
    if (diffMs <= 0) return { text: '即将重置', urgency: 'imminent', progress: 1 }

    const cycleDays = CYCLE_DAYS[platformId as keyof typeof CYCLE_DAYS] ?? 7
    const cycleMs = cycleDays * 86_400_000
    const elapsedMs = cycleMs - diffMs
    const progress = Math.min(1, Math.max(0, elapsedMs / cycleMs))

    // Urgency based on % of cycle remaining
    const remainingFraction = diffMs / cycleMs
    let urgency: 'relaxed' | 'normal' | 'soon' | 'imminent'
    if (remainingFraction > 0.5) urgency = 'relaxed'
    else if (remainingFraction > 0.25) urgency = 'normal'
    else if (remainingFraction > 0.10) urgency = 'soon'
    else urgency = 'imminent'

    const totalHours = diffMs / 3_600_000
    const days = Math.floor(totalHours / 24)
    const hours = Math.floor(totalHours % 24)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)

    let text: string
    if (days > 0) text = `${days}天 ${hours}小时后重置`
    else if (hours > 0) text = `${hours}小时 ${minutes}分钟后重置`
    else text = `${minutes}分钟后重置`

    return { text, urgency, progress }
}

const urgencyConfig = {
    relaxed: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400', icon: '🟢' },
    normal: { bg: 'bg-blue-50', text: 'text-blue-600', bar: 'bg-blue-400', icon: '🔵' },
    soon: { bg: 'bg-amber-50', text: 'text-amber-600', bar: 'bg-amber-400', icon: '🟡' },
    imminent: { bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-400', icon: '🔴' },
}

export function PlatformCard({ platform, compact = false }: PlatformCardProps) {
    const [refreshing, setRefreshing] = useState(false)

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await sendToBackground({ type: 'REFRESH_ONE', platformId: platform.id })
        } finally {
            setTimeout(() => setRefreshing(false), 1000)
        }
    }

    const handleLogin = async () => {
        await sendToBackground({ type: 'OPEN_LOGIN', platformId: platform.id })
    }

    const bgColor = platformColors[platform.id] ?? 'bg-gray-600'
    const initials = platformInitials[platform.id] ?? platform.name.slice(0, 2)

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div
                        className={`w-8 h-8 rounded-md ${bgColor} text-white flex items-center justify-center text-xs font-bold`}
                    >
                        {initials}
                    </div>
                    <div>
                        <div className="text-sm font-medium text-gray-900">{platform.name}</div>
                    </div>
                </div>
                {/* Burden badge when we have data; fall back to status badge for errors/not-login */}
                {platform.burdenScore !== undefined && platform.status !== 'not_login' && platform.status !== 'error' ? (() => {
                    const cfg = getBurdenConfig(platform.burdenScore)
                    return (
                        <div className="relative group">
                            <span
                                className={`inline-flex cursor-default items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                            </span>
                            <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-56 rounded-md bg-gray-900 px-2 py-1.5 text-[11px] leading-4 text-white shadow-lg group-hover:block">
                                <span className="font-medium text-gray-200">含义：</span>
                                {cfg.meaning}
                            </div>
                        </div>
                    )
                })() : <StatusBadge status={platform.status} />}
            </div>

            {/* Usage info */}
            {platform.status === 'not_login' ? (
                <div className="mt-2">
                    <button
                        onClick={handleLogin}
                        className="w-full text-center py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                    >
                        点击去登录 →
                    </button>
                </div>
            ) : platform.status === 'error' ? (
                <div className="mt-2">
                    <p className="text-xs text-red-500 mb-1">{platform.errorMessage ?? '数据获取失败'}</p>
                    <button
                        onClick={handleLogin}
                        className="text-xs text-blue-600 hover:text-blue-700"
                    >
                        打开平台页面
                    </button>
                </div>
            ) : platform.usage ? (
                <div className="mt-1">
                    <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm text-gray-700">
                            <span className="font-semibold">{platform.usage.used.toLocaleString()}</span>
                            {platform.usage.total > 0 && (
                                <span className="text-gray-400">
                                    {' '}
                                    / {platform.usage.total.toLocaleString()}
                                </span>
                            )}
                            <span className="text-xs text-gray-400 ml-1">{platform.usage.unit}</span>
                        </span>
                    </div>
                    {platform.usage.total > 0 && (
                        <ProgressBar percentage={platform.usage.percentage} status={platform.status} />
                    )}
                    {(() => {
                        const countdown = getResetCountdown(platform.id, platform.usage.resetTimestamp, platform.usage.resetTime)
                        if (!countdown) return null
                        const cfg = urgencyConfig[countdown.urgency]
                        return (
                            <div className={`flex items-center gap-2 mt-1.5 px-2 py-1 rounded-md ${cfg.bg}`}>
                                <span className="text-xs leading-none">{cfg.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-medium ${cfg.text}`}>{countdown.text}</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/60 rounded-full mt-0.5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                                            style={{ width: `${Math.round(countdown.progress * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            ) : null}

            {/* Footer */}
            {!compact && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{timeAgo(platform.lastUpdated)}</span>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 flex items-center gap-1"
                    >
                        <svg
                            className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        刷新
                    </button>
                </div>
            )}
        </div>
    )
}
