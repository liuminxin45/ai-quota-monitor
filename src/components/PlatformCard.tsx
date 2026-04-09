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
// Score = projected end-of-cycle usage %; < 100 = within quota, > 100 = will run out
function getBurdenConfig(score: number): { label: string; color: string; bg: string; dot: string } {
    if (score < 60) return { label: '轻松', color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' }
    if (score < 100) return { label: '适中', color: 'text-blue-700', bg: 'bg-blue-100', dot: 'bg-blue-500' }
    if (score < 150) return { label: '偏重', color: 'text-amber-700', bg: 'bg-amber-100', dot: 'bg-amber-500' }
    return { label: '过载', color: 'text-red-700', bg: 'bg-red-100', dot: 'bg-red-500' }
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                        </span>
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
