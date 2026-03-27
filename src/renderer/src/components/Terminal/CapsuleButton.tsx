import { useState, useRef, useEffect } from 'react'
import {
  Code, Terminal, MonitorSmartphone, SquareTerminal,
  GitPullRequest, Edit, Braces, Zap, Globe, Type
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useRepoStore } from '../../stores/repoStore'
import { useToastStore } from '../../stores/toastStore'
import { MergeDialog } from '../Dialogs/MergeDialog'
import type { ExternalApp } from '../../types'

const fallbackIconMap: Record<string, React.ReactElement> = {
  code:             <Code size={12} />,
  edit:             <Edit size={12} />,
  braces:           <Braces size={12} />,
  zap:              <Zap size={12} />,
  globe:            <Globe size={12} />,
  type:             <Type size={12} />,
  terminal:         <Terminal size={12} />,
  'terminal-square':<SquareTerminal size={12} />,
  monitor:          <MonitorSmartphone size={12} />,
}

function AppIcon({ app, size = 16 }: { app: ExternalApp; size?: number }): React.ReactElement {
  if (app.iconBase64) {
    return <img src={app.iconBase64} alt={app.name} width={size} height={size} className="rounded-sm" />
  }
  return (
    <span className="flex items-center justify-center">
      {fallbackIconMap[app.icon] || <Code size={size - 2} />}
    </span>
  )
}

/** Left button - direct open */
function AppButton({
  app,
  onClick,
  title,
}: {
  app: ExternalApp
  onClick: () => void
  title: string
}): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      title={title}
      aria-label={title}
      className="flex items-center gap-[5px] rounded-[6px] px-[9px] py-[3px] text-[11px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
      style={{
        background: 'var(--bg-btn)',
        border: '0.5px solid var(--bm)',
        color: 'var(--t2)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hv2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-btn)')}
      onMouseDown={(e) => (e.currentTarget.style.background = 'var(--ac)')}
      onMouseUp={(e) => (e.currentTarget.style.background = 'var(--hv2)')}
    >
      <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center overflow-hidden rounded-sm">
        <AppIcon app={app} size={14} />
      </span>
      <span className="max-w-[80px] truncate">{app.name}</span>
    </button>
  )
}

/** Right button - dropdown toggle */
function DropdownToggle({
  isOpen,
  onClick,
  title,
}: {
  isOpen: boolean
  onClick: () => void
  title: string
}): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <button
      onClick={onClick}
      onKeyDown={handleKeyDown}
      title={title}
      aria-label={title}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      className="flex items-center justify-center rounded-[6px] p-[6px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
      style={{
        background: 'var(--bg-btn)',
        border: '0.5px solid var(--bm)',
        color: 'var(--t2)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hv2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-btn)')}
      onMouseDown={(e) => (e.currentTarget.style.background = 'var(--ac)')}
      onMouseUp={(e) => (e.currentTarget.style.background = 'var(--hv2)')}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }}
      >
        <path d="M3 4.5l3 3 3-3" />
      </svg>
    </button>
  )
}

/** tb-pill style — for PR button only */
function Pill({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-[5px] rounded-[6px] px-[9px] py-[3px] text-[11px] transition-colors duration-100"
      style={{
        background: 'var(--bg-btn)',
        border: '0.5px solid var(--bm)',
        color: 'var(--t2)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hv2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-btn)')}
    >
      {children}
    </button>
  )
}

interface CapsuleButtonProps { cwd: string }

export function CapsuleButton({ cwd }: CapsuleButtonProps): React.ReactElement {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMerge,    setShowMerge]    = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const lastExternalApp    = useSettingsStore((s) => s.lastExternalApp)
  const externalApps       = useSettingsStore((s) => s.externalApps)
  const setLastExternalApp = useSettingsStore((s) => s.setLastExternalApp)
  const addToast           = useToastStore((s) => s.addToast)
  const repos              = useRepoStore((s) => s.repos)
  const selectedRepoId     = useRepoStore((s) => s.selectedRepoId)
  const selectedWorktreeId = useRepoStore((s) => s.selectedWorktreeId)

  const selectedRepo    = repos.find((r) => r.id === selectedRepoId)
  const selectedWorktree = selectedRepo?.worktrees.find((w) => w.id === selectedWorktreeId)
  const lastApp = externalApps.find((a) => a.id === lastExternalApp) || externalApps[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!showDropdown) return

      if (e.key === 'Escape') {
        setShowDropdown(false)
        e.preventDefault()
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        // Navigate through dropdown items
        const dropdown = document.getElementById('app-dropdown')
        if (!dropdown) return
        const options = dropdown.querySelectorAll('[role="option"]')
        if (options.length === 0) return

        const currentIndex = Array.from(options).findIndex(
          (opt) => opt === document.activeElement
        )

        let nextIndex: number
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1
        }

        ;(options[nextIndex] as HTMLElement).focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showDropdown])

  const handleOpenApp = async (appId: string): Promise<void> => {
    const app = externalApps.find((a) => a.id === appId)
    if (!app || !cwd) return
    const result = await window.api.app.openExternal(app.command, cwd)
    if (result.success) {
      await setLastExternalApp(appId)
    } else {
      addToast('error', `打开 ${app.name} 失败: ${result.error}`)
    }
    setShowDropdown(false)
  }

  return (
    <div className="flex items-center gap-[6px]">
      {/* "Open" pill — matches tb-pill reference */}
      {lastApp && externalApps.length > 0 && (
        <div className="relative flex items-center gap-[4px]" ref={dropdownRef}>
          {/* Left button - direct open */}
          <AppButton
            app={lastApp}
            onClick={() => handleOpenApp(lastApp.id)}
            title={`打开 ${lastApp.name}`}
          />

          {/* Right button - dropdown toggle (hidden if only one app) */}
          {externalApps.length > 1 && (
            <DropdownToggle
              isOpen={showDropdown}
              onClick={() => setShowDropdown(!showDropdown)}
              title="选择其他应用"
            />
          )}

          {/* Dropdown - now positioned relative to container */}
          {showDropdown && (
            <div
              role="listbox"
              id="app-dropdown"
              className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-lg py-1 shadow-2xl"
              style={{
                background: 'var(--color-bg-elevated)',
                border: '0.5px solid var(--bm)',
              }}
            >
              {externalApps.map((app) => (
                <button
                  key={app.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={app.id === lastExternalApp}
                  onClick={() => handleOpenApp(app.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-[6px] text-left text-[11px] transition-colors duration-100"
                  style={{ color: 'var(--t3)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--hv)'
                    e.currentTarget.style.color = 'var(--t2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--t3)'
                  }}
                >
                  <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center overflow-hidden rounded-sm">
                    <AppIcon app={app} size={16} />
                  </span>
                  {app.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PR pill */}
      {selectedWorktree && (
        <>
          <Pill onClick={() => setShowMerge(true)} title="Create pull request">
            <GitPullRequest size={11} />
            PR
          </Pill>
          {showMerge && selectedRepo && (
            <MergeDialog
              repoPath={selectedRepo.path}
              sourceBranch={selectedWorktree.branch}
              onClose={() => setShowMerge(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
