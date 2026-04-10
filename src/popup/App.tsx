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
    if (seconds < 60) return '刚刚整体刷新'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} 分钟前整体刷新`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前整体刷新`
    return `${Math.floor(hours / 24)} 天前整体刷新`
}

export default function App() {
    const { platforms, loading, settings } = usePlatforms()
    const [refreshing, setRefreshing] = useState(false)
    const totalMonthlyPriceRmb = getTotalMonthlyPriceRmb(platforms)
    const titleSuffix = totalMonthlyPriceRmb > 0 ? ` · ${formatMonthlyPriceRmb(totalMonthlyPriceRmb)}` : ''

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
            <div className="w-[320px] p-4 flex items-center justify-center">
                <span className="text-sm text-gray-400">加载中...</span>
            </div>
        )
    }

    return (
        <div className="w-[320px] bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-3 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                    <h1 className="text-sm font-semibold text-gray-900">AI Monitor{titleSuffix}</h1>
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">{timeAgo(settings?.lastRefreshAllAt)}</p>
                </div>
                <button
                    onClick={handleRefreshAll}
                    disabled={refreshing}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors"
                    title="刷新全部"
                >
                    <svg
                        className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
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

            {/* Platform cards */}
            <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
                {platforms.length === 0 ? (
                    <div className="text-center py-6">
                        <p className="text-xs text-gray-400">打开侧边栏添加平台</p>
                    </div>
                ) : (
                    sortPlatformsByBurdenDesc(platforms).map((platform) => (
                        <PlatformCard key={platform.id} platform={platform} compact />
                    ))
                )}
            </div>

            <div className="border-t border-gray-200 bg-white px-3 py-2">
                <button
                    onClick={handleOpenSidebar}
                    className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                    打开侧边栏
                </button>
            </div>
        </div>
    )
}
