// src/renderer/src/stores/notificationStore.ts
import { create } from 'zustand'
import { useRepoStore } from './repoStore'

interface NotificationState {
  notifications: Record<string, number>      // worktreeId → total count
  sessionBlinks: Record<string, Set<string>> // worktreeId → Set of sessionId (blinking tabs)
  addNotification: (worktreeId: string, sessionId?: string) => void
  clearNotification: (worktreeId: string) => void
  clearSessionBlink: (worktreeId: string, sessionId: string) => void
  getCount: (worktreeId: string) => number
}

// 去重窗口：同一 (worktreeId, sessionId) 150ms 内只计一次
// 防止 Stop + Notification hook 重复触发导致重复计数
const dedupeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: {},
  sessionBlinks: {},

  addNotification: (worktreeId, sessionId) => {
    // Always accumulate notifications regardless of selection/focus state
    // User should see notifications on any worktree that had activity

    // Dedupe per (worktreeId, sessionId) to handle Stop+Notification hooks
    // A single terminal session fires both hooks near-simultaneously (~50ms apart)
    const dedupeKey = `${worktreeId}:${sessionId}`
    if (dedupeTimers[dedupeKey]) return
    dedupeTimers[dedupeKey] = setTimeout(() => {
      delete dedupeTimers[dedupeKey]
    }, 150)

    set((s) => {
      const nextBlinks = { ...s.sessionBlinks }
      if (sessionId) {
        const existing = new Set(nextBlinks[worktreeId] ?? [])
        existing.add(sessionId)
        nextBlinks[worktreeId] = existing
      }
      return {
        notifications: {
          ...s.notifications,
          [worktreeId]: (s.notifications[worktreeId] ?? 0) + 1,
        },
        sessionBlinks: nextBlinks,
      }
    })
    // Notify tray to start flashing
    window.api.tray.setFlashing(true)
  },

  clearNotification: (worktreeId) => {
    set((s) => {
      const next = { ...s.notifications }
      delete next[worktreeId]
      const nextBlinks = { ...s.sessionBlinks }
      delete nextBlinks[worktreeId]
      const hasAny = Object.keys(next).length > 0
      // Stop tray flash when all notifications cleared
      window.api.tray.setFlashing(hasAny)
      return { notifications: next, sessionBlinks: nextBlinks }
    })
  },

  clearSessionBlink: (worktreeId, sessionId) => {
    set((s) => {
      const currentCount = s.notifications[worktreeId] ?? 0
      if (currentCount === 0) return s

      const nextBlinks = { ...s.sessionBlinks }
      const existing = new Set(nextBlinks[worktreeId] ?? [])
      existing.delete(sessionId)
      if (existing.size === 0) {
        delete nextBlinks[worktreeId]
      } else {
        nextBlinks[worktreeId] = existing
      }

      const newCount = currentCount - 1
      const nextNotifs = { ...s.notifications }
      if (newCount <= 0) {
        delete nextNotifs[worktreeId]
      } else {
        nextNotifs[worktreeId] = newCount
      }

      const hasAny = Object.keys(nextNotifs).length > 0
      window.api.tray.setFlashing(hasAny)

      return { notifications: nextNotifs, sessionBlinks: nextBlinks }
    })
  },

  getCount: (worktreeId) => get().notifications[worktreeId] ?? 0,
}))

// Call once at app startup. Returns a disposer (not needed in production).
export function initNotificationListener(): () => void {
  return window.api.notification.onNotification(({ worktreeId, sessionId }) => {
    useNotificationStore.getState().addNotification(worktreeId, sessionId)
  })
}
