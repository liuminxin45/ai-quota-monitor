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
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
                <p className="app-kicker">Subscription</p>
                <h3 className="mt-2 text-base font-semibold text-slate-900">Copilot 首次订阅时间</h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                    仅当首次订阅发生在当前自然月内时，这个时间才会参与用量速度计算。留空时，继续按默认算法估算。
                </p>

                <label className="mt-5 block text-xs font-medium uppercase tracking-[0.16em] text-stone-500" htmlFor="copilot-subscription-start">
                    首次订阅时间
                </label>
                <input
                    id="copilot-subscription-start"
                    type="datetime-local"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="app-input mt-2"
                />

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
