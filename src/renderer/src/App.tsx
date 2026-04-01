import { useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { useRepoStore } from './stores/repoStore'
import { useSettingsStore } from './stores/settingsStore'

export default function App(): React.ReactElement {
  const loadRepos = useRepoStore((s) => s.loadRepos)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const theme = useSettingsStore((s) => s.theme)
  const fontScale = useSettingsStore((s) => s.fontScale)

  useEffect(() => {
    loadRepos()
    loadSettings()
  }, [loadRepos, loadSettings])

  useEffect(() => {
    const themeAttr = theme === 'brown' ? 'brown' : theme === 'light' ? 'light' : ''
    document.documentElement.setAttribute('data-theme', themeAttr)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale))
  }, [fontScale])

  return <AppLayout />
}
