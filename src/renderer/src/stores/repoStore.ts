import { create } from 'zustand'
import type { Repo, Worktree } from '../types'
import { generateId, generateWorktreeDirName } from '../utils/helpers'
import { useToastStore } from './toastStore'

function toast(type: 'success' | 'error' | 'warning' | 'info', msg: string): void {
  useToastStore.getState().addToast(type, msg)
}

interface RepoState {
  repos: Repo[]
  selectedRepoId: string | null
  selectedWorktreeId: string | null
  loading: boolean
  collapseAllTrigger: number
  terminalPath: string
  _showError?: (msg: string) => void

  loadRepos: () => Promise<void>
  setTerminalPath: (path: string) => void
  addRepo: () => Promise<void>
  removeRepo: (repoId: string) => Promise<void>
  createWorktree: (repoId: string) => Promise<void>
  archiveWorktree: (repoId: string, worktreeId: string) => Promise<void>
  selectRepo: (repoId: string) => void
  selectWorktree: (repoId: string, worktreeId: string) => void
  refreshWorktrees: (repoId: string) => Promise<void>
  renameWorktree: (repoId: string, worktreeId: string, displayName: string) => Promise<void>
  updateWorktreeNote: (repoId: string, worktreeId: string, note: string) => Promise<void>
  collapseAllWorktrees: () => void
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  selectedRepoId: null,
  selectedWorktreeId: null,
  loading: false,
  collapseAllTrigger: 0,
  terminalPath: '',

  setTerminalPath: (path) => set({ terminalPath: path }),

  loadRepos: async () => {
    set({ loading: true })
    try {
      const savedRepos = (await window.api.store.get('repos')) as Repo[] | undefined
      if (savedRepos && Array.isArray(savedRepos)) {
        const updatedRepos = await Promise.all(
          savedRepos.map(async (repo) => {
            try {
              const gitWorktrees = await window.api.git.listWorktrees(repo.path)
              const existingArchived = repo.worktrees.filter((w) => w.status === 'archived')
              // 只保留 repo 本身 + 已追踪的 worktree，过滤掉同仓库的其他 sibling
              const savedActivePaths = new Set(
                repo.worktrees.filter((w) => w.status === 'active').map((w) => w.path)
              )
              const filteredWorktrees = gitWorktrees.filter(
                (gw) => gw.path === repo.path || savedActivePaths.has(gw.path)
              )
              const activeWorktrees: Worktree[] = filteredWorktrees.map((gw) => {
                const existing = repo.worktrees.find(
                  (w) => w.path === gw.path && w.status === 'active'
                )
                return (
                  existing || {
                    id: generateId(),
                    repoId: repo.id,
                    branch: gw.branch,
                    path: gw.path,
                    status: 'active' as const,
                    createdAt: Date.now()
                  }
                )
              })
              return { ...repo, worktrees: [...activeWorktrees, ...existingArchived] }
            } catch {
              return { ...repo }
            }
          })
        )
        const savedSelectedRepoId = (await window.api.store.get('selectedRepoId')) as
          | string
          | undefined
        const savedSelectedWorktreeId = (await window.api.store.get('selectedWorktreeId')) as
          | string
          | undefined

        const autoRepoId =
          updatedRepos.find((r) => r.id === savedSelectedRepoId)
            ? savedSelectedRepoId!
            : updatedRepos[0]?.id || null

        const autoRepo = updatedRepos.find((r) => r.id === autoRepoId)
        const autoWorktreeId =
          autoRepo?.worktrees.find(
            (w) => w.id === savedSelectedWorktreeId && w.status === 'active'
          )
            ? savedSelectedWorktreeId!
            : null

        set({
          repos: updatedRepos,
          selectedRepoId: autoRepoId,
          selectedWorktreeId: autoWorktreeId
        })
      }
    } finally {
      set({ loading: false })
    }
  },

  addRepo: async () => {
    const dirPath = await window.api.dialog.openDirectory()
    if (!dirPath) return

    const isRepo = await window.api.git.isRepo(dirPath)
    if (!isRepo) {
      toast('error', '所选目录不是有效的 Git 仓库')
      return
    }

    const { repos } = get()
    if (repos.some((r) => r.path === dirPath)) {
      toast('warning', '该仓库已在列表中')
      return
    }

    const name = await window.api.git.getRepoName(dirPath)
    const gitWorktrees = await window.api.git.listWorktrees(dirPath)
    // 只保留当前目录本身的 worktree（过滤掉同仓库的其他 worktree）
    const actualWorktrees = gitWorktrees.filter((gw) => gw.path === dirPath)

    const newRepo: Repo = {
      id: generateId(),
      name,
      path: dirPath,
      addedAt: Date.now(),
      worktrees: actualWorktrees.map((gw) => ({
        id: generateId(),
        repoId: '',
        branch: gw.branch,
        path: gw.path,
        status: 'active' as const,
        createdAt: Date.now()
      }))
    }
    newRepo.worktrees.forEach((w) => (w.repoId = newRepo.id))

    const updated = [...repos, newRepo]
    set({ repos: updated, selectedRepoId: newRepo.id })
    await window.api.store.set('repos', updated)
    toast('success', `已添加仓库「${name}」`)
  },

  removeRepo: async (repoId) => {
    const { repos, selectedRepoId, selectedWorktreeId } = get()
    const updated = repos.filter((r) => r.id !== repoId)
    const isSelected = selectedRepoId === repoId
    set({
      repos: updated,
      selectedRepoId: isSelected ? null : selectedRepoId,
      selectedWorktreeId: isSelected ? null : selectedWorktreeId
    })
    await window.api.store.set('repos', updated)
    toast('info', '仓库已从列表移除')
  },

  createWorktree: async (repoId) => {
    const { repos } = get()
    const repo = repos.find((r) => r.id === repoId)
    if (!repo) return

    try {
      const currentBranch = await window.api.git.getCurrentBranch(repo.path)
      const dirName = generateWorktreeDirName(currentBranch)
      const parentDir = await window.api.path.dirname(repo.path)
      const targetDir = `${parentDir}/${dirName}`

      const result = await window.api.git.addWorktree(
        repo.path,
        dirName,
        targetDir,
        currentBranch
      )
      if (!result.success) {
        toast('error', `创建 Worktree 失败: ${result.error}`)
        return
      }

      const newWorktree: Worktree = {
        id: generateId(),
        repoId,
        branch: result.branch || dirName,
        path: targetDir,
        status: 'active',
        createdAt: Date.now()
      }

      const updated = repos.map((r) =>
        r.id === repoId ? { ...r, worktrees: [...r.worktrees, newWorktree] } : r
      )
      set({ repos: updated, selectedWorktreeId: newWorktree.id, selectedRepoId: repoId })
      await window.api.store.set('repos', updated)
      toast('success', `Worktree「${result.branch || dirName}」已创建`)
    } catch (err: any) {
      toast('error', `创建 Worktree 异常: ${err.message}`)
    }
  },

  archiveWorktree: async (repoId, worktreeId) => {
    const { repos } = get()
    const repo = repos.find((r) => r.id === repoId)
    if (!repo) return

    const worktree = repo.worktrees.find((w) => w.id === worktreeId)
    if (!worktree) return

    try {
      const result = await window.api.git.removeWorktree(repo.path, worktree.path)
      if (!result.success) {
        toast('error', `归档 Worktree 失败: ${result.error}`)
        return
      }

      const { selectedWorktreeId } = get()
      const updated = repos.map((r) =>
        r.id === repoId
          ? {
              ...r,
              worktrees: r.worktrees.map((w) =>
                w.id === worktreeId ? { ...w, status: 'archived' as const } : w
              )
            }
          : r
      )
      set({
        repos: updated,
        selectedWorktreeId: selectedWorktreeId === worktreeId ? null : selectedWorktreeId
      })
      await window.api.store.set('repos', updated)
      toast('success', `Worktree「${worktree.branch}」已归档`)
    } catch (err: any) {
      toast('error', `归档异常: ${err.message}`)
    }
  },

  selectRepo: (repoId) => {
    set({ selectedRepoId: repoId, selectedWorktreeId: null })
    window.api.store.set('selectedRepoId', repoId)
    window.api.store.set('selectedWorktreeId', null)
  },

  selectWorktree: (repoId, worktreeId) => {
    set({ selectedRepoId: repoId, selectedWorktreeId: worktreeId })
    window.api.store.set('selectedRepoId', repoId)
    window.api.store.set('selectedWorktreeId', worktreeId)
  },

  refreshWorktrees: async (repoId) => {
    const { repos } = get()
    const repo = repos.find((r) => r.id === repoId)
    if (!repo) return

    try {
      const gitWorktrees = await window.api.git.listWorktrees(repo.path)
      const existingArchived = repo.worktrees.filter((w) => w.status === 'archived')
      // 只保留 repo 本身 + 已追踪的 worktree，过滤掉同仓库的其他 sibling
      const savedActivePaths = new Set(
        repo.worktrees.filter((w) => w.status === 'active').map((w) => w.path)
      )
      const filteredWorktrees = gitWorktrees.filter(
        (gw) => gw.path === repo.path || savedActivePaths.has(gw.path)
      )
      const activeWorktrees: Worktree[] = filteredWorktrees.map((gw) => {
        const existing = repo.worktrees.find((w) => w.path === gw.path && w.status === 'active')
        return (
          existing || {
            id: generateId(),
            repoId: repo.id,
            branch: gw.branch,
            path: gw.path,
            status: 'active' as const,
            createdAt: Date.now()
          }
        )
      })

      const updated = repos.map((r) =>
        r.id === repoId ? { ...r, worktrees: [...activeWorktrees, ...existingArchived] } : r
      )
      set({ repos: updated })
      await window.api.store.set('repos', updated)
    } catch {
      // ignore
    }
  },

  collapseAllWorktrees: () => {
    set((s) => ({ collapseAllTrigger: s.collapseAllTrigger + 1 }))
  },

  updateWorktreeNote: async (repoId, worktreeId, note) => {
    const { repos } = get()
    const updated = repos.map((r) =>
      r.id === repoId
        ? {
            ...r,
            worktrees: r.worktrees.map((w) =>
              w.id === worktreeId ? { ...w, note: note.trim() || undefined } : w
            )
          }
        : r
    )
    set({ repos: updated })
    await window.api.store.set('repos', updated)
  },

  renameWorktree: async (repoId, worktreeId, displayName) => {
    const { repos, selectedWorktreeId } = get()
    const repo = repos.find((r) => r.id === repoId)
    if (!repo) return

    const worktree = repo.worktrees.find((w) => w.id === worktreeId)
    if (!worktree) return

    const newBranch = displayName.trim()
    if (!newBranch || newBranch === worktree.branch) return

    const result = await window.api.git.renameBranch(worktree.path, worktree.branch, newBranch)
    if (!result.success) {
      toast('error', `分支改名失败: ${result.error}`)
      return
    }

    const updated = repos.map((r) =>
      r.id === repoId
        ? {
            ...r,
            worktrees: r.worktrees.map((w) =>
              w.id === worktreeId ? { ...w, branch: newBranch } : w
            )
          }
        : r
    )

    // If renaming the currently selected worktree, kill its PTY so the
    // terminal will restart with the new branch name on next render.
    if (selectedWorktreeId === worktreeId) {
      await window.api.pty.kill(`wt-${worktreeId}`)
    }

    set({ repos: updated })
    await window.api.store.set('repos', updated)
    toast('success', `分支已改名：${worktree.branch} → ${newBranch}`)
  }
}))
