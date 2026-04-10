import { useEffect, useState, useCallback } from 'react'
import { getUsageHistory, getUsageHistoryStorageKey, onStorageChange } from '../shared/storage'
import type { PlatformId, UsageSnapshot } from '../shared/types'

export function usePlatformHistory(platformId: PlatformId, enabled = true) {
    const [history, setHistory] = useState<UsageSnapshot[]>([])
    const [loading, setLoading] = useState(enabled)

    const loadHistory = useCallback(async () => {
        if (!enabled) {
            setHistory([])
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            setHistory(await getUsageHistory(platformId))
        } catch (error) {
            console.error('[AI Monitor] Failed to load usage history:', error)
        } finally {
            setLoading(false)
        }
    }, [enabled, platformId])

    useEffect(() => {
        void loadHistory()

        if (!enabled) {
            return
        }

        const key = getUsageHistoryStorageKey(platformId)
        return onStorageChange((changes) => {
            if (changes[key]) {
                setHistory((changes[key].newValue as UsageSnapshot[]) ?? [])
            }
        })
    }, [enabled, loadHistory, platformId])

    return { history, loading, reload: loadHistory }
}