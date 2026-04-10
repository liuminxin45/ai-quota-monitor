import React, { useState } from 'react'
import type { Platform } from '../shared/types'
import { updatePlatformMonthlyPrice } from '../shared/storage'

interface PlatformPriceDialogProps {
    platform: Platform
    onClose: () => void
}

export function PlatformPriceDialog({ platform, onClose }: PlatformPriceDialogProps) {
    const [value, setValue] = useState(platform.monthlyPriceRmb?.toString() ?? '')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            const parsed = Number(value)
            await updatePlatformMonthlyPrice(
                platform.id,
                value.trim() === '' || Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed
            )
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const handleClear = async () => {
        setSaving(true)
        try {
            await updatePlatformMonthlyPrice(platform.id, undefined)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35" onClick={onClose}>
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <h3 className="text-sm font-semibold text-slate-900">设置 {platform.name} 月费</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                    用于侧边栏顶部汇总和 AI 建议的成本判断，单位固定为 RMB / 月。
                </p>

                <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor={`price-${platform.id}`}>
                    月费价格
                </label>
                <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3 py-2.5">
                    <span className="text-sm font-medium text-slate-500">¥</span>
                    <input
                        id={`price-${platform.id}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        className="ml-2 w-full border-0 bg-transparent text-sm text-slate-800 outline-none"
                        placeholder="例如 158"
                    />
                    <span className="text-xs text-slate-400">/ 月</span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                        onClick={handleClear}
                        disabled={saving}
                        className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        清空
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}