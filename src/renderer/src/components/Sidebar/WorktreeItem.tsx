import { useState, useRef, useEffect } from 'react'
import type { Worktree } from '../../types'
import { useRepoStore } from '../../stores/repoStore'
import { ConfirmDialog } from '../Dialogs/ConfirmDialog'

interface WorktreeItemProps {
  worktree: Worktree
  repoId: string
}

export function WorktreeItem({ worktree, repoId }: WorktreeItemProps): React.ReactElement {
  const [showConfirm, setShowConfirm] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const selectedWorktreeId = useRepoStore((s) => s.selectedWorktreeId)
  const selectWorktree     = useRepoStore((s) => s.selectWorktree)
  const archiveWorktree    = useRepoStore((s) => s.archiveWorktree)
  const renameWorktree     = useRepoStore((s) => s.renameWorktree)

  const isSelected = selectedWorktreeId === worktree.id
  const isArchived = worktree.status === 'archived'
  const dirName    = worktree.path.split('/').pop() || worktree.branch

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>): void {
    if (!isSelected && !isArchived) e.currentTarget.style.background = 'var(--hv)'
    hoverTimerRef.current = setTimeout(() => {
      setTooltipPos({ x: e.clientX, y: e.clientY })
      setTooltipVisible(true)
    }, 1000)
  }

  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>): void {
    if (!isSelected) e.currentTarget.style.background = 'transparent'
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setTooltipVisible(false)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    if (tooltipVisible) {
      setTooltipPos({ x: e.clientX, y: e.clientY })
    }
  }

  function startRename(e: React.MouseEvent): void {
    e.stopPropagation()
    setRenameValue(worktree.displayName || worktree.branch)
    setIsRenaming(true)
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setTooltipVisible(false)
  }

  function commitRename(): void {
    renameWorktree(repoId, worktree.id, renameValue)
    setIsRenaming(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setIsRenaming(false)
  }

  return (
    <>
      {/* ws-item style — indented under repo */}
      <div
        className="group flex cursor-pointer items-center gap-[9px] rounded-[6px] transition-colors duration-100"
        style={{
          padding: '7px 8px 7px 16px',
          marginBottom: 1,
          opacity: isArchived ? 0.4 : 1,
          background: isSelected ? 'var(--ac, rgba(255,220,160,0.08))' : 'transparent',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onClick={() => { if (!isArchived && !isRenaming) selectWorktree(repoId, worktree.id) }}
      >
        {/* ws-ind: orange dot */}
        <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isArchived
                ? 'var(--t4)'
                : isSelected
                  ? 'var(--orange, #c88832)'
                  : 'var(--color-success)',
              boxShadow: isSelected ? '0 0 5px rgba(200,136,50,0.45)' : undefined,
            }}
          />
        </div>

        {/* ws-info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="w-full rounded bg-transparent text-[12px] leading-[1.3] outline-none"
              style={{
                color: 'var(--t1)',
                border: '1px solid var(--color-accent)',
                padding: '1px 4px',
                background: 'var(--color-bg-elevated)',
              }}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div
                className="truncate text-[12px] leading-[1.3]"
                style={{
                  color: isSelected ? 'var(--t1)' : 'var(--t2)',
                  textDecoration: isArchived ? 'line-through' : undefined,
                }}
              >
                {worktree.branch}
              </div>
              <div className="truncate text-[11px] mt-[1px]" style={{ color: 'var(--t4)' }}>
                {dirName}
              </div>
            </>
          )}
        </div>

        {/* Action buttons on hover */}
        {!isArchived && !isRenaming && (
          <div className="invisible flex items-center gap-[2px] group-hover:visible" style={{ flexShrink: 0 }}>
            {/* Rename button */}
            <button
              onClick={startRename}
              title="改名"
              className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 2a2.83 2.83 0 0 1 4 4L5 16H1v-4z"/>
                <path d="M9.5 3.5l3 3"/>
              </svg>
            </button>

            {/* Archive button */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfirm(true) }}
              title="归档"
              className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-warning)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="14" height="3" rx="1"/>
                <path d="M2 6h12v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zM6 10h4"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltipVisible && !isRenaming && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 8,
            zIndex: 9999,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: '6px 10px',
            maxWidth: 320,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div className="text-[11px] font-medium mb-[2px]" style={{ color: 'var(--t1)' }}>
            {worktree.branch}
          </div>
          <div className="text-[10px] break-all" style={{ color: 'var(--t4)' }}>
            {worktree.path}
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmDialog
          title="归档 Worktree"
          message={`确定要归档「${worktree.branch}」(${dirName}) 吗？这将执行 git worktree remove 操作。`}
          confirmLabel="归档"
          variant="warning"
          onConfirm={() => { archiveWorktree(repoId, worktree.id); setShowConfirm(false) }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
