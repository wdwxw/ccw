import { useState, useEffect } from 'react'
import { GitMerge, X } from 'lucide-react'

interface MergeDialogProps {
  repoPath: string
  sourceBranch: string
  onClose: () => void
}

export function MergeDialog({
  repoPath,
  sourceBranch,
  onClose
}: MergeDialogProps): React.ReactElement {
  const [branches, setBranches] = useState<string[]>([])
  const [targetBranch, setTargetBranch] = useState('main')
  const [strategy, setStrategy] = useState<'merge' | 'rebase' | 'squash'>('merge')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [branchList, currentBranch] = await Promise.all([
          window.api.git.getBranches(repoPath),
          window.api.git.getCurrentBranch(repoPath)
        ])
        setBranches(branchList)
        // Default target: repo's current branch, fallback to main/master, then first branch
        const defaultTarget =
          branchList.find((b) => b === currentBranch) ||
          branchList.find((b) => b === 'main' || b === 'master') ||
          branchList[0] ||
          ''
        setTargetBranch(defaultTarget)
      } catch {
        setResult({ success: false, error: '获取分支列表失败' })
      }
    }
    load()
  }, [repoPath])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleMerge = async (): Promise<void> => {
    setLoading(true)
    setResult(null)
    const res = await window.api.git.merge(repoPath, sourceBranch, targetBranch, strategy)
    setLoading(false)
    if (res.success) {
      onClose()
    } else {
      setResult(res)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
          <div className="flex items-center gap-2">
            <GitMerge size={15} className="text-accent" />
            <h2 className="text-sm font-medium text-text-primary">合并分支</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          {/* Source */}
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">源分支</label>
            <div className="rounded-md bg-bg-primary px-3 py-2 text-xs text-accent">
              {sourceBranch}
            </div>
          </div>

          {/* Target */}
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">目标分支</label>
            <select
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="mb-1.5 block text-xs text-text-secondary">合并方式</label>
            <div className="flex gap-2">
              {(['merge', 'rebase', 'squash'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
                    strategy === s
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-border bg-bg-primary text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                result.success
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger'
              }`}
            >
              {result.success ? '合并成功！' : `合并失败: ${result.error}`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border-muted px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            取消
          </button>
          <button
            onClick={handleMerge}
            disabled={loading || !targetBranch}
            className="rounded-md bg-accent px-3 py-1.5 text-xs text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? '合并中...' : '确认合并'}
          </button>
        </div>
      </div>
    </div>
  )
}
