// Content script for ChatGPT Codex usage page
// Injected on: https://chatgpt.com/codex/cloud/settings/usage*

import type { UsageData, ScrapeUsageMessage } from '../shared/types'

console.log('[AI Monitor] ChatGPT/Codex content script loaded')

function parseResetInfo(sourceText?: string): { resetTime?: string; resetTimestamp?: number } {
    if (!sourceText) {
        return {}
    }

    const normalizedText = sourceText.replace(/\s+/g, ' ').trim()

    const resetCnMatch = normalizedText.match(/重置时间[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
    if (resetCnMatch) {
        const [, year, month, day, hour, minute] = resetCnMatch
        const resetDate = new Date(+year, +month - 1, +day, +hour, +minute)
        return {
            resetTimestamp: resetDate.getTime(),
            resetTime: `${year}年${month}月${day}日 ${hour}:${minute}`,
        }
    }

    const resetRawMatch = normalizedText.match(/重置时间[：:]\s*([^•]+?)(?=$|•|·)/)
    if (resetRawMatch) {
        return { resetTime: resetRawMatch[1].trim() }
    }

    const resetEnMatch = normalizedText.match(/Resets?\s+(?:on|in|at)\s+([^•]+?)(?=$|•|·)/i)
    if (resetEnMatch) {
        return { resetTime: resetEnMatch[0].trim() }
    }

    return {}
}

function scrapeUsage(): { success: boolean; usage?: UsageData; error?: string } {
    try {
        // Check if user is logged in — ChatGPT redirects to login or shows auth UI
        if (document.querySelector('[data-testid="login-button"]') ||
            window.location.pathname.includes('/auth')) {
            return { success: false, error: 'Not logged in - login required' }
        }

        const allText = document.body.innerText

        // Strategy 1: Find the "每周使用限额" (weekly usage) article card specifically
        // The page has multiple cards (5小时, 每周, 代码审查, 剩余额度) — we want the weekly one
        const articles = document.querySelectorAll('article')
        let weeklyArticle: Element | null = null
        let fallbackArticle: Element | null = null
        for (const article of articles) {
            const articleText = article.textContent ?? ''
            if (/每周使用限额|weekly\s+usage/i.test(articleText)) {
                weeklyArticle = article
                break
            }
            // Fallback: any article with a percentage + "剩余"
            if (!fallbackArticle && /\d+%/.test(articleText) && /剩余|remaining/i.test(articleText)) {
                fallbackArticle = article
            }
        }

        const targetArticle = weeklyArticle ?? fallbackArticle
        if (targetArticle) {
            const { resetTime, resetTimestamp } = parseResetInfo(
                (targetArticle as HTMLElement).innerText || targetArticle.textContent || undefined,
            )
            const percentSpan = targetArticle.querySelector('span.text-2xl')
            const percentText = percentSpan?.textContent?.trim() ?? ''
            const percentMatch = percentText.match(/^(\d+(?:\.\d+)?)%$/)
            if (percentMatch) {
                const remaining = parseFloat(percentMatch[1])
                const usedPercent = 100 - remaining
                return {
                    success: true,
                    usage: {
                        used: usedPercent,
                        total: 100,
                        unit: '%',
                        percentage: Math.round(usedPercent),
                        resetTime,
                        resetTimestamp,
                    },
                }
            }
            // Fallback: check progress bar width within the same article
            const bar = targetArticle.querySelector('div[style*="width"]:not(.w-full)') as HTMLElement | null
            const widthMatch = bar?.style.width?.match(/(\d+(?:\.\d+)?)%/)
            if (widthMatch) {
                const remaining = parseFloat(widthMatch[1])
                const usedPercent = 100 - remaining
                return {
                    success: true,
                    usage: {
                        used: usedPercent,
                        total: 100,
                        unit: '%',
                        percentage: Math.round(usedPercent),
                        resetTime,
                        resetTimestamp,
                    },
                }
            }
        }

        // Strategy 2: Regex fallback — match "每周使用限额" then find nearby percentage
        const weeklyMatch = allText.match(/(?:每周使用限额|weekly\s+usage)[\s\S]{0,80}?(\d+(?:\.\d+)?)%/i)
        if (weeklyMatch) {
            const remaining = parseFloat(weeklyMatch[1])
            const usedPercent = 100 - remaining
            const { resetTime, resetTimestamp } = parseResetInfo(
                weeklyMatch[0] || allText.match(/(?:每周使用限额|weekly\s+usage)[\s\S]{0,200}/i)?.[0],
            )
            return {
                success: true,
                usage: {
                    used: usedPercent,
                    total: 100,
                    unit: '%',
                    percentage: Math.round(usedPercent),
                    resetTime,
                    resetTimestamp,
                },
            }
        }

        return {
            success: false,
            error: 'Could not find usage data on page. The page may still be loading.',
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
    if (message.type === 'SCRAPE_USAGE' && message.platformId === 'chatgpt') {
        const result = scrapeUsage()
        sendResponse(result)
    }
    return false
})

// Auto-scrape with MutationObserver (SPA: wait for content to render)
function autoScrape(): void {
    const result = scrapeUsage()
    if (result.success) {
        chrome.runtime.sendMessage({
            type: 'USAGE_RESULT',
            platformId: 'chatgpt',
            ...result,
        })
        return
    }

    // SPA may not have rendered yet — observe DOM changes
    let attempts = 0
    const maxAttempts = 15
    const observer = new MutationObserver(() => {
        attempts++
        const retryResult = scrapeUsage()
        if (retryResult.success || attempts >= maxAttempts) {
            observer.disconnect()
            if (retryResult.success) {
                chrome.runtime.sendMessage({
                    type: 'USAGE_RESULT',
                    platformId: 'chatgpt',
                    ...retryResult,
                })
            }
        }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 30000)
}

if (document.readyState === 'complete') {
    setTimeout(autoScrape, 2000)
} else {
    window.addEventListener('load', () => setTimeout(autoScrape, 2000))
}
