import React, { useEffect, useState } from 'react'
import { usePlatforms } from '../hooks/usePlatforms'
import { PlatformCard } from '../components/PlatformCard'
import { AddPlatformDialog } from '../components/AddPlatformDialog'
import { sendToBackground } from '../shared/messaging'
import { sortPlatformsByBurdenDesc } from '../shared/platformSorting'
import { MAX_REFRESH_INTERVAL_SECONDS, MIN_REFRESH_INTERVAL_SECONDS } from '../shared/constants'

function toMinutes(seconds?: number): number {
    return Math.round((seconds ?? 1800) / 60)
}

function getRefreshSummary(autoRefresh: boolean, refreshInterval: number): string {
    if (!autoRefresh) return '手动刷新'
    return `每 ${Math.round(refreshInterval / 60)} 分钟自动刷新`
}

export default function App() {
    const { platforms, loading, settings } = usePlatforms()
    const [showAddDialog, setShowAddDialog] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [savingSettings, setSavingSettings] = useState(false)
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
    const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(30)
    const [showSettings, setShowSettings] = useState(false)

    useEffect(() => {
        if (!settings) return
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
            <div className="app-shell flex items-center justify-center px-6 py-12">
                <div className="text-sm text-stone-500">正在整理监控面板…</div>
            </div>
        )
    }

    const sortedPlatforms = sortPlatformsByBurdenDesc(platforms)

    return (
        <div className="app-shell">
            <div className="app-content">
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-1">
                        <div>
                            <h1 className="text-[22px] font-semibold tracking-[-0.04em] text-slate-900">平台</h1>
                            <p className="mt-1 text-xs text-stone-500">{platforms.length} 个已启用</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowAddDialog(true)} className="app-button-secondary">
                                添加
                            </button>
                            <button onClick={handleRefreshAll} disabled={refreshing} className="app-icon-button" title="刷新全部">
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
                    </div>

                    {sortedPlatforms.length === 0 ? (
                        <div className="app-panel p-9 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-white">
                                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-slate-700" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5h16M6.5 4v5M17.5 4v5M5.5 10.5h13A1.5 1.5 0 0120 12v6.5A1.5 1.5 0 0118.5 20h-13A1.5 1.5 0 014 18.5V12a1.5 1.5 0 011.5-1.5z" />
                                </svg>
                            </div>
                            <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-slate-900">还没有监控任何平台</h2>
                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">先添加一个平台，面板就会开始显示额度和周期状态。</p>
                            <div className="mt-5">
                                <button onClick={() => setShowAddDialog(true)} className="app-button-primary">
                                    添加第一个平台
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {sortedPlatforms.map((platform) => (
                                <PlatformCard key={platform.id} platform={platform} />
                            ))}
                            <div className="flex justify-center">
                                <button onClick={() => setShowAddDialog(true)} className="app-button-secondary">
                                    继续添加平台
                                </button>
                            </div>
                        </>
                    )}
                </section>

                <section className="mt-6">
                    <div className="border-t border-stone-200 pt-5">
                        <button
                            onClick={() => setShowSettings((value) => !value)}
                            className="app-button-secondary w-full justify-between"
                        >
                            <span>自动刷新设置</span>
                            <span className="text-xs text-stone-500">
                                {showSettings ? '收起' : (settings ? getRefreshSummary(settings.autoRefresh, settings.refreshInterval) : '展开')}
                            </span>
                        </button>

                        {showSettings ? (
                            <div className="app-subtle-panel mt-3 p-4">
                                <div className="flex flex-col gap-4 md:flex-row md:items-end">
                                    <label className="flex-1">
                                        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-stone-500">刷新间隔（分钟）</span>
                                        <input
                                            type="number"
                                            min={MIN_REFRESH_INTERVAL_SECONDS / 60}
                                            max={MAX_REFRESH_INTERVAL_SECONDS / 60}
                                            step={5}
                                            value={refreshIntervalMinutes}
                                            onChange={(event) => setRefreshIntervalMinutes(Number(event.target.value))}
                                            className="app-input"
                                            disabled={!autoRefreshEnabled}
                                        />
                                    </label>

                                    <label className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 md:w-[220px]">
                                        <input
                                            type="checkbox"
                                            checked={autoRefreshEnabled}
                                            onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
                                            className="h-4 w-4 rounded border-stone-300 text-[var(--accent)] focus:ring-0"
                                        />
                                        <div>
                                            <div className="text-sm font-medium text-slate-900">启用自动刷新</div>
                                            <div className="text-xs text-stone-500">保存后立即生效，并执行一次整体刷新</div>
                                        </div>
                                    </label>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-stone-500">
                                        可设置范围：{MIN_REFRESH_INTERVAL_SECONDS / 60} 到 {MAX_REFRESH_INTERVAL_SECONDS / 60} 分钟
                                    </p>
                                    <button onClick={handleSaveRefreshSettings} disabled={savingSettings} className="app-button-primary">
                                        {savingSettings ? '保存中…' : '保存设置'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            {showAddDialog ? (
                <AddPlatformDialog enabledIds={platforms.map((p) => p.id)} onClose={() => setShowAddDialog(false)} />
            ) : null}
        </div>
    )
}
