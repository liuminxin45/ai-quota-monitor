import React, { useState } from 'react'
import { usePlatforms } from '../hooks/usePlatforms'
import { PlatformCard } from '../components/PlatformCard'
import { sendToBackground } from '../shared/messaging'
import { sortPlatformsByBurdenDesc } from '../shared/platformSorting'
import { formatMonthlyPriceRmb, getTotalMonthlyPriceRmb } from '../shared/pricing'

function timeAgo(timestamp?: number): string {
    if (!timestamp) return '尚未整体刷新'
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return '刚刚刷新'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} 分钟前刷新`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前刷新`
    return `${Math.floor(hours / 24)} 天前刷新`
}

function getAttentionCount(platforms: ReturnType<typeof usePlatforms>['platforms']): number {
    return platforms.filter((platform) => {
        if (platform.status === 'warning' || platform.status === 'danger' || platform.status === 'not_login' || platform.status === 'error') {
            return true
        }
        return (platform.burdenScore ?? 0) >= 100
    }).length
}

export default function App() {
    const { platforms, loading, settings } = usePlatforms()
    const [refreshing, setRefreshing] = useState(false)
    const totalMonthlyPriceRmb = getTotalMonthlyPriceRmb(platforms)

    const handleRefreshAll = async () => {
        setRefreshing(true)
        try {
            await sendToBackground({ type: 'REFRESH_ALL' })
        } finally {
            setTimeout(() => setRefreshing(false), 2000)
        }
    }

    const handleOpenSidebar = async () => {
        try {
            await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
            window.close()
        } catch (error) {
            console.error('[AI Monitor] Failed to open side panel:', error)
        }
    }

    if (loading) {
        return (
            <div className="flex w-[340px] items-center justify-center px-4 py-8">
                <span className="text-sm text-stone-500">正在整理监控面板…</span>
            </div>
        )
    }

    const sortedPlatforms = sortPlatformsByBurdenDesc(platforms)
    const attentionCount = getAttentionCount(platforms)

    return (
        <div className="w-[340px] p-3">
            <div className="app-panel-strong overflow-hidden">
                <div className="border-b border-stone-200 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="app-kicker">Quick View</p>
                            <h1 className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-slate-900">AI Monitor</h1>
                            <p className="mt-1 text-xs text-stone-500">{timeAgo(settings?.lastRefreshAllAt)}</p>
                        </div>
                        <button
                            onClick={handleRefreshAll}
                            disabled={refreshing}
                            className="app-icon-button"
                            title="刷新全部"
                        >
                            <svg
                                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
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
                        </button>
                    </div>

                    <div className="mt-4 rounded-[20px] bg-stone-50 px-3.5 py-2.5 text-xs text-stone-600">
                        {platforms.length} 个平台 · {attentionCount} 个需关注 · {totalMonthlyPriceRmb > 0 ? `${formatMonthlyPriceRmb(totalMonthlyPriceRmb)} / 月` : '未设置月费'}
                    </div>
                </div>

                <div className="max-h-[420px] space-y-2.5 overflow-y-auto px-3 py-3">
                    {sortedPlatforms.length === 0 ? (
                        <div className="app-subtle-panel p-4 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white">
                                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-slate-700" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5h16M6.5 4v5M17.5 4v5M5.5 10.5h13A1.5 1.5 0 0120 12v6.5A1.5 1.5 0 0118.5 20h-13A1.5 1.5 0 014 18.5V12a1.5 1.5 0 011.5-1.5z" />
                                </svg>
                            </div>
                            <p className="mt-3 text-sm font-medium text-slate-900">还没有启用任何平台</p>
                            <p className="mt-1 text-xs leading-5 text-stone-500">打开完整面板后添加平台，就能开始追踪额度变化。</p>
                        </div>
                    ) : (
                        sortedPlatforms.map((platform) => (
                            <PlatformCard key={platform.id} platform={platform} compact />
                        ))
                    )}
                </div>

                <div className="border-t border-stone-200 p-3">
                    <button onClick={handleOpenSidebar} className="app-button-primary w-full">
                        打开完整面板
                    </button>
                </div>
            </div>
        </div>
    )
}
