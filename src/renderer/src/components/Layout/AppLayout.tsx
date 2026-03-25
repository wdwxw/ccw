import { Sidebar } from '../Sidebar/Sidebar'
import { AppHeader } from './AppHeader'
import { StatusBar } from './StatusBar'
import { ToastContainer } from './ToastContainer'
import { TerminalPanel } from '../Terminal/TerminalPanel'
import { SettingsPage } from '../Settings/SettingsPage'
import { useSettingsStore } from '../../stores/settingsStore'

export function AppLayout(): React.ReactElement {
  const showSettings = useSettingsStore((s) => s.showSettings)

  return (
    <div className="flex h-screen flex-col bg-bg-primary">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Always keep TerminalPanel mounted to preserve terminal state */}
          <div className={showSettings ? 'hidden' : 'flex flex-1 flex-col overflow-hidden'}>
            <TerminalPanel />
          </div>
          <div className={showSettings ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}>
            <SettingsPage />
          </div>
        </div>
      </div>
      <StatusBar />
      <ToastContainer />
    </div>
  )
}
