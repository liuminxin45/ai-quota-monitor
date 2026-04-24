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
import { QuotaHistoryChart } from './QuotaHistoryChart'
import { TrendSummary } from './TrendSummary'

interface PlatformCardProps {
    platform: Platform
    compact?: boolean
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
        return platform.lastUpdated ? `需要登录，上次成功于 ${timeAgo(platform.lastUpdated)}` : '需要登录'
    }

    if (platform.status === 'error') {
        return platform.lastUpdated ? `刷新失败，上次成功于 ${timeAgo(platform.lastUpdated)}` : '刷新失败'
    }

    return `更新于 ${timeAgo(platform.lastUpdated)}`
}

function formatShortDate(timestamp: number): string {
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(timestamp)
}

function formatUsedDisplay(used: number, total: number, unit: string): {
    primary: string
    totalSuffix?: string
    unitLabel?: string
} {
    if (unit === '%' && total === 100) {
        return {
            primary: `${used.toLocaleString()}%`,
        }
    }

    return {
        primary: used.toLocaleString(),
        totalSuffix: total > 0 ? `/ ${total.toLocaleString()}` : undefined,
        unitLabel: unit,
    }
}

function getBurdenConfig(score: number): {
    label: string
    meaning: string
    tone: string
    dot: string
} {
    if (score < 25) {
        return {
            label: '空载',
            meaning: '当前消耗极低，这个周期内大概率用不完。',
            tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
            dot: 'bg-stone-400',
        }
    }
    if (score < 45) {
        return {
            label: '很轻',
            meaning: '当前负荷很低，额度非常宽裕。',
            tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
            dot: 'bg-stone-400',
        }
    }
    if (score < 60) {
        return {
            label: '轻松',
            meaning: '按当前节奏使用，基本不会接近上限。',
            tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
            dot: 'bg-stone-400',
        }
    }
    if (score < 80) {
        return {
            label: '平稳',
            meaning: '消耗稳定，额度仍在安全区间内。',
            tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
            dot: 'bg-stone-400',
        }
    }
    if (score < 100) {
        return {
            label: '紧凑',
            meaning: '接近周期上限，但理论上仍能撑到重置。',
            tone: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
            dot: 'bg-stone-400',
        }
    }
    if (score < 125) {
        return {
            label: '偏高',
            meaning: '继续按当前速度使用，较大概率会在重置前耗尽。',
            tone: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
            dot: 'bg-amber-500',
        }
    }
    if (score < 160) {
        return {
            label: '吃紧',
            meaning: '当前负荷明显偏高，建议尽快切换平台。',
            tone: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
            dot: 'bg-orange-500',
        }
    }
    return {
        label: '过载',
        meaning: '按当前速度，这个平台会明显提前耗尽。',
        tone: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
        dot: 'bg-rose-500',
    }
}

function getResetCountdown(platformId: PlatformId, resetTimestamp?: number, resetTime?: string): {
    text: string
    urgency: 'relaxed' | 'normal' | 'soon' | 'imminent'
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
    const remainingFraction = diffMs / cycleMs
    let urgency: 'relaxed' | 'normal' | 'soon' | 'imminent'
    if (remainingFraction > 0.5) urgency = 'relaxed'
    else if (remainingFraction > 0.25) urgency = 'normal'
    else if (remainingFraction > 0.1) urgency = 'soon'
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
    relaxed: {
        line: 'bg-emerald-600',
        text: 'text-emerald-700',
        panel: 'bg-emerald-50/80 border-emerald-100',
    },
    normal: {
        line: 'bg-blue-600',
        text: 'text-blue-700',
        panel: 'bg-blue-50/80 border-blue-100',
    },
    soon: {
        line: 'bg-amber-500',
        text: 'text-amber-700',
        panel: 'bg-amber-50/80 border-amber-100',
    },
    imminent: {
        line: 'bg-rose-600',
        text: 'text-rose-700',
        panel: 'bg-rose-50/80 border-rose-100',
    },
}

function MetaRow({ platform }: { platform: Platform }) {
    const items: string[] = []

    if (hasMonthlyPrice(platform.monthlyPriceRmb)) {
        items.push(`月费 ${formatMonthlyPriceRmb(platform.monthlyPriceRmb)}`)
    }

    if (platform.id === 'github-copilot' && platform.subscriptionStartedAt) {
        items.push('已设置首次订阅时间')
    }

    items.push(getRefreshFootnote(platform))

    return <div className="text-xs text-stone-500">{items.join(' · ')}</div>
}

function ActionIcon({
    title,
    onClick,
    active = false,
    children,
}: {
    title: string
    onClick: () => void
    active?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            onClick={onClick}
            aria-label={title}
            title={title}
            className={`app-icon-button h-9 w-9 rounded-xl ${active ? 'border-stone-300 bg-white text-slate-900' : ''}`}
        >
            {children}
        </button>
    )
}

export function PlatformCard({ platform, compact = false }: PlatformCardProps) {
    const [refreshing, setRefreshing] = useState(false)
    const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
    const [showPriceDialog, setShowPriceDialog] = useState(false)
    const [showRemoveDialog, setShowRemoveDialog] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [detailsExpanded, setDetailsExpanded] = useState(false)

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

    const handleRemove = async () => {
        setRemoving(true)
        try {
            await sendToBackground({ type: 'REMOVE_PLATFORM', platformId: platform.id })
            setShowRemoveDialog(false)
        } finally {
            setRemoving(false)
        }
    }

    const initials = platformInitials[platform.id] ?? platform.name.slice(0, 2)
    const countdown = platform.usage ? getResetCountdown(platform.id, platform.usage.resetTimestamp, platform.usage.resetTime) : null
    const countdownStyle = countdown ? urgencyConfig[countdown.urgency] : null
    const burden = platform.burdenScore !== undefined && platform.status !== 'not_login' && platform.status !== 'error'
        ? getBurdenConfig(platform.burdenScore)
        : null
    const used = platform.usage?.used ?? 0
    const total = platform.usage?.total ?? 0
    const remaining = total > 0 ? Math.max(0, total - used) : null
    const usedDisplay = platform.usage ? formatUsedDisplay(used, total, platform.usage.unit) : null
    const projectedDepletionBeforeReset = !!(
        trendModel?.projectedDepletionTimestamp
        && trendModel.resetTimestamp
        && trendModel.projectedDepletionTimestamp < trendModel.resetTimestamp
    )

    if (compact) {
        return (
            <section className="app-panel-strong overflow-hidden rounded-[24px]">
                <div className="p-3.5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-stone-200 bg-stone-50 text-xs font-semibold text-slate-800">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-slate-900">{platform.name}</div>
                                <div className="mt-0.5 text-[11px] text-stone-500">{getRefreshFootnote(platform)}</div>
                            </div>
                        </div>
                        <div className="shrink-0">
                            {burden ? (
                                <span className={`status-pill ${burden.tone}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${burden.dot}`} />
                                    {burden.label}
                                </span>
                            ) : (
                                <StatusBadge status={platform.status} />
                            )}
                        </div>
                    </div>

                    {platform.status === 'not_login' ? (
                        <div className="mt-3 text-xs text-stone-500">需要登录后才能显示进度。</div>
                    ) : platform.status === 'error' ? (
                        <div className="mt-3 text-xs text-rose-600">{platform.errorMessage ?? '本次刷新失败'}</div>
                    ) : platform.usage ? (
                        <div className="mt-3">
                            <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
                                <span className="font-medium text-stone-600">
                                    已用 {Math.round(platform.usage.percentage)}%
                                </span>
                                {remaining !== null ? (
                                    <span className="text-stone-500">剩余 {Math.max(0, Math.round(100 - platform.usage.percentage))}%</span>
                                ) : null}
                            </div>
                            <ProgressBar percentage={platform.usage.percentage} status={platform.status} />
                        </div>
                    ) : null}
                </div>
            </section>
        )
    }

    return (
        <section className="app-panel-strong overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-stone-200 bg-stone-50 text-sm font-semibold text-slate-800">
                            {initials}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-slate-900">{platform.name}</h3>
                                {burden ? (
                                    <span className={`status-pill ${burden.tone} whitespace-nowrap`} title={burden.meaning}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${burden.dot}`} />
                                        {burden.label}
                                    </span>
                                ) : (
                                    <StatusBadge status={platform.status} />
                                )}
                            </div>
                            <div className="mt-0.5">
                                <MetaRow platform={platform} />
                            </div>
                        </div>
                    </div>

                    {!compact ? (
                        <div className="flex items-center gap-2">
                            <ActionIcon
                                title="设置月费"
                                onClick={() => setShowPriceDialog(true)}
                                active={hasMonthlyPrice(platform.monthlyPriceRmb)}
                            >
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 2.75v14.5M6.5 6.5h4.25a2.25 2.25 0 010 4.5H9.25a2.25 2.25 0 100 4.5h4.25" />
                                </svg>
                            </ActionIcon>

                            {platform.id === 'github-copilot' ? (
                                <ActionIcon
                                    title="设置首次订阅时间"
                                    onClick={() => setShowSubscriptionDialog(true)}
                                    active={!!platform.subscriptionStartedAt}
                                >
                                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2.75v2.5M13.5 2.75v2.5M3.75 6h12.5M5.5 4.5h9a1.75 1.75 0 011.75 1.75v8.25A1.75 1.75 0 0114.5 16.25h-9A1.75 1.75 0 013.75 14.5V6.25A1.75 1.75 0 015.5 4.5z" />
                                    </svg>
                                </ActionIcon>
                            ) : null}

                            <ActionIcon
                                title="删除平台"
                                onClick={() => setShowRemoveDialog(true)}
                            >
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.25 4.75V4A1.25 1.25 0 018.5 2.75h3A1.25 1.25 0 0112.75 4v.75M4.75 4.75h10.5M6.25 7.25l.5 8A1.5 1.5 0 008.25 16.75h3.5a1.5 1.5 0 001.5-1.5l.5-8M8.75 8.75v5M11.25 8.75v5" />
                                </svg>
                            </ActionIcon>
                        </div>
                    ) : null}
                </div>

                {platform.status === 'not_login' ? (
                    <div className="app-subtle-panel mt-4 p-4">
                        <p className="text-sm font-medium text-stone-700">登录后即可读取最新额度和周期信息。</p>
                        <button onClick={handleLogin} className="app-button-primary mt-4 w-full">
                            打开平台并登录
                        </button>
                    </div>
                ) : null}

                {platform.status === 'error' ? (
                    <div className="app-subtle-panel mt-4 p-4">
                        <p className="text-sm font-medium text-rose-700">{platform.errorMessage ?? '这次刷新失败，暂未获取到新数据。'}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button onClick={handleRefresh} disabled={refreshing} className="app-button-primary">
                                {refreshing ? '刷新中…' : '重新刷新'}
                            </button>
                            <button onClick={handleLogin} className="app-button-secondary">
                                打开平台页面
                            </button>
                        </div>
                    </div>
                ) : null}

                {platform.usage ? (
                    <>
                        <div className="mt-3 flex items-end justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[22px] font-semibold tracking-[-0.04em] text-slate-900 whitespace-nowrap">
                                    {usedDisplay?.primary}
                                    {usedDisplay?.totalSuffix ? <span className="ml-2 text-sm font-medium text-stone-400">{usedDisplay.totalSuffix}</span> : null}
                                </div>
                                {usedDisplay?.unitLabel ? <div className="mt-1 text-xs text-stone-500 whitespace-nowrap">{usedDisplay.unitLabel}</div> : null}
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-medium text-stone-600">
                                    {remaining !== null ? `剩余 ${remaining.toLocaleString()}` : `已用 ${Math.round(platform.usage.percentage)}%`}
                                </div>
                                <div className="mt-1 text-xs text-stone-500">
                                    {remaining !== null ? `约剩 ${Math.max(0, Math.round(100 - platform.usage.percentage))}%` : '按平台口径'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-2.5">
                            <ProgressBar percentage={platform.usage.percentage} status={platform.status} />
                        </div>

                        {!compact ? (
                            <div className="mt-3 space-y-2.5">
                                {projectedDepletionBeforeReset && trendModel?.projectedDepletionTimestamp ? (
                                    <div className="flex items-center justify-between rounded-[18px] bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="h-7 w-[3px] shrink-0 rounded-full bg-amber-500" />
                                            <div className="min-w-0">
                                                <div className="font-medium">预计会在重置前用完</div>
                                                <div className="truncate text-[11px] text-amber-700/80">
                                                    预计 {formatShortDate(trendModel.projectedDepletionTimestamp)} 用完
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setDetailsExpanded(true)}
                                            className="shrink-0 font-medium text-amber-800 hover:text-amber-900"
                                        >
                                            查看
                                        </button>
                                    </div>
                                ) : null}

                                <div className="flex items-center justify-between rounded-[18px] bg-stone-50 px-3 py-2 text-xs text-stone-500">
                                    <span>
                                        {countdown ? countdown.text : '查看更多周期与预测信息'}
                                    </span>
                                    <button
                                        onClick={() => setDetailsExpanded((value) => !value)}
                                        className="font-medium text-slate-700 hover:text-slate-900"
                                    >
                                        {detailsExpanded ? '收起' : '更多信息'}
                                    </button>
                                </div>

                                {detailsExpanded && countdown && countdownStyle ? (
                                    <div className={`rounded-[20px] border px-3 py-2.5 ${countdownStyle.panel}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className={`text-sm font-medium ${countdownStyle.text}`}>{countdown.text}</div>
                                                <div className="mt-1 text-xs text-stone-500">当前周期内的重置节奏</div>
                                            </div>
                                            <div className="text-right text-[11px] font-medium text-stone-500">进度 {Math.round(countdown.progress * 100)}%</div>
                                        </div>
                                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/70">
                                            <div
                                                className={`h-full rounded-full ${countdownStyle.line}`}
                                                style={{ width: `${Math.round(countdown.progress * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                {trendModel ? (
                                    <div className="px-1 pt-1">
                                        <TrendSummary model={trendModel} />

                                        {detailsExpanded ? (
                                            <>
                                                <div className="mt-4 rounded-2xl border border-stone-200 bg-white/80 p-3">
                                                    <QuotaHistoryChart model={trendModel} height={84} />
                                                </div>

                                                <div className="mt-4">
                                                    <DepletionTimeline model={trendModel} />
                                                </div>
                                            </>
                                        ) : null}
                                    </div>
                                ) : historyLoading ? (
                                    <div className="px-1 pt-1">
                                        <p className="text-sm text-stone-500">正在整理周期样本</p>
                                        {detailsExpanded ? <p className="mt-1 text-sm leading-6 text-stone-500">再补几次刷新记录后，这里会开始显示这轮周期的趋势和耗尽预测。</p> : null}
                                    </div>
                                ) : (
                                    <div className="px-1 pt-1">
                                        <p className="text-sm text-stone-500">样本还不够稳定</p>
                                        {detailsExpanded ? <p className="mt-1 text-sm leading-6 text-stone-500">继续使用并刷新几次后，我们会开始给出更可靠的周期判断。</p> : null}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </>
                ) : null}

                {!compact ? (
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                        <div className="text-xs text-stone-500">{getRefreshFootnote(platform)}</div>
                        <button onClick={handleRefresh} disabled={refreshing} className="app-button-secondary px-3.5 py-2 text-xs">
                            <svg
                                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
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
                            {refreshing ? '刷新中…' : '刷新'}
                        </button>
                    </div>
                ) : null}
            </div>

            {!compact && showSubscriptionDialog && platform.id === 'github-copilot' ? (
                <CopilotSubscriptionDialog currentValue={platform.subscriptionStartedAt} onClose={() => setShowSubscriptionDialog(false)} />
            ) : null}

            {!compact && showPriceDialog ? (
                <PlatformPriceDialog platform={platform} onClose={() => setShowPriceDialog(false)} />
            ) : null}

            {!compact && showRemoveDialog ? (
                <div className="modal-backdrop">
                    <div className="modal-panel">
                        <p className="app-kicker">Remove</p>
                        <h3 className="mt-2 text-base font-semibold text-slate-900">删除 {platform.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-stone-500">删除后会从面板和托盘中移除，并清空这个平台的历史趋势记录。之后仍可重新添加。</p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button onClick={() => setShowRemoveDialog(false)} disabled={removing} className="app-button-secondary">
                                取消
                            </button>
                            <button onClick={handleRemove} disabled={removing} className="app-button-primary bg-rose-700 hover:bg-rose-800">
                                {removing ? '删除中…' : '删除平台'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    )
}
