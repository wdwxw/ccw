import { useRepoStore } from '../../stores/repoStore'

export function StatusBar(): React.ReactElement {
  const repos              = useRepoStore((s) => s.repos)
  const selectedRepoId     = useRepoStore((s) => s.selectedRepoId)
  const selectedWorktreeId = useRepoStore((s) => s.selectedWorktreeId)

  const selectedRepo    = repos.find((r) => r.id === selectedRepoId)
  const selectedWorktree = selectedRepo?.worktrees.find((w) => w.id === selectedWorktreeId)
  const totalWorktrees  = repos.reduce(
    (acc, r) => acc + r.worktrees.filter((w) => w.status === 'active').length, 0
  )

  return (
    <div
      className="flex items-center px-3 text-[10.5px]"
      style={{
        height: 20,
        background: 'var(--color-bg-secondary)',
        borderTop: '0.5px solid var(--bs, rgba(255,220,160,0.07))',
        color: 'var(--t4)',
      }}
    >
      {selectedWorktree ? (
        <>
          {/* orange dot + branch */}
          <span
            className="inline-block rounded-full mr-1.5"
            style={{
              width: 6, height: 6,
              background: 'var(--orange, #c88832)',
              boxShadow: '0 0 4px rgba(200,136,50,0.4)',
            }}
          />
          <span style={{ color: 'var(--t3)' }}>{selectedWorktree.branch}</span>
          <span className="ml-3 max-w-[400px] truncate" style={{ opacity: 0.5 }}>
            {selectedWorktree.path}
          </span>
        </>
      ) : null}

      <div style={{ flex: 1 }} />

      <span style={{ opacity: 0.45 }}>
        {repos.length} repos · {totalWorktrees} worktrees
      </span>
    </div>
  )
}
