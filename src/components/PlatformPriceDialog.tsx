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
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
                <p className="app-kicker">Billing</p>
                <h3 className="mt-2 text-base font-semibold text-slate-900">设置 {platform.name} 月费</h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                    用于侧边栏顶部汇总和 AI 建议的成本判断，单位固定为 RMB / 月。
                </p>

                <label className="mt-5 block text-xs font-medium uppercase tracking-[0.16em] text-stone-500" htmlFor={`price-${platform.id}`}>
                    月费价格
                </label>
                <div className="mt-2 flex items-center rounded-2xl border border-stone-200 bg-stone-50 px-3.5 py-3">
                    <span className="text-sm font-medium text-stone-500">¥</span>
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
                    <span className="text-xs text-stone-400">/ 月</span>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                    <button
                        onClick={handleClear}
                        disabled={saving}
                        className="app-button-secondary px-3.5 py-2 text-xs"
                    >
                        清空
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="app-button-secondary px-3.5 py-2 text-xs"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="app-button-primary px-3.5 py-2 text-xs"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
