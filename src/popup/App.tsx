import React, { useState } from 'react'
import { usePlatforms } from '../hooks/usePlatforms'
import { PlatformCard } from '../components/PlatformCard'
import { sendToBackground } from '../shared/messaging'

export default function App() {
    const { platforms, loading } = usePlatforms()
    const [refreshing, setRefreshing] = useState(false)

    const handleRefreshAll = async () => {
        setRefreshing(true)
        try {
            await sendToBackground({ type: 'REFRESH_ALL' })
        } finally {
            setTimeout(() => setRefreshing(false), 2000)
        }
    }

    const handleOpenSidebar = () => {
        // Open side panel via background message
        chrome.runtime.sendMessage({ type: 'GET_STATE' })
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
                <div>
                    <h1 className="text-sm font-semibold text-gray-900">AI Monitor</h1>
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
                    platforms.map((platform) => (
                        <PlatformCard key={platform.id} platform={platform} compact />
                    ))
                )}
            </div>
        </div>
    )
}
