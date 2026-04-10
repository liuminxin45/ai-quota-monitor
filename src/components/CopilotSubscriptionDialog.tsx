import React, { useState } from 'react'
import { updateCopilotSubscriptionStartedAt } from '../shared/storage'

interface CopilotSubscriptionDialogProps {
    currentValue?: number
    onClose: () => void
}

function formatForInput(timestamp?: number): string {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    const hours = `${date.getHours()}`.padStart(2, '0')
    const minutes = `${date.getMinutes()}`.padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function CopilotSubscriptionDialog({ currentValue, onClose }: CopilotSubscriptionDialogProps) {
    const [value, setValue] = useState(formatForInput(currentValue))
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            await updateCopilotSubscriptionStartedAt(value ? new Date(value).getTime() : undefined)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const handleClear = async () => {
        setSaving(true)
        try {
            await updateCopilotSubscriptionStartedAt(undefined)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
            <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gray-900">Copilot 首次订阅时间</h3>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                    仅当首次订阅发生在当前自然月内时，这个时间才会参与用量速度计算。留空时，继续按默认算法估算。
                </p>

                <label className="mt-4 block text-xs font-medium text-gray-600" htmlFor="copilot-subscription-start">
                    首次订阅时间
                </label>
                <input
                    id="copilot-subscription-start"
                    type="datetime-local"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-slate-400"
                />

                <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                        onClick={handleClear}
                        disabled={saving}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                    >
                        清空
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}