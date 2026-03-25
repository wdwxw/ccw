import { useRepoStore } from '../../stores/repoStore'
import { RepoItem } from './RepoItem'
import { AddRepoButton } from './AddRepoButton'

export function Sidebar(): React.ReactElement {
  const repos = useRepoStore((s) => s.repos)
  const collapseAllWorktrees = useRepoStore((s) => s.collapseAllWorktrees)

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        width: 258,
        minWidth: 258,
        background: 'var(--color-bg-secondary)',
        borderRight: '0.5px solid var(--bs, rgba(255,220,160,0.07))',
      }}
    >
      {/* ── Activity row ─────────────────────────────────────── */}
      <div className="flex items-center justify-between" style={{ padding: '12px 14px 8px' }}>
        <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--t1)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="1.5" width="5.5" height="13" rx="1.2"/>
            <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1.2"/>
            <rect x="9"   y="9"   width="5.5" height="5.5" rx="1.2"/>
          </svg>
          Activity
        </div>
      </div>

      {/* ── Workspaces header ────────────────────────────────── */}
      <div className="flex items-center justify-between" style={{ padding: '3px 14px 7px' }}>
        <span className="text-[10.5px] font-medium tracking-[0.05em] uppercase" style={{ color: 'var(--t4)' }}>
          Workspaces
        </span>
        <div className="flex gap-[2px]">
          <SbIconBtn aria-label="collapse all worktrees" title="收缩所有 Worktree 列表" onClick={collapseAllWorktrees}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 4h12M4 8h8M6 12h4"/>
            </svg>
          </SbIconBtn>
          <SbIconBtn aria-label="add" onClick={useRepoStore.getState().addRepo}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </SbIconBtn>
        </div>
      </div>

      {/* ── Workspace list ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '2px 8px' }}>
        {repos.length === 0 ? (
          <EmptyState />
        ) : (
          repos.map((repo) => <RepoItem key={repo.id} repo={repo} />)
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <AddRepoButton />
    </div>
  )
}

function SbIconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      {...props}
      className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
      style={{ color: 'var(--t4)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--t3)'
        e.currentTarget.style.background = 'var(--hv)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--t4)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--t4)', marginBottom: 10, opacity: 0.5 }}>
        <circle cx="4"  cy="3.8" r="1.4" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="3.8" r="1.4" fill="currentColor" stroke="none"/>
        <circle cx="4"  cy="12"  r="1.4" fill="currentColor" stroke="none"/>
        <path d="M4 5.2v5.4"/>
        <path d="M12 5.2q0 3.3-3.1 4.9c-.9.5-1 1-.9 2"/>
      </svg>
      <p className="text-[12px]" style={{ color: 'var(--t3)' }}>No repositories yet</p>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--t4)' }}>Add a git repo to get started</p>
    </div>
  )
}
