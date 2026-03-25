export interface Repo {
  id: string
  name: string
  path: string
  addedAt: number
  worktrees: Worktree[]
}

export interface Worktree {
  id: string
  repoId: string
  branch: string
  path: string
  status: 'active' | 'archived'
  createdAt: number
}

export interface ExternalApp {
  id: string
  name: string
  command: string
  icon: string
  iconBase64?: string
  installed?: boolean
}

export interface QuickButton {
  id: string
  title: string
  content: string
  autoEnter: boolean
}

export interface MergeConfig {
  repoPath: string
  sourceBranch: string
  targetBranch: string
  strategy: 'merge' | 'rebase' | 'squash'
}
