import React, { useEffect, useMemo, useState } from 'react'
import { usePlatforms } from '../hooks/usePlatforms'
import { PlatformCard } from '../components/PlatformCard'
import { AddPlatformDialog } from '../components/AddPlatformDialog'
import { sendToBackground } from '../shared/messaging'
import { sortPlatformsByBurdenDesc } from '../shared/platformSorting'
import { formatMonthlyPriceRmb, getTotalMonthlyPriceRmb } from '../shared/pricing'
import { MAX_REFRESH_INTERVAL_SECONDS, MIN_REFRESH_INTERVAL_SECONDS } from '../shared/constants'

function toMinutes(seconds?: number): number {
    return Math.round((seconds ?? 1800) / 60)
}

export default function App() {
    const { platforms, loading, settings } = usePlatforms()
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [savingSettings, setSavingSettings] = useState(false)
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
    const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(30)
    const totalMonthlyPriceRmb = useMemo(() => getTotalMonthlyPriceRmb(platforms), [platforms])
    const titleSuffix = totalMonthlyPriceRmb > 0 ? ` · ${formatMonthlyPriceRmb(totalMonthlyPriceRmb)}` : ''

    useEffect(() => {
        if (!settings) {
            return
        }
        setAutoRefreshEnabled(settings.autoRefresh)
        setRefreshIntervalMinutes(toMinutes(settings.refreshInterval))
    }, [settings])

    const handleRefreshAll = async () => {
        setRefreshing(true)
        try {
            await sendToBackground({ type: 'REFRESH_ALL' })
        } finally {
            setTimeout(() => setRefreshing(false), 2000)
        }
    }

    const handleSaveRefreshSettings = async () => {
        setSavingSettings(true)
        setRefreshing(true)
        try {
            const boundedMinutes = Math.min(
                Math.max(Number.isFinite(refreshIntervalMinutes) ? refreshIntervalMinutes : 30, MIN_REFRESH_INTERVAL_SECONDS / 60),
                MAX_REFRESH_INTERVAL_SECONDS / 60
            )
            setRefreshIntervalMinutes(boundedMinutes)

            await sendToBackground({
                type: 'UPDATE_SETTINGS',
                settings: {
                    autoRefresh: autoRefreshEnabled,
                    refreshInterval: boundedMinutes * 60,
                },
                refreshNow: true,
            })
        } finally {
            setSavingSettings(false)
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

            <div className="mx-4 mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">自动刷新设置</h2>
                        <p className="mt-1 text-xs text-gray-500">确认后立即生效，并马上执行一次整体刷新。</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input
                            type="checkbox"
                            checked={autoRefreshEnabled}
                            onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        启用
                    </label>
                </div>

                <div className="mt-4 flex items-end gap-3">
                    <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-xs font-medium text-gray-500">刷新间隔（分钟）</span>
                        <input
                            type="number"
                            min={MIN_REFRESH_INTERVAL_SECONDS / 60}
                            max={MAX_REFRESH_INTERVAL_SECONDS / 60}
                            step={5}
                            value={refreshIntervalMinutes}
                            onChange={(event) => setRefreshIntervalMinutes(Number(event.target.value))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                            disabled={!autoRefreshEnabled}
                        />
                    </label>
                    <button
                        onClick={handleSaveRefreshSettings}
                        disabled={savingSettings}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                        {savingSettings ? '保存中...' : '确认'}
                    </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                    可设置范围：{MIN_REFRESH_INTERVAL_SECONDS / 60} 到 {MAX_REFRESH_INTERVAL_SECONDS / 60} 分钟
                </p>
            </div>

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
