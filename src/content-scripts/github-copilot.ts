// Content script for GitHub Copilot usage page
// Injected on: https://github.com/settings/copilot*, https://github.com/settings/billing*

import type { UsageData, ScrapeUsageMessage } from '../shared/types'

console.log('[AI Monitor] GitHub Copilot content script loaded')

function scrapeUsage(): { success: boolean; usage?: UsageData; error?: string } {
    try {
        // Check if user is logged in — GitHub shows a sign-in form if not
        const signInForm = document.querySelector('form[action*="session"]')
        const metaLogin = document.querySelector('meta[name="user-login"]')
        if (signInForm && !metaLogin?.getAttribute('content')) {
            return { success: false, error: 'Not logged in - login required' }
        }

        // Calculate reset time — Copilot resets on the 9th of each month
        let resetTimestamp: number
        function getResetInfo(): { text: string; timestamp: number } {
            const now = new Date()
            let resetDate: Date
            if (now.getDate() < 9) {
                resetDate = new Date(now.getFullYear(), now.getMonth(), 9)
            } else {
                resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 9)
            }
            const timestamp = resetDate.getTime()
            const diffMs = timestamp - now.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
            let text: string
            if (diffDays > 0) {
                text = `Resets in ${diffDays}d ${diffHours}h`
            } else {
                text = `Resets in ${diffHours} hours`
            }
            return { text, timestamp }
        }

        const resetInfo = getResetInfo()
        const resetTime = resetInfo.text
        resetTimestamp = resetInfo.timestamp

        // Strategy 1: Look for #copilot-overages-usage (actual DOM structure)
        const overagesSection = document.querySelector('#copilot-overages-usage')
        if (overagesSection) {
            // Find percentage text like "3.9%"
            const textContent = overagesSection.textContent ?? ''
            const percentMatch = textContent.match(/(\d+(?:\.\d+)?)%/)
            if (percentMatch) {
                const percentage = parseFloat(percentMatch[1])
                return {
                    success: true,
                    usage: {
                        used: percentage,
                        total: 100,
                        unit: '%',
                        percentage: Math.round(percentage),
                        resetTime,
                        resetTimestamp,
                    },
                }
            }

            // Fallback: read progress bar width
            const progressItem = overagesSection.querySelector('.Progress-item') as HTMLElement | null
            if (progressItem?.style.width) {
                const widthMatch = progressItem.style.width.match(/(\d+(?:\.\d+)?)%/)
                if (widthMatch) {
                    const percentage = parseFloat(widthMatch[1])
                    return {
                        success: true,
                        usage: {
                            used: percentage,
                            total: 100,
                            unit: '%',
                            percentage: Math.round(percentage),
                            resetTime,
                            resetTimestamp,
                        },
                    }
                }
            }
        }

        // Strategy 2: Look for "Premium requests" text then find nearby percentage
        const allText = document.body.innerText
        const premiumPattern = /Premium\s+requests[\s\S]*?(\d+(?:\.\d+)?)%/i
        const premiumMatch = allText.match(premiumPattern)
        if (premiumMatch) {
            const percentage = parseFloat(premiumMatch[1])
            return {
                success: true,
                usage: {
                    used: percentage,
                    total: 100,
                    unit: '%',
                    percentage: Math.round(percentage),
                    resetTime,
                    resetTimestamp,
                },
            }
        }

        // Strategy 3: Generic "X / Y" or "X of Y" pattern
        const usagePattern = /(\d[\d,]*)\s*(?:\/|of)\s*(\d[\d,]*)\s*(completions|requests|suggestions|messages)/i
        const match = allText.match(usagePattern)
        if (match) {
            const used = parseInt(match[1].replace(/,/g, ''), 10)
            const total = parseInt(match[2].replace(/,/g, ''), 10)
            const unit = match[3].toLowerCase()
            const percentage = total > 0 ? Math.round((used / total) * 100) : 0
            return {
                success: true,
                usage: { used, total, unit, percentage, resetTime },
            }
        }

        return {
            success: false,
            error: 'Could not find usage data on page. Check if the page has loaded fully.',
        }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown scrape error',
        }
    }
}

// Listen for scrape requests from background
chrome.runtime.onMessage.addListener((message: ScrapeUsageMessage, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_USAGE' && message.platformId === 'github-copilot') {
        const result = scrapeUsage()
        sendResponse(result)
    }
    return false
})

// Auto-scrape on page load and report to background
function autoScrape(): void {
    const result = scrapeUsage()
    if (result.success) {
        chrome.runtime.sendMessage({
            type: 'USAGE_RESULT',
            platformId: 'github-copilot',
            ...result,
        })
    }
}

// Wait for page to be fully loaded, then auto-scrape
if (document.readyState === 'complete') {
    setTimeout(autoScrape, 1000)
} else {
    window.addEventListener('load', () => setTimeout(autoScrape, 1000))
}
