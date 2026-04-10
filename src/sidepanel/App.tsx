import React, { useMemo, useState } from 'react'
import { usePlatforms } from '../hooks/usePlatforms'
import { PlatformCard } from '../components/PlatformCard'
import { AddPlatformDialog } from '../components/AddPlatformDialog'
import { sendToBackground } from '../shared/messaging'
import { sortPlatformsByBurdenDesc } from '../shared/platformSorting'
import { formatMonthlyPriceRmb, getTotalMonthlyPriceRmb } from '../shared/pricing'

export default function App() {
    const { platforms, loading, settings } = usePlatforms()
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const totalMonthlyPriceRmb = useMemo(() => getTotalMonthlyPriceRmb(platforms), [platforms])
    const titleSuffix = totalMonthlyPriceRmb > 0 ? ` · ${formatMonthlyPriceRmb(totalMonthlyPriceRmb)}` : ''

    const handleRefreshAll = async () => {
        setRefreshing(true)
        try {
            await sendToBackground({ type: 'REFRESH_ALL' })
        } finally {
            setTimeout(() => setRefreshing(false), 2000)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-sm text-gray-400">加载中...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-gray-50">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-base font-semibold text-gray-900">AI Monitor{titleSuffix}</h1>
                        <p className="text-xs text-gray-400">AI 工具用量监控</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefreshAll}
                            disabled={refreshing}
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 transition-colors"
                            title="刷新全部"
                        >
                            <svg
                                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
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
                </div>
            </div>

            {/* Platform list */}
            <div className="p-4 space-y-3">
                {platforms.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-4xl mb-3">📊</div>
                        <p className="text-sm text-gray-500 mb-1">还没有监控任何平台</p>
                        <p className="text-xs text-gray-400 mb-4">添加 AI 平台，开始追踪你的用量</p>
                        <button
                            onClick={() => setShowAddDialog(true)}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                        >
                            添加平台
                        </button>
                    </div>
                ) : (
                    <>
                        {sortPlatformsByBurdenDesc(platforms).map((platform) => (
                            <PlatformCard key={platform.id} platform={platform} />
                        ))}
                    </>
                )}
            </div>

            {/* Add platform button (when platforms exist) */}
            {platforms.length > 0 && (
                <div className="px-4 pb-4">
                    <button
                        onClick={() => setShowAddDialog(true)}
                        className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-400 text-sm rounded-lg hover:border-gray-400 hover:text-gray-500 transition-colors"
                    >
                        + 添加平台
                    </button>
                </div>
            )}

            {/* Auto-refresh indicator */}
            {settings?.autoRefresh && (
                <div className="px-4 pb-4 text-center">
                    <span className="text-xs text-gray-400">
                        自动刷新：每 {Math.round((settings.refreshInterval ?? 1800) / 60)} 分钟
                    </span>
                </div>
            )}

            {/* Add platform dialog */}
            {showAddDialog && (
                <AddPlatformDialog
                    enabledIds={platforms.map((p) => p.id)}
                    onClose={() => setShowAddDialog(false)}
                />
            )}
        </div>
    )
}
