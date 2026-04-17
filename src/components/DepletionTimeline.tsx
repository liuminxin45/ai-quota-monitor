import React from 'react'
import type { QuotaTrendModel } from '../shared/types'

interface DepletionTimelineProps {
    model: QuotaTrendModel
}

const TIMELINE_WIDTH = 100

function formatRatePerDay(value: number): string {
    if (value <= 0) return '0% / 工作日'
    if (value < 0.1) return '<0.1% / 工作日'
    return `${value.toFixed(1)}% / 工作日`
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function formatShortDate(timestamp: number): string {
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(timestamp)
}

function formatDuration(ms: number): string {
    const abs = Math.abs(ms)
    const totalHours = abs / 3_600_000
    const days = Math.floor(totalHours / 24)
    const hours = Math.floor(totalHours % 24)

    if (days > 0) {
        return `${days}天${hours > 0 ? `${hours}小时` : ''}`
    }
    return `${Math.max(1, Math.round(totalHours))}小时`
}

function getMarkerAnchor(offset: number): { left: string; transform: string } {
    if (offset <= 14) {
        return { left: '0%', transform: 'translateX(0)' }
    }
    if (offset >= 86) {
        return { left: '100%', transform: 'translateX(-100%)' }
    }
    return { left: `${offset}%`, transform: 'translateX(-50%)' }
}

export function DepletionTimeline({ model }: DepletionTimelineProps) {
    if (!model.resetTimestamp) {
        return null
    }

    const totalMs = Math.max(1, model.resetTimestamp - model.latestTimestamp)
    const depletionOffset = model.projectedDepletionTimestamp
        ? clamp(((model.projectedDepletionTimestamp - model.latestTimestamp) / totalMs) * TIMELINE_WIDTH, 0, TIMELINE_WIDTH)
        : undefined
    const depletesBeforeReset =
        model.projectedDepletionTimestamp !== undefined && model.projectedDepletionTimestamp < model.resetTimestamp
    const markerStyle = depletionOffset !== undefined ? getMarkerAnchor(depletionOffset) : { left: '50%', transform: 'translateX(-50%)' }
    const headlineTone = depletesBeforeReset ? 'text-red-700' : 'text-emerald-700'
    const rateText = formatRatePerDay(model.projectedUsageRatePerDay)
    const remainingText = `${Math.max(0, Math.round(model.projectedRemainingAtReset ?? model.latestRemainingPercentage))}%`

    return (
        <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`text-xs font-medium ${headlineTone}`}>
                        {depletesBeforeReset ? '这轮额度大概率会在重置前用完。' : '这轮额度能撑到重置。'}
                    </p>
                </div>
                <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-100">
                    工作时段均速 {rateText}
                </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>现在</span>
                <span>重置</span>
            </div>

            <div className="relative mt-2.5 h-14">
                <div className="absolute left-0 right-0 top-5 h-2.5 rounded-full bg-slate-200" />
                <div
                    className={`absolute left-0 top-5 h-2.5 rounded-full ${depletesBeforeReset ? 'bg-red-200' : 'bg-emerald-200'}`}
                    style={{ width: depletesBeforeReset && depletionOffset !== undefined ? `${depletionOffset}%` : '100%' }}
                />
                <div className="absolute left-0 top-3.5 h-5 w-5 rounded-full border-2 border-white bg-slate-700 shadow-sm" />
                <div className="absolute right-0 top-3.5 h-5 w-5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />

                {depletionOffset !== undefined ? (
                    <div
                        className="absolute top-0"
                        style={markerStyle}
                    >
                        <div className={`mx-auto h-11 w-[2px] ${depletesBeforeReset ? 'bg-red-400' : 'bg-emerald-400'}`} />
                        <div className={`mt-1 whitespace-nowrap rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-none shadow-sm ring-1 ring-white/70 ${depletesBeforeReset ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {depletesBeforeReset ? '预计耗尽' : '撑到重置'}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">消耗节奏</span>
                    <span className="min-w-0 text-right font-medium text-slate-700">这轮周期平均约 {rateText}</span>
                </div>

                {depletesBeforeReset && model.projectedDepletionTimestamp ? (
                    <>
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500">预计用完</span>
                            <span className="min-w-0 text-right font-medium text-red-700">{formatShortDate(model.projectedDepletionTimestamp)}</span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                            <span className="text-slate-500">和重置相比</span>
                            <span className="min-w-0 text-right font-medium text-red-700">会早 {formatDuration(model.resetTimestamp - model.projectedDepletionTimestamp)}</span>
                        </div>
                    </>
                ) : (
                    <div className="flex items-start justify-between gap-3">
                        <span className="text-slate-500">到重置时</span>
                        <span className="min-w-0 text-right font-medium text-emerald-700">剩 {remainingText}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
