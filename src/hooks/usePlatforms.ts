import { useState, useEffect, useCallback } from 'react'
import type { Platform, GlobalSettings, AppState } from '../shared/types'
import { getPlatforms, getSettings, onStorageChange } from '../shared/storage'

export function usePlatforms() {
    const [platforms, setPlatforms] = useState<Platform[]>([])
    const [settings, setSettings] = useState<GlobalSettings | null>(null)
    const [loading, setLoading] = useState(true)

    const loadState = useCallback(async () => {
        try {
            const [p, s] = await Promise.all([getPlatforms(), getSettings()])
            setPlatforms(p)
            setSettings(s)
        } catch (err) {
            console.error('[AI Monitor] Failed to load state:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadState()

        const unsubscribe = onStorageChange((changes) => {
            if (changes.platforms) {
                setPlatforms((changes.platforms.newValue as Platform[]) ?? [])
            }
            if (changes.settings) {
                setSettings(changes.settings.newValue as GlobalSettings)
            }
        })

        return unsubscribe
    }, [loadState])

    // Only show enabled platforms
    const enabledPlatforms = platforms.filter((p) => p.enabled)
    const disabledPlatforms = platforms.filter((p) => !p.enabled)

    return {
        platforms: enabledPlatforms,
        allPlatforms: platforms,
        disabledPlatforms,
        settings,
        loading,
        reload: loadState,
    }
}
