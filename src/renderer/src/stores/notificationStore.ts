// src/renderer/src/stores/notificationStore.ts
import { create } from 'zustand'
import { useRepoStore } from './repoStore'

interface NotificationState {
  notifications: Record<string, number>  // worktreeId → count
  addNotification: (worktreeId: string) => void
  clearNotification: (worktreeId: string) => void
  getCount: (worktreeId: string) => number
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: {},

  addNotification: (worktreeId) => {
    // If the worktree is currently selected, don't accumulate
    const selected = useRepoStore.getState().selectedWorktreeId
    if (selected === worktreeId) return

    set((s) => ({
      notifications: {
        ...s.notifications,
        [worktreeId]: (s.notifications[worktreeId] ?? 0) + 1,
      },
    }))
  },

  clearNotification: (worktreeId) => {
    set((s) => {
      const next = { ...s.notifications }
      delete next[worktreeId]
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
