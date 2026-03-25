import { useState, useEffect } from 'react'
import type { Repo } from '../../types'
import { useRepoStore } from '../../stores/repoStore'
import { WorktreeItem } from './WorktreeItem'
import { ConfirmDialog } from '../Dialogs/ConfirmDialog'

interface RepoItemProps { repo: Repo }

/** First-letter badge — like ws-badge in reference */
function RepoBadge({ name }: { name: string }): React.ReactElement {
  const letter = name.charAt(0).toUpperCase()
  return (
    <div
      className="flex items-center justify-center rounded text-[10px] font-bold"
      style={{
        width: 18, height: 18,
        background: '#252018',
        color: 'var(--t3)',
        flexShrink: 0,
        borderRadius: 4,
      }}
    >
      {letter}
    </div>
  )
}

export function RepoItem({ repo }: RepoItemProps): React.ReactElement {
  const [expanded,    setExpanded]    = useState(true)
  const [showMenu,    setShowMenu]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId)
  const selectRepo     = useRepoStore((s) => s.selectRepo)
  const removeRepo     = useRepoStore((s) => s.removeRepo)
  const createWorktree = useRepoStore((s) => s.createWorktree)
  const collapseAllTrigger = useRepoStore((s) => s.collapseAllTrigger)

  useEffect(() => {
    if (collapseAllTrigger > 0) setExpanded(false)
  }, [collapseAllTrigger])

  const isSelected     = selectedRepoId === repo.id
  const activeWorktrees = repo.worktrees.filter((w) => w.status === 'active')

  return (
    <div style={{ userSelect: 'none' }}>
      {/* ── Repo row (ws-item style) ─────────────────────────── */}
      <div
        className="group flex cursor-pointer items-center gap-[9px] rounded-[8px] transition-colors duration-100"
        style={{
          padding: '8px 10px',
          marginBottom: 2,
          background: isSelected ? 'var(--ac, rgba(255,220,160,0.08))' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--hv)' }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
        onClick={() => { selectRepo(repo.id); setExpanded(!expanded) }}
      >
        {/* Badge indicator */}
        <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RepoBadge name={repo.name} />
        </div>

        {/* Name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="truncate text-[12px] leading-[1.3]"
            style={{ color: isSelected ? 'var(--t1)' : 'var(--t2)', fontWeight: 500 }}
          >
            {repo.name}
          </div>
        </div>

        {/* Hover actions */}
        <div className="invisible flex items-center gap-[2px] group-hover:visible">
          <ActionBtn
            title="新建 Worktree"
            onClick={(e) => { e.stopPropagation(); createWorktree(repo.id) }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </ActionBtn>
          <div className="relative">
            <ActionBtn
              title="更多"
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="4" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12" cy="8" r="1.4"/>
              </svg>
            </ActionBtn>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div
                  className="absolute right-0 top-6 z-20 w-28 overflow-hidden rounded-lg shadow-xl"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '0.5px solid var(--bm, rgba(255,220,160,0.10))',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMenu(false)
                      setShowConfirm(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors"
                    style={{ color: 'var(--color-danger)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hv)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3,6 13,6"/><path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><rect x="2" y="6" width="12" height="9" rx="1"/>
                    </svg>
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Worktrees ─────────────────────────────────────────── */}
      {expanded && activeWorktrees.map((wt) => (
        <WorktreeItem key={wt.id} worktree={wt} repoId={repo.id} />
      ))}

      {showConfirm && (
        <ConfirmDialog
          title="删除仓库"
          message={`确定要从列表中移除「${repo.name}」吗？此操作不会删除磁盘上的文件。`}
          confirmLabel="删除"
          variant="danger"
          onConfirm={() => { removeRepo(repo.id); setShowConfirm(false) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

function ActionBtn({
  children, onClick, title,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded p-[4px] transition-colors duration-100"
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
