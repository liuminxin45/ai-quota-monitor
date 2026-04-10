import React, { useState } from 'react'
import type { Platform, PlatformId } from '../shared/types'
import { StatusBadge } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { sendToBackground } from '../shared/messaging'
import { getCycleDurationMs } from '../shared/cycle'
import { usePlatformHistory } from '../hooks/usePlatformHistory'
import { buildQuotaTrendModel } from '../shared/quotaHistory'
import { DepletionTimeline } from './DepletionTimeline'
import { CopilotSubscriptionDialog } from './CopilotSubscriptionDialog'
import { PlatformPriceDialog } from './PlatformPriceDialog'
import { formatMonthlyPriceRmb, hasMonthlyPrice } from '../shared/pricing'

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

function getRefreshFootnote(platform: Platform): string {
    if (platform.status === 'not_login') {
        return platform.lastUpdated ? `需要登录，上次成功于${timeAgo(platform.lastUpdated)}` : '需要登录'
    }

    if (platform.status === 'error') {
        return platform.lastUpdated ? `刷新失败，上次成功于${timeAgo(platform.lastUpdated)}` : '刷新失败'
    }

    return timeAgo(platform.lastUpdated)
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
function getResetCountdown(platformId: PlatformId, resetTimestamp?: number, resetTime?: string): {
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

    const cycleMs = getCycleDurationMs(platformId, resetTimestamp)
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
    relaxed: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400', dot: 'bg-emerald-500' },
    normal: { bg: 'bg-blue-50', text: 'text-blue-600', bar: 'bg-blue-400', dot: 'bg-blue-500' },
    soon: { bg: 'bg-amber-50', text: 'text-amber-600', bar: 'bg-amber-400', dot: 'bg-amber-500' },
    imminent: { bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-400', dot: 'bg-red-500' },
}

export function PlatformCard({ platform, compact = false }: PlatformCardProps) {
    const [refreshing, setRefreshing] = useState(false)
    const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
    const [showPriceDialog, setShowPriceDialog] = useState(false)
    const historyEnabled = !compact && platform.status !== 'not_login' && platform.status !== 'error' && !!platform.usage
    const { history: usageHistory, loading: historyLoading } = usePlatformHistory(platform.id, historyEnabled)
    const trendModel = historyEnabled
        ? buildQuotaTrendModel(
            platform.id,
            usageHistory,
            platform.usage,
            platform.lastUpdated,
            platform.burdenScore,
            platform.subscriptionStartedAt
        )
        : null

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
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <div className="text-sm font-medium text-gray-900">{platform.name}</div>
                            {hasMonthlyPrice(platform.monthlyPriceRmb) ? (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
                                    {formatMonthlyPriceRmb(platform.monthlyPriceRmb)}
                                </span>
                            ) : null}
                            {!compact ? (
                                <button
                                    onClick={() => setShowPriceDialog(true)}
                                    aria-label={`设置 ${platform.name} 月费`}
                                    title="设置月费"
                                    className={`rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 ${hasMonthlyPrice(platform.monthlyPriceRmb) ? 'text-amber-600 hover:text-amber-700' : ''}`}
                                >
                                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 2.75v14.5M6.5 6.5h4.25a2.25 2.25 0 010 4.5H9.25a2.25 2.25 0 100 4.5h4.25" />
                                    </svg>
                                </button>
                            ) : null}
                            {!compact && platform.id === 'github-copilot' ? (
                                <button
                                    onClick={() => setShowSubscriptionDialog(true)}
                                    aria-label="设置 Copilot 首次订阅时间"
                                    title="设置首次订阅时间"
                                    className={`rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 ${platform.subscriptionStartedAt ? 'text-sky-600 hover:text-sky-700' : ''}`}
                                >
                                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2.75v2.5M13.5 2.75v2.5M3.75 6h12.5M5.5 4.5h9a1.75 1.75 0 011.75 1.75v8.25A1.75 1.75 0 0114.5 16.25h-9A1.75 1.75 0 013.75 14.5V6.25A1.75 1.75 0 015.5 4.5z" />
                                    </svg>
                                </button>
                            ) : null}
                        </div>
                        {!compact && platform.id === 'github-copilot' && platform.subscriptionStartedAt ? (
                            <div className="text-[11px] text-sky-600">已设置首次订阅时间</div>
                        ) : null}
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
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/70 ${cfg.dot}`} />
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
                    {!compact && trendModel ? (
                        <div className="mt-2 rounded-lg border border-gray-100 bg-gradient-to-b from-slate-50 via-white to-white p-2.5">
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                                    耗尽预测
                                </p>
                                <span className="text-[11px] text-gray-400">按当前周期平均消耗估算</span>
                            </div>
                            <DepletionTimeline model={trendModel} />
                        </div>
                    ) : null}
                    {!compact && historyLoading ? (
                        <div className="mt-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="text-xs text-gray-500">正在整理这轮周期的历史记录与预测依据...</p>
                        </div>
                    ) : null}
                    {!compact && !trendModel && !historyLoading ? (
                        <div className="mt-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="text-xs text-gray-500">再刷新几次后，这里会开始显示这轮周期的耗尽跑道。</p>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Footer */}
            {!compact && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{getRefreshFootnote(platform)}</span>
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

            {!compact && showSubscriptionDialog && platform.id === 'github-copilot' ? (
                <CopilotSubscriptionDialog
                    currentValue={platform.subscriptionStartedAt}
                    onClose={() => setShowSubscriptionDialog(false)}
                />
            ) : null}

            {!compact && showPriceDialog ? (
                <PlatformPriceDialog
                    platform={platform}
                    onClose={() => setShowPriceDialog(false)}
                />
            ) : null}
        </div>
    )
}
