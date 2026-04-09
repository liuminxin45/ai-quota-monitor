// Content script for Kimi (www.kimi.com)
// Injected on: https://www.kimi.com/code/console*

import type { UsageData, ScrapeUsageMessage } from '../shared/types'

console.log('[AI Monitor] Kimi content script loaded')

interface KimiCard {
    title: string
    value: string
    subtitle?: string
    resetTime?: string
}

function parseStatsCards(): KimiCard[] {
    const cards: KimiCard[] = []
    const cardElements = document.querySelectorAll('.stats-card')
    for (const card of cardElements) {
        const titleEl = card.querySelector('.stats-card-title')
        const valueEl = card.querySelector('.stats-card-value')
        const subtextEl = card.querySelector('.stats-card-subtext')
        const resetEl = card.querySelector('.stats-card-reset-time')
        if (titleEl && valueEl) {
            cards.push({
                title: titleEl.textContent?.trim() ?? '',
                value: valueEl.textContent?.trim() ?? '',
                subtitle: subtextEl?.textContent?.trim(),
                resetTime: resetEl?.textContent?.trim(),
            })
        }
    }
    return cards
}

function parseResetTimestamp(resetText?: string): number | undefined {
    if (!resetText) return undefined
    const now = Date.now()
    // "Resets in 43 hours" / "43 小时后重置"
    const hoursMatch = resetText.match(/(\d+)\s*(?:hours?|小时)/)
    if (hoursMatch) return now + parseInt(hoursMatch[1]) * 3600_000
    // "Resets in 2 days" / "2 天后重置"
    const daysMatch = resetText.match(/(\d+)\s*(?:days?|天)/)
    if (daysMatch) return now + parseInt(daysMatch[1]) * 86400_000
    // "Resets in 30 minutes" / "30 分钟后重置"
    const minsMatch = resetText.match(/(\d+)\s*(?:minutes?|分钟)/)
    if (minsMatch) return now + parseInt(minsMatch[1]) * 60_000
    return undefined
}

function scrapeUsage(): { success: boolean; usage?: UsageData; error?: string } {
    try {
        // Check if stats cards exist — they only render when logged in
        const statsDesktop = document.querySelector('.stats-desktop')
        if (!statsDesktop) {
            return { success: false, error: 'Not logged in - login required' }
        }

        const cards = parseStatsCards()
        if (cards.length === 0) {
            return { success: false, error: 'No stats cards found on page' }
        }

        // Find "Weekly usage" card — primary usage indicator
        const weeklyCard = cards.find((c) => c.title.toLowerCase().includes('weekly usage'))
        // Find "Rate limit details" card — secondary usage indicator
        const rateCard = cards.find((c) => c.title.toLowerCase().includes('rate limit'))

        // Extract percentage from card value (e.g. "4%")
        const targetCard = weeklyCard ?? rateCard
        if (targetCard) {
            const percentMatch = targetCard.value.match(/(\d+(?:\.\d+)?)%/)
            if (percentMatch) {
                const percentage = parseFloat(percentMatch[1])
                return {
                    success: true,
                    usage: {
                        used: percentage,
                        total: 100,
                        unit: '%',
                        percentage: Math.round(percentage),
                        resetTime: targetCard.resetTime,
                        resetTimestamp: parseResetTimestamp(targetCard.resetTime),
                    },
                }
            }
        }

        // Fallback: try to read progress bar width from inline style
        const progressFilled = statsDesktop.querySelector('.stats-card-progress-filled') as HTMLElement | null
        if (progressFilled?.style.width) {
            const widthMatch = progressFilled.style.width.match(/(\d+(?:\.\d+)?)%/)
            if (widthMatch) {
                const percentage = parseFloat(widthMatch[1])
                // Try to find reset time from nearest card
                const resetEl = statsDesktop.querySelector('.stats-card-reset-time')
                return {
                    success: true,
                    usage: {
                        used: percentage,
                        total: 100,
                        unit: '%',
                        percentage: Math.round(percentage),
                        resetTime: resetEl?.textContent?.trim(),
                        resetTimestamp: parseResetTimestamp(resetEl?.textContent?.trim()),
                    },
                }
            }
        }

        // We found cards but couldn't extract usage
        // Return plan info if available
        const planCard = cards.find((c) => c.title.toLowerCase().includes('benefit') || c.title.toLowerCase().includes('model'))
        return {
            success: false,
            error: `Stats cards found but no usage percentage. Cards: ${cards.map((c) => c.title).join(', ')}`,
        }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown scrape error',
        }
    }
}

// Listen for scrape requests
chrome.runtime.onMessage.addListener((message: ScrapeUsageMessage, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_USAGE' && message.platformId === 'kimi') {
        const result = scrapeUsage()
        sendResponse(result)
    }
    return false
})

// Auto-scrape on load
function autoScrape(): void {
    const result = scrapeUsage()
    if (result.success) {
        chrome.runtime.sendMessage({
            type: 'USAGE_RESULT',
            platformId: 'kimi',
            ...result,
        })
        return
    }

    // SPA retry with MutationObserver
    let attempts = 0
    const observer = new MutationObserver(() => {
        attempts++
        const retryResult = scrapeUsage()
        if (retryResult.success || attempts >= 10) {
            observer.disconnect()
            if (retryResult.success) {
                chrome.runtime.sendMessage({
                    type: 'USAGE_RESULT',
                    platformId: 'kimi',
                    ...retryResult,
                })
            }
        }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 30000)
}

if (document.readyState === 'complete') {
    setTimeout(autoScrape, 1500)
} else {
    window.addEventListener('load', () => setTimeout(autoScrape, 1500))
}
