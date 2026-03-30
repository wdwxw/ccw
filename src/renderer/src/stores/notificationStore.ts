// src/renderer/src/stores/notificationStore.ts
import { create } from 'zustand'
import { useRepoStore } from './repoStore'

interface NotificationState {
  notifications: Record<string, number>  // worktreeId → count
  addNotification: (worktreeId: string) => void
  clearNotification: (worktreeId: string) => void
  getCount: (worktreeId: string) => number
}

// 去重窗口：同一 worktree 1000ms 内只计一次
// Stop 和 Notification 两个 hook 可能在同一次任务结束时连续触发
const dedupeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: {},

  addNotification: (worktreeId) => {
    // If the worktree is currently selected AND the window is focused, don't accumulate
    // When the window loses focus (user switched to another app), still notify
    const selected = useRepoStore.getState().selectedWorktreeId
    if (selected === worktreeId && document.hasFocus()) return

    // Dedupe: ignore if a notification for this worktree already arrived within 1s
    if (dedupeTimers[worktreeId]) return
    dedupeTimers[worktreeId] = setTimeout(() => {
      delete dedupeTimers[worktreeId]
    }, 1000)

    set((s) => ({
      notifications: {
        ...s.notifications,
        [worktreeId]: (s.notifications[worktreeId] ?? 0) + 1,
      },
    }))
    // Notify tray to start flashing
    window.api.tray.setFlashing(true)
  },

  clearNotification: (worktreeId) => {
    set((s) => {
      const next = { ...s.notifications }
      delete next[worktreeId]
      const hasAny = Object.keys(next).length > 0
      // Stop tray flash when all notifications cleared
      window.api.tray.setFlashing(hasAny)
      return { notifications: next }
    })
  },

  getCount: (worktreeId) => get().notifications[worktreeId] ?? 0,
}))

// Call once at app startup. Returns a disposer (not needed in production).
export function initNotificationListener(): () => void {
  return window.api.notification.onNotification(({ worktreeId }) => {
    useNotificationStore.getState().addNotification(worktreeId)
  })
}
