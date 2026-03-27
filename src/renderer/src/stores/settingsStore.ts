import { create } from 'zustand'
import type { ExternalApp, QuickButton } from '../types'

type Theme = 'dazi' | 'brown'
type FontScale = 1 | 1.25 | 1.5

interface SettingsState {
  lastExternalApp: string
  externalApps: ExternalApp[]
  quickButtons: QuickButton[]
  showSettings: boolean
  theme: Theme
  fontScale: FontScale
  showTrayIcon: boolean

  loadSettings: () => Promise<void>
  setLastExternalApp: (appId: string) => Promise<void>
  setExternalApps: (apps: ExternalApp[]) => Promise<void>
  setQuickButtons: (buttons: QuickButton[]) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setFontScale: (scale: FontScale) => Promise<void>
  setShowTrayIcon: (visible: boolean) => Promise<void>
  toggleSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  lastExternalApp: 'vscode',
  externalApps: [],
  quickButtons: [],
  showSettings: false,
  theme: 'dazi',
  fontScale: 1,
  showTrayIcon: true,

  loadSettings: async () => {
    const lastApp = (await window.api.store.get('lastExternalApp')) as string | undefined
    const apps = (await window.api.store.get('externalApps')) as ExternalApp[] | undefined
    const buttons = (await window.api.store.get('quickButtons')) as QuickButton[] | undefined
    const theme = (await window.api.store.get('theme')) as Theme | undefined
    const fontScale = (await window.api.store.get('fontScale')) as FontScale | undefined
    const showTrayIcon = (await window.api.store.get('showTrayIcon')) as boolean | undefined
    if (lastApp) set({ lastExternalApp: lastApp })
    if (apps && apps.length > 0) {
      set({ externalApps: apps })
    }
    if (buttons) {
      set({ quickButtons: buttons })
    }
    if (theme) {
      set({ theme })
    }
    if (fontScale) {
      set({ fontScale })
    }
    if (showTrayIcon !== undefined) {
      set({ showTrayIcon })
    }
  },

  setLastExternalApp: async (appId) => {
    set({ lastExternalApp: appId })
    await window.api.store.set('lastExternalApp', appId)
  },

  setExternalApps: async (apps) => {
    set({ externalApps: apps })
    await window.api.store.set('externalApps', apps)
  },

  setQuickButtons: async (buttons) => {
    set({ quickButtons: buttons })
    await window.api.store.set('quickButtons', buttons)
  },

  setTheme: async (theme) => {
    set({ theme })
    await window.api.store.set('theme', theme)
  },

  setFontScale: async (fontScale) => {
    set({ fontScale })
    await window.api.store.set('fontScale', fontScale)
  },

  setShowTrayIcon: async (visible) => {
    set({ showTrayIcon: visible })
    await window.api.store.set('showTrayIcon', visible)
    await window.api.tray.setVisible(visible)
  },

  toggleSettings: () => {
    const { showSettings } = get()
    set({ showSettings: !showSettings })
  }
}))
