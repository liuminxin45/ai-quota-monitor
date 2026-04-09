import type { PlatformId, PlatformStatus, UsageData } from '../shared/types'
import { getPlatforms, updatePlatform } from '../shared/storage'
import { STATUS_THRESHOLDS, REFRESH_DELAY_MS, PLATFORM_CONFIGS, CYCLE_DAYS } from '../shared/constants'

// Calculate status from usage percentage
export function calculateStatus(percentage: number): PlatformStatus {
    if (percentage >= STATUS_THRESHOLDS.DANGER) return 'danger'
    if (percentage >= STATUS_THRESHOLDS.WARNING) return 'warning'
    return 'ok'
}

/**
 * Compute burden score = projected usage % at end of reset cycle.
 *
 * Interpretation: < 100 = will stay within quota; > 100 = will run out at this rate.
 *
 * If less than 10% of the cycle has elapsed, the burn rate is too noisy to project —
 * we simply return the current usage % directly (no amplification).
 *
 * Thresholds:  < 60 = 轻松 | 60-100 = 适中 | 100-150 = 偏重 | > 150 = 过载
 */
export function computeBurdenScore(platformId: PlatformId, usage: UsageData): number {
    const cycleDays = CYCLE_DAYS[platformId]
    const now = Date.now()

    let elapsedFraction: number
    if (usage.resetTimestamp) {
        const remainingMs = Math.max(0, usage.resetTimestamp - now)
        const cycleMs = cycleDays * 86_400_000
        elapsedFraction = Math.max(0, Math.min(1, 1 - remainingMs / cycleMs))
    } else {
        // No reset timestamp: use 0 so we fall through to the raw-usage path
        elapsedFraction = 0
    }

    // Too early in the cycle — don't amplify noise; return current usage as-is
    if (elapsedFraction < 0.10) {
        return Math.round(usage.percentage)
    }

    // Projected end-of-cycle usage %= current% ÷ fraction elapsed
    return Math.round(usage.percentage / elapsedFraction)
}

// Sleep helper for sequential refresh delay
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Find tabs that match a platform's usage URL pattern
async function findPlatformTabs(platformId: PlatformId): Promise<chrome.tabs.Tab[]> {
    const urlPatterns: Record<PlatformId, string[]> = {
        'github-copilot': ['https://github.com/settings/copilot*', 'https://github.com/settings/billing*'],
        chatgpt: ['https://chatgpt.com/codex/cloud/settings/usage*'],
        kimi: ['https://www.kimi.com/code/console*'],
    }
    const patterns = urlPatterns[platformId]
    const tabs: chrome.tabs.Tab[] = []
    for (const pattern of patterns) {
        const matched = await chrome.tabs.query({ url: pattern })
        tabs.push(...matched)
    }
    return tabs
}

// Wait for a USAGE_RESULT message from a specific platform's content script
function waitForUsageResult(platformId: PlatformId, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener)
            resolve(false)
        }, timeoutMs)

        function listener(message: { type: string; platformId?: string; success?: boolean }) {
            if (message.type === 'USAGE_RESULT' && message.platformId === platformId) {
                clearTimeout(timer)
                chrome.runtime.onMessage.removeListener(listener)
                // The message handler in messaging.ts will process the data
                resolve(true)
            }
        }

        chrome.runtime.onMessage.addListener(listener)
    })
}

// Open a background tab (non-focused), wait for content script to scrape, then close it
async function scrapeViaBackgroundTab(platformId: PlatformId): Promise<boolean> {
    const config = PLATFORM_CONFIGS[platformId]
    if (!config) return false

    let tab: chrome.tabs.Tab | undefined
    try {
        // Create tab without stealing focus — appears in tab strip but user stays on current tab
        tab = await chrome.tabs.create({
            url: config.usageUrl,
            active: false,
        })

        if (!tab?.id) return false

        const tabId = tab.id

        // Wait for the tab to finish loading
        await new Promise<void>((resolve) => {
            function onUpdated(updatedTabId: number, changeInfo: { status?: string }) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdated)
                    resolve()
                }
            }
            chrome.tabs.onUpdated.addListener(onUpdated)
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(onUpdated)
                resolve()
            }, 15000)
        })

        // Wait for content script auto-scrape result (SPA may need extra time)
        const received = await waitForUsageResult(platformId, 20000)
        return received
    } catch (err) {
        console.error(`[AI Monitor] Background tab scrape failed for ${platformId}:`, err)
        return false
    } finally {
        // Always close the background tab
        if (tab?.id) {
            try { await chrome.tabs.remove(tab.id) } catch { /* already closed */ }
        }
    }
}

// Refresh a single platform by messaging its content script
export async function refreshPlatform(platformId: PlatformId): Promise<void> {
    try {
        const tabs = await findPlatformTabs(platformId)

        if (tabs.length > 0) {
            // Existing tab found — send scrape message directly
            const tab = tabs[0]
            if (!tab.id) return

            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'SCRAPE_USAGE',
                    platformId,
                })

                if (response && response.success && response.usage) {
                    const usage: UsageData = response.usage
                    const status = calculateStatus(usage.percentage)
                    const burdenScore = computeBurdenScore(platformId, usage)
                    await updatePlatform(platformId, {
                        status,
                        usage,
                        lastUpdated: Date.now(),
                        errorMessage: undefined,
                        burdenScore,
                    })
                    return
                }

                // Scrape returned but failed
                const errorMessage = response?.error ?? 'Scrape failed'
                if (errorMessage.includes('login') || errorMessage.includes('auth')) {
                    await updatePlatform(platformId, { status: 'not_login', errorMessage })
                } else {
                    await updatePlatform(platformId, { status: 'error', errorMessage })
                }
                return
            } catch (err) {
                const msg = err instanceof Error ? err.message : ''
                if (!msg.includes('Could not establish connection') && !msg.includes('Receiving end does not exist')) {
                    await updatePlatform(platformId, { status: 'error', errorMessage: msg })
                    return
                }
                // Content script not ready in existing tab — fall through to background tab
            }
        }

        // No existing tab or content script not reachable — open background tab
        console.log(`[AI Monitor] No open tab for ${platformId}, opening background tab...`)
        const success = await scrapeViaBackgroundTab(platformId)

        if (!success) {
            // Background tab didn't produce data
            const platforms = await getPlatforms()
            const platform = platforms.find((p) => p.id === platformId)
            if (platform && platform.lastUpdated === null) {
                await updatePlatform(platformId, { status: 'not_login' })
            }
            // If we have old data, don't overwrite — just log
            console.log(`[AI Monitor] Background scrape for ${platformId} did not return data`)
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await updatePlatform(platformId, { status: 'error', errorMessage: message })
    }
}

// Refresh all enabled platforms sequentially with delay
export async function refreshAllPlatforms(): Promise<void> {
    const platforms = await getPlatforms()
    const enabled = platforms.filter((p) => p.enabled)

    for (let i = 0; i < enabled.length; i++) {
        await refreshPlatform(enabled[i].id)
        // Delay between platforms (skip after last one)
        if (i < enabled.length - 1) {
            await sleep(REFRESH_DELAY_MS)
        }
    }
}
