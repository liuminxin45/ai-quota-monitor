import type { AppMessage, PlatformId } from '../shared/types'
import { onMessage } from '../shared/messaging'
import { appendUsageSnapshot, getAppState, getPlatforms, setPlatforms, updatePlatform } from '../shared/storage'
import { createDefaultPlatform, PLATFORM_CONFIGS } from '../shared/constants'
import { refreshAllPlatforms, refreshPlatform, calculateStatus } from './platformManager'
import { computeBurdenScore } from '../shared/burden'

export function setupMessageListener(): void {
    onMessage((message: AppMessage, _sender, sendResponse) => {
        handleMessage(message)
            .then(sendResponse)
            .catch((err) => {
                console.error('[AI Monitor] Message handler error:', err)
                sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' })
            })
        return true // keep channel open for async response
    })
}

async function handleMessage(message: AppMessage): Promise<unknown> {
    switch (message.type) {
        case 'GET_STATE':
            return getAppState()

        case 'REFRESH_ALL':
            await refreshAllPlatforms()
            return { success: true }

        case 'REFRESH_ONE':
            await refreshPlatform(message.platformId)
            return { success: true }

        case 'OPEN_LOGIN': {
            const config = PLATFORM_CONFIGS[message.platformId]
            if (config) {
                await chrome.tabs.create({ url: config.usageUrl })
            }
            return { success: true }
        }

        case 'ADD_PLATFORM': {
            const platforms = await getPlatforms()
            const exists = platforms.find((p) => p.id === message.platformId)
            if (!exists) {
                const newPlatform = createDefaultPlatform(message.platformId)
                newPlatform.enabled = true
                platforms.push(newPlatform)
                await setPlatforms(platforms)
            } else if (!exists.enabled) {
                await updatePlatform(message.platformId, { enabled: true })
            }
            return { success: true }
        }

        case 'REMOVE_PLATFORM': {
            await updatePlatform(message.platformId, { enabled: false })
            return { success: true }
        }

        case 'USAGE_RESULT': {
            // Content script reporting usage data
            if (message.success && message.usage) {
                const status = calculateStatus(message.usage.percentage)
                const platforms = await getPlatforms()
                const currentPlatform = platforms.find((platform) => platform.id === message.platformId)
                const burdenScore = computeBurdenScore(
                    message.platformId,
                    message.usage,
                    currentPlatform?.subscriptionStartedAt
                )
                const capturedAt = Date.now()
                await updatePlatform(message.platformId, {
                    status,
                    usage: message.usage,
                    lastUpdated: capturedAt,
                    errorMessage: undefined,
                    burdenScore,
                })
                await appendUsageSnapshot(message.platformId, message.usage, burdenScore, capturedAt)
            } else {
                await updatePlatform(message.platformId, {
                    status: message.error?.includes('login') ? 'not_login' : 'error',
                    errorMessage: message.error,
                })
            }
            return { success: true }
        }

        default:
            return { error: 'Unknown message type' }
    }
}
