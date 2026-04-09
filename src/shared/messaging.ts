import type { AppMessage } from './types'

// Send a message to the background service worker
export function sendToBackground(message: AppMessage): Promise<unknown> {
    return chrome.runtime.sendMessage(message)
}

// Listen for messages (used in background)
export function onMessage(
    handler: (
        message: AppMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
    ) => boolean | void
): void {
    chrome.runtime.onMessage.addListener(handler)
}
