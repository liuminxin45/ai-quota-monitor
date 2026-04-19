import React, { useState } from 'react'
import type { PlatformId } from '../shared/types'
import { ALL_PLATFORM_IDS, PLATFORM_CONFIGS } from '../shared/constants'
import { sendToBackground } from '../shared/messaging'

interface AddPlatformDialogProps {
    enabledIds: PlatformId[]
    onClose: () => void
}

export function AddPlatformDialog({ enabledIds, onClose }: AddPlatformDialogProps) {
    const availablePlatforms = ALL_PLATFORM_IDS.filter((id) => !enabledIds.includes(id))

    const handleAdd = async (id: PlatformId) => {
        await sendToBackground({ type: 'ADD_PLATFORM', platformId: id })
        onClose()
    }

    if (availablePlatforms.length === 0) {
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
                    <p className="app-kicker">Platform</p>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">添加平台</h3>
                    <p className="mt-2 text-sm leading-6 text-stone-500">当前可监控的平台都已经启用。</p>
                    <button
                        onClick={onClose}
                        className="app-button-secondary mt-5 w-full"
                    >
                        关闭
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
                <p className="app-kicker">Platform</p>
                <h3 className="mt-2 text-base font-semibold text-slate-900">添加平台</h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">选择要加入监控面板的平台。后续仍可在侧边栏内继续管理和刷新。</p>

                <div className="mt-5 space-y-2.5">
                    {availablePlatforms.map((id) => {
                        const config = PLATFORM_CONFIGS[id]
                        return (
                            <button
                                key={id}
                                onClick={() => handleAdd(id)}
                                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50/60 px-3 py-3 text-left transition-colors hover:border-stone-300 hover:bg-white"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white">
                                    {config.name.slice(0, 2)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-slate-900">{config.name}</div>
                                    <div className="truncate text-xs text-stone-500">{config.usageUrl}</div>
                                </div>
                                <div className="text-xs font-medium text-stone-400">加入</div>
                            </button>
                        )
                    })}
                </div>
                <button
                    onClick={onClose}
                    className="app-button-secondary mt-5 w-full"
                >
                    取消
                </button>
            </div>
        </div>
    )
}
