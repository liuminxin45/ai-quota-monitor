import React from 'react'
import type { QuotaTrendModel } from '../shared/types'

interface TrendSummaryProps {
    model: QuotaTrendModel
    expanded?: boolean
}

function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(timestamp)
}

function getSummary(model: QuotaTrendModel): { headline: string; detail: string; tone: string } {
    if (model.trendWindow === 'insufficient') {
        return {
            headline: '还在积累判断样本',
            detail: '再补几次刷新记录后，耗尽时间和重置距离会更稳定。',
            tone: 'text-slate-600',
        }
    }

    if (model.projectedDepletionTimestamp && model.resetTimestamp && model.projectedDepletionTimestamp < model.resetTimestamp) {
        const gapHours = Math.round((model.resetTimestamp - model.projectedDepletionTimestamp) / 3_600_000)
        const gapText = gapHours >= 24 ? `早 ${Math.floor(gapHours / 24)} 天` : `早 ${gapHours} 小时`
        return {
            headline: '这轮额度大概率会在重置前提前用完',
            detail: `按当前重置周期的平均消耗推算，预计 ${formatDate(model.projectedDepletionTimestamp)} 用完，比重置时间${gapText}。`,
            tone: 'text-red-700',
        }
    }

    if (model.trendWindow === 'stable') {
        return {
            headline: '这轮消耗比较平稳',
            detail: '照目前的节奏，看不到会在重置前用完的迹象。',
            tone: 'text-emerald-700',
        }
    }

    if (model.resetTimestamp) {
        const remaining = Math.max(0, Math.round(model.projectedRemainingAtReset ?? model.latestRemainingPercentage))
        return {
            headline: '照当前节奏，这轮额度能撑到重置',
            detail: `按当前重置周期的平均消耗推算，到 ${formatDate(model.resetTimestamp)} 重置时还会剩 ${remaining}% 额度。`,
            tone: 'text-teal-700',
        }
    }

    return {
        headline: '趋势依据已经补齐',
        detail: '后面随着样本继续增加，判断会更稳。',
        tone: 'text-slate-600',
    }
}

export function TrendSummary({ model, expanded = false }: TrendSummaryProps) {
    const summary = getSummary(model)

    return (
        <div className="space-y-1.5">
            <p className={`text-sm font-semibold ${summary.tone}`}>{summary.headline}</p>
            <p className="text-xs leading-5 text-gray-500">{summary.detail}</p>
            {expanded ? (
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1">
                        <span className="h-0.5 w-4 rounded-full bg-teal-700" />
                        实际余量
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-teal-300" />
                        预测余量
                    </span>
                </div>
            ) : null}
        </div>
    )
}