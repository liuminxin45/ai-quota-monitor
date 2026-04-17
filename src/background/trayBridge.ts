import { getAppState, onStorageChange } from '../shared/storage'
import { TRAY_BRIDGE_ENDPOINT, TRAY_BRIDGE_SYNC_DEBOUNCE_MS } from '../shared/constants'
import type { AppState, Platform, TrayPlatformSnapshot, TrayQuotaUpdatePayload } from '../shared/types'

let syncTimer: ReturnType<typeof setTimeout> | undefined

function toTrayPlatformSnapshot(platform: Platform): TrayPlatformSnapshot {
    const usedPercentage = platform.usage?.percentage ?? null
    return {
        id: platform.id,
        name: platform.name,
        enabled: platform.enabled,
        status: platform.status,
        remainingPercentage: usedPercentage === null ? null : Math.max(0, 100 - usedPercentage),
        usedPercentage,
        lastUpdated: platform.lastUpdated,
        errorMessage: platform.errorMessage,
    }
}

function toTrayPayload(state: AppState): TrayQuotaUpdatePayload {
    return {
        platforms: state.platforms.map(toTrayPlatformSnapshot),
        generatedAt: Date.now(),
    }
}

async function postTrayPayload(payload: TrayQuotaUpdatePayload): Promise<void> {
    const response = await fetch(TRAY_BRIDGE_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        throw new Error(`Tray bridge responded with ${response.status}`)
    }
}

export async function syncTrayState(): Promise<void> {
    try {
        const state = await getAppState()
        await postTrayPayload(toTrayPayload(state))
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.warn('[AI Monitor] Failed to sync tray state:', message)
    }
}

export function scheduleTraySync(): void {
    if (syncTimer !== undefined) {
        clearTimeout(syncTimer)
    }

    syncTimer = globalThis.setTimeout(() => {
        syncTimer = undefined
        void syncTrayState()
    }, TRAY_BRIDGE_SYNC_DEBOUNCE_MS)
}

export function setupTrayBridge(): () => void {
    const unsubscribe = onStorageChange((changes) => {
        if (changes.platforms) {
            scheduleTraySync()
        }
    })

    void syncTrayState()
    return unsubscribe
}
