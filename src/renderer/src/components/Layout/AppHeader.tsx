import { ChevronDown, Settings } from 'lucide-react'
import { useRepoStore } from '../../stores/repoStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { CapsuleButton } from '../Terminal/CapsuleButton'

export function AppHeader(): React.ReactElement {
  const repos          = useRepoStore((s) => s.repos)
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId)
  const selectedWtId   = useRepoStore((s) => s.selectedWorktreeId)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)

  const selectedRepo = repos.find((r) => r.id === selectedRepoId)
  const selectedWt   = selectedRepo?.worktrees.find((w) => w.id === selectedWtId)
  const currentCwd   = selectedWt?.path || selectedRepo?.path || ''

  return (
    <div
      className="drag-region flex h-10 shrink-0 items-center gap-2"
      style={{
        background: 'var(--color-bg-secondary)',
        borderBottom: '0.5px solid var(--bs)',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/*
        ── macOS native traffic light spacer ──────────────────────
        The OS renders real red/yellow/green buttons here.
        We only need blank space (~72px). NO custom dots here.
        This spacer has no no-drag so dragging works over it too.
      */}
      <div style={{ width: 72, flexShrink: 0 }} />

      {/* ── Nav arrows (decorative, no-drag only on buttons) ───── */}
      <div className="flex items-center gap-px" style={{ flexShrink: 0 }}>
        <button
          className="no-drag rounded px-1 leading-none transition-colors duration-100"
          style={{ color: 'var(--t4)', fontSize: 'calc(17px * var(--font-scale))', lineHeight: 1 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t3)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
          aria-label="back"
        >‹</button>
        <button
          className="no-drag rounded px-1 leading-none transition-colors duration-100"
          style={{ color: 'var(--t4)', fontSize: 'calc(17px * var(--font-scale))', lineHeight: 1 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t3)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
          aria-label="forward"
        >›</button>
      </div>

      {/*
        ── Breadcrumb — purely informational text, stays draggable ─
        NO no-drag here: the whole center area should drag the window
      */}
      <div
        className="flex flex-1 items-center justify-center gap-[5px]"
        style={{ fontSize: 'calc(12px * var(--font-scale))', userSelect: 'none', pointerEvents: 'none' }}
      >
        <span style={{ color: 'var(--t3)', display: 'flex' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="4"  cy="3.8" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="3.8" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="4"  cy="12"  r="1.5" fill="currentColor" stroke="none"/>
            <path d="M4 5.3v5.2"/>
            <path d="M12 5.3q0 3.2-3.2 4.8c-.9.5-1.1 1-1.1 2.1"/>
          </svg>
        </span>

        {selectedRepo
          ? <span style={{ color: 'var(--t2)' }}>{selectedRepo.name}</span>
          : <span style={{ color: 'var(--t2)' }}>ccw</span>
        }

        {selectedWt && (
          <>
            <span style={{ color: 'var(--t4)' }}>›</span>
            <span className="flex items-center gap-[3px]" style={{ color: 'var(--t2)' }}>
              {selectedWt.branch}
              <ChevronDown size={10} style={{ color: 'var(--t3)' }} />
            </span>
          </>
        )}
      </div>

      {/* ── Right actions — no-drag only on the interactive parts ─ */}
      <div className="flex items-center gap-[6px]" style={{ flexShrink: 0 }}>
        {selectedRepo && (
          <div className="no-drag">
            <CapsuleButton cwd={currentCwd} />
          </div>
        )}
        <button
          className="no-drag flex items-center justify-center rounded p-1 transition-colors duration-100"
          style={{ color: 'var(--t4)' }}
          onClick={toggleSettings}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--t3)'
            e.currentTarget.style.background = 'var(--hv)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--t4)'
            e.currentTarget.style.background = 'transparent'
          }}
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}
