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
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
                <div className="bg-white rounded-lg p-4 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">添加平台</h3>
                    <p className="text-sm text-gray-500">所有平台已添加</p>
                    <button
                        onClick={onClose}
                        className="mt-3 w-full py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-lg p-4 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">添加平台</h3>
                <div className="space-y-2">
                    {availablePlatforms.map((id) => {
                        const config = PLATFORM_CONFIGS[id]
                        return (
                            <button
                                key={id}
                                onClick={() => handleAdd(id)}
                                className="w-full flex items-center gap-3 p-2.5 rounded-md hover:bg-gray-50 border border-gray-200 transition-colors text-left"
                            >
                                <div className="w-8 h-8 rounded-md bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                                    {config.name.slice(0, 2)}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-gray-900">{config.name}</div>
                                    <div className="text-xs text-gray-400">{config.usageUrl}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
                <button
                    onClick={onClose}
                    className="mt-3 w-full py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                    取消
                </button>
            </div>
        </div>
    )
}
