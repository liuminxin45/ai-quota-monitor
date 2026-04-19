import React from 'react'
import type { QuotaTrendModel, QuotaTrendPoint } from '../shared/types'

interface QuotaHistoryChartProps {
    model: QuotaTrendModel
    height?: number
}

const VIEWBOX_WIDTH = 320

function buildPath(points: QuotaTrendPoint[], width: number, height: number, padding: number): string {
    if (!points.length) {
        return ''
    }

    const minTimestamp = points[0].timestamp
    const maxTimestamp = points[points.length - 1].timestamp
    const timestampSpan = Math.max(1, maxTimestamp - minTimestamp)
    const innerWidth = width - padding * 2
    const innerHeight = height - padding * 2

    return points
        .map((point, index) => {
            const x = padding + ((point.timestamp - minTimestamp) / timestampSpan) * innerWidth
            const y = padding + ((100 - point.remainingPercentage) / 100) * innerHeight
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')
}

function buildArea(points: QuotaTrendPoint[], width: number, height: number, padding: number): string {
    if (!points.length) {
        return ''
    }

    const minTimestamp = points[0].timestamp
    const maxTimestamp = points[points.length - 1].timestamp
    const timestampSpan = Math.max(1, maxTimestamp - minTimestamp)
    const innerWidth = width - padding * 2
    const innerHeight = height - padding * 2
    const floorY = height - padding

    const commands = points
        .map((point, index) => {
            const x = padding + ((point.timestamp - minTimestamp) / timestampSpan) * innerWidth
            const y = padding + ((100 - point.remainingPercentage) / 100) * innerHeight
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')

    const lastX = padding + ((points[points.length - 1].timestamp - minTimestamp) / timestampSpan) * innerWidth
    const firstX = padding + ((points[0].timestamp - minTimestamp) / timestampSpan) * innerWidth
    return `${commands} L${lastX.toFixed(2)},${floorY} L${firstX.toFixed(2)},${floorY} Z`
}

export function QuotaHistoryChart({ model, height = 96 }: QuotaHistoryChartProps) {
    const padding = 12
    const allPoints = model.forecast.length > 1
        ? [...model.actual, model.forecast[model.forecast.length - 1]]
        : model.actual
    const actualPath = buildPath(model.actual, VIEWBOX_WIDTH, height, padding)
    const actualArea = buildArea(model.actual, VIEWBOX_WIDTH, height, padding)
    const forecastPath = model.forecast.length > 1
        ? buildPath(model.forecast, VIEWBOX_WIDTH, height, padding)
        : ''
    const latestPoint = allPoints[allPoints.length - 1]
    const latestX = allPoints.length > 1
        ? padding + (((latestPoint.timestamp - allPoints[0].timestamp) / Math.max(1, allPoints[allPoints.length - 1].timestamp - allPoints[0].timestamp)) * (VIEWBOX_WIDTH - padding * 2))
        : VIEWBOX_WIDTH - padding
    const latestY = padding + ((100 - latestPoint.remainingPercentage) / 100) * (height - padding * 2)

    return (
        <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label="额度余量趋势图，实线为历史余量，虚线为预测余量"
        >
            <defs>
                <linearGradient id="quota-history-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(16 185 129 / 0.22)" />
                    <stop offset="100%" stopColor="rgb(16 185 129 / 0.02)" />
                </linearGradient>
            </defs>

            {[0, 50, 100].map((marker) => {
                const y = padding + ((100 - marker) / 100) * (height - padding * 2)
                return (
                    <line
                        key={marker}
                        x1={padding}
                        y1={y}
                        x2={VIEWBOX_WIDTH - padding}
                        y2={y}
                        stroke="rgb(220 213 204)"
                        strokeDasharray={marker === 0 ? undefined : '4 6'}
                        strokeWidth="1"
                    />
                )
            })}

            {actualArea ? <path d={actualArea} fill="url(#quota-history-fill)" /> : null}
            {actualPath ? <path d={actualPath} fill="none" stroke="rgb(52 95 146)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {forecastPath ? <path d={forecastPath} fill="none" stroke="rgb(122 160 205)" strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" strokeLinejoin="round" /> : null}

            {model.resetTimestamp ? (
                <line
                    x1={VIEWBOX_WIDTH - padding}
                    y1={padding}
                    x2={VIEWBOX_WIDTH - padding}
                    y2={height - padding}
                    stroke="rgb(161 161 170)"
                    strokeDasharray="3 5"
                    strokeWidth="1"
                />
            ) : null}

            <circle cx={latestX} cy={latestY} r="3.5" fill="rgb(52 95 146)" stroke="white" strokeWidth="2" />
        </svg>
    )
}
