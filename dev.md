# CCW 技术文档

> Git Worktree 可视化管理工具 — 供后续开发者阅读

---

## 1. 项目概述

**CCW** (Cursor/Cody Worktree) 是一个 macOS 桌面应用，用于可视化管理 Git Worktree。它允许开发者在多个 Git 分支并行的环境中工作，每个 worktree 对应一个独立分支，内置终端方便无缝操作。

- **技术栈**: Electron 34 + React 19 + TypeScript
- **构建工具**: electron-vite + Vite 6
- **状态管理**: Zustand 5
- **Git 操作**: simple-git 3.27
- **终端模拟**: xterm.js 5.5 + node-pty
- **目标平台**: macOS (.dmg)

---

## 2. 项目结构

```
ccw/
├── src/
│   ├── main/
│   │   └── index.ts          # Electron 主进程（窗口、IPC、PTY、Git 操作）
│   ├── preload/
│   │   └── index.ts          # 预加载脚本（安全的 IPC 桥接）
│   └── renderer/
│       ├── index.html        # HTML 入口
│       └── src/
│           ├── main.tsx      # React 入口
│           ├── App.tsx       # 根组件
│           ├── index.css     # 全局样式 + Tailwind
│           ├── env.d.ts      # TypeScript 类型声明
│           ├── components/   # UI 组件
│           ├── stores/       # Zustand 状态管理
│           ├── types/        # TypeScript 接口定义
│           └── utils/        # 工具函数
├── electron.vite.config.ts   # electron-vite 配置
├── package.json              # 依赖和脚本
├── tsconfig.json             # TypeScript 基础配置
├── tsconfig.node.json        # 主进程 TS 配置
├── tsconfig.web.json         # 渲染进程 TS 配置
├── tailwind.config.js        # Tailwind CSS 主题
├── postcss.config.js         # PostCSS 配置
└── resources/                # 应用图标
```

---

## 3. 技术架构

### 3.1 进程模型

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  • 窗口管理 (BrowserWindow)                             │
│  • IPC 处理器 (ipcMain.handle)                         │
│  • PTY 进程管理 (node-pty)                             │
│  • Git 操作 (simple-git)                                │
│  • 文件系统操作                                         │
│  • 数据持久化 (electron-store)                          │
│  • 第三方应用检测                                        │
└─────────────────────────────────────────────────────────┘
                          │ IPC
┌─────────────────────────────────────────────────────────┐
│                    Preload Script                        │
│  • contextBridge 暴露安全 API                           │
│  • window.api 命名空间                                   │
└─────────────────────────────────────────────────────────┘
                          │ contextBridge
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                       │
│  • React UI (src/renderer/src/)                         │
│  • xterm.js 终端                                         │
│  • Zustand 状态管理                                      │
│  • 无法直接访问 Node.js                                  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 IPC API 架构

Preload 脚本通过 `contextBridge` 暴露 `window.api`，分为以下命名空间：

| 命名空间 | 方法 | 说明 |
|---------|------|------|
| **store** | `get(key)` / `set(key, value)` | 持久化存储 |
| **dialog** | `openDirectory()` | 打开原生目录选择器 |
| **git** | `isRepo()`, `getRepoName()`, `getCurrentBranch()`, `listWorktrees()`, `addWorktree()`, `removeWorktree()`, `getBranches()`, `merge()` | Git 操作 |
| **pty** | `create()`, `write()`, `resize()`, `kill()`, `getBuffer()`, `onData()`, `onExit()` | 终端操作 |
| **app** | `openExternal()`, `detectInstalledApps()` | 外部应用 |
| **fs** | `exists()` | 文件系统检查 |
| **path** | `dirname()` | 路径操作 |

### 3.3 窗口配置

```typescript
// src/main/index.ts:131-147
{
  width: 1200,
  height: 800,
  minWidth: 960,
  minHeight: 600,
  show: false,
  titleBarStyle: 'hiddenInset',    // macOS 标题栏样式
  trafficLightPosition: { x: 15, y: 12 },
  backgroundColor: '#0D1117',
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,               // node-pty 需要
    nodeIntegration: false,        // 始终 false
    contextIsolation: true        // 始终 true
  }
}
```

**为什么 sandbox: false?**
node-pty 是一个原生 Node.js 模块，需要直接访问系统 PTY。Electron 的 sandbox 模式会阻止这种访问，因此 preload 脚本必须运行在非沙盒模式。

---

## 4. 核心模块详解

### 4.1 主进程 (src/main/index.ts)

**职责**:
- 创建和管理 BrowserWindow
- 注册所有 IPC 处理器
- 管理 PTY 进程生命周期
- 执行 Git 操作
- 检测已安装的开发者应用
- 持久化数据

**关键实现**:

**PTY 进程管理**:
```typescript
// src/main/index.ts:346-394
// 每个 PTY 进程有唯一 ID，存储在 Map 中
const ptyProcesses = new Map<string, PtyProcess>()

// 创建时清理环境变量，防止嵌套会话问题
const cleanEnv = { ...process.env }
delete cleanEnv.CLAUDECODE
delete cleanEnv.CLASP_SOCKET_PATH
delete cleanEnv.CLAUDE_SESSION_PATH
```

**Git Worktree 解析**:
```typescript
// src/main/index.ts:254-277
// 解析 `git worktree list --porcelain` 输出
const blocks = result.trim().split('\n\n')
for (const block of blocks) {
  const lines = block.split('\n')
  const wtPath = lines.find(l => l.startsWith('worktree '))?.replace('worktree ', '')
  const branch = lines.find(l => l.startsWith('branch '))?.replace('branch ', '').replace('refs/heads/', '')
}
```

**第三方应用检测**:
```typescript
// src/main/index.ts:68-110
// 扫描 /Applications 目录，匹配 26 种已知开发者应用
// 使用 app.getFileIcon() 提取应用图标（Base64 编码）
const KNOWN_DEV_APPS = [
  { bundleName: 'Visual Studio Code.app', id: 'vscode', ... },
  { bundleName: 'Cursor.app', id: 'cursor', ... },
  // ... 共 26 种
]
```

### 4.2 预加载脚本 (src/preload/index.ts)

**职责**: 在渲染进程和安全的主进程之间建立桥接。

```typescript
// 通过 contextBridge 暴露类型安全的 API
contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api  // 导出类型供渲染进程使用
```

**API 类型定义** (供渲染进程使用):
```typescript
declare global {
  interface Window {
    api: Api
  }
}
```

### 4.3 渲染进程 (src/renderer/src/)

#### 4.3.1 组件结构

```
components/
├── Layout/
│   ├── AppLayout.tsx       # 整体布局容器
│   ├── AppHeader.tsx      # 顶部栏（面包屑、CapsuleButton、设置按钮）
│   ├── StatusBar.tsx      # 底部状态栏
│   └── ToastContainer.tsx # Toast 通知容器
├── Sidebar/
│   ├── Sidebar.tsx        # 侧边栏容器
│   ├── RepoItem.tsx       # 仓库列表项
│   ├── WorktreeItem.tsx   # Worktree 列表项
│   └── AddRepoButton.tsx  # 添加仓库按钮
├── Terminal/
│   ├── TerminalPanel.tsx      # 终端面板容器
│   ├── TerminalToolbar.tsx    # 终端工具栏
│   ├── CapsuleButton.tsx       # 胶囊按钮组件
│   ├── QuickButtonsBar.tsx     # 快速命令栏
│   ├── CommandInput.tsx        # 命令输入框
│   └── TerminalLogModal.tsx    # 终端日志模态框
├── Dialogs/
│   ├── ConfirmDialog.tsx       # 确认对话框
│   └── MergeDialog.tsx         # Merge 操作对话框
└── Settings/
    └── SettingsPage.tsx        # 设置页面
```

#### 4.3.2 状态管理 (Zustand)

**repoStore** — 仓库和 Worktree 状态
```typescript
// src/renderer/src/stores/repoStore.ts
interface RepoState {
  repos: Repo[]
  selectedRepoId: string | null
  selectedWorktreeId: string | null
  loading: boolean

  loadRepos: () => Promise<void>
  addRepo: () => Promise<void>
  removeRepo: (repoId: string) => Promise<void>
  createWorktree: (repoId: string) => Promise<void>
  archiveWorktree: (repoId: string, worktreeId: string) => Promise<void>
  selectRepo: (repoId: string) => void
  selectWorktree: (repoId: string, worktreeId: string) => void
  refreshWorktrees: (repoId: string) => Promise<void>
}
```

**settingsStore** — 设置和外部应用状态
```typescript
interface SettingsState {
  externalApps: ExternalApp[]
  lastExternalApp: string
  quickButtons: QuickButton[]
  settingsOpen: boolean

  loadSettings: () => Promise<void>
  setLastExternalApp: (appId: string) => void
  toggleSettings: () => void
}
```

**toastStore** — Toast 通知状态
```typescript
interface ToastState {
  toasts: Toast[]
  addToast: (type: ToastType, message: string) => void
  removeToast: (id: string) => void
}
// Toast 自动 4 秒后消失
```

### 4.4 数据模型 (TypeScript)

```typescript
// src/renderer/src/types/index.ts

interface Repo {
  id: string
  name: string
  path: string           // 仓库路径
  addedAt: number        // 添加时间戳
  worktrees: Worktree[]
}

interface Worktree {
  id: string
  repoId: string          // 所属仓库 ID
  branch: string          // 分支名
  path: string            // worktree 路径
  status: 'active' | 'archived'
  createdAt: number
}

interface ExternalApp {
  id: string
  name: string
  command: string         // 启动命令
  icon: string            // Lucide 图标名
  iconBase64?: string     // 应用图标（Base64）
  installed?: boolean
}

interface QuickButton {
  id: string
  title: string
  content: string         // 命令内容
  autoEnter: boolean      // 是否自动回车
}

interface MergeConfig {
  repoPath: string
  sourceBranch: string
  targetBranch: string
  strategy: 'merge' | 'rebase' | 'squash'
}
```

---

## 5. UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│ AppHeader                                                     │
│ [拖拽区域] [面包屑路径] ─── CapsuleButton ─── [时间] [⚙️]      │
├─────────────┬────────────────────────────────────────────────┤
│ Sidebar     │ TerminalPanel                                  │
│ (240px)     │ ┌────────────────────────────────────────────┐ │
│             │ │ PathBar │ [Finder] │ [Open in App]         │ │
│ 📁 Repo A   │ ├────────────────────────────────────────────┤ │
│   ├─ �branch1│ │                                            │ │
│   └─ �branch2│ │  xterm.js Terminal                        │ │
│ 📁 Repo B   │ │  (每个 worktree 一个终端实例)              │ │
│             │ │                                            │ │
│             │ ├────────────────────────────────────────────┤ │
│ [+ 添加仓库] │ │ QuickButtonsBar (可展开)                   │ │
│             │ ├────────────────────────────────────────────┤ │
│             │ │ TerminalToolbar: [↩️ 回车] [📜 显示日志]   │ │
│             │ └────────────────────────────────────────────┘ │
├─────────────┴────────────────────────────────────────────────┤
│ StatusBar: [main] [/path/to/repo] ─── 3 repos │ 7 worktrees │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. 主题设计

**深色主题**（不可更改）

| CSS 变量 | 值 | 用途 |
|----------|-----|------|
| `--color-bg-primary` | `#0D1117` | 主背景 |
| `--color-bg-secondary` | `#161B22` | 侧边栏、卡片 |
| `--color-bg-tertiary` | `#1C2128` | 三级背景 |
| `--color-bg-elevated` | `#21262D` | 浮层背景 |
| `--color-accent` | `#1A56DB` | 主操作按钮 |
| `--color-accent-hover` | `#1E63F0` | 按钮悬停 |
| `--color-text-primary` | `#E6EDF3` | 主文字 |
| `--color-text-secondary` | `#8B949E` | 次要文字 |
| `--color-text-muted` | `#484F58` | 禁用/占位符 |
| `--color-border` | `#30363D` | 边框 |
| `--color-success` | `#3FB950` | 成功状态 |
| `--color-warning` | `#D29922` | 警告状态 |
| `--color-danger` | `#F85149` | 危险/错误 |
| `--color-terminal-bg` | `#1e1e1e` | 终端背景 |

**字体**:
- UI: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
- 终端: `'JetBrains Mono', 'SF Mono', 'Consolas', 'Menlo', monospace`

---

## 7. 核心功能流程

### 7.1 添加仓库

```
用户点击"添加仓库"
    ↓
window.api.dialog.openDirectory()  →  打开 macOS 目录选择器
    ↓
window.api.git.isRepo(dir)         →  验证是否为 Git 仓库
    ↓
window.api.git.listWorktrees(dir)  →  获取现有 worktrees
    ↓
存入 repoStore，更新 electron-store
```

### 7.2 创建 Worktree

```
用户点击仓库的"创建 Worktree"
    ↓
获取当前分支名 → 生成目录名 (e.g., feature-abc123)
    ↓
window.api.git.addWorktree(repoPath, newBranch, targetDir, baseBranch)
    ↓
执行 `git worktree add -b <branch> <path> <base>`
    ↓
如果失败，回退到 `git worktree add --detach <path> <base>`
    ↓
更新 repoStore，重新渲染 UI
```

### 7.3 归档 Worktree

```
用户点击 worktree 的"归档"
    ↓
window.api.git.removeWorktree(repoPath, worktreePath)
    ↓
执行 `git worktree remove <path> --force`
    ↓
UI 标记为 archived（不删除磁盘文件）
```

### 7.4 终端操作

```
选择 worktree 时
    ↓
window.api.pty.create(id, cwd)  →  创建 PTY 进程
    ↓
xterm.js 渲染终端界面
    ↓
用户输入 → window.api.pty.write(id, data)  →  PTY 写入
    ↓
PTY 输出 → window.api.pty.onData(id, callback)  →  xterm.js 渲染
```

---

## 8. 构建与发布

### 8.1 开发模式

```bash
pnpm run dev      # 启动 electron-vite 开发服务器
```

### 8.2 构建

```bash
pnpm run build    # electron-vite build
pnpm run dist     # build + electron-builder
pnpm run dist:mac # macOS .dmg 包
```

### 8.3 输出

- 临时构建: `out/` 目录
- 最终包: `release/` 目录

---

## 9. 安全模型

| 配置 | 值 | 说明 |
|------|-----|------|
| `contextIsolation` | `true` | 渲染进程与 Node.js 隔离 |
| `nodeIntegration` | `false` | 不暴露 Node.js API |
| `sandbox` | `false` | preload 脚本需要（node-pty） |
| IPC 通信 | `ipcMain.handle/invoke` | 双向异步调用 |
| `shell.openExternal` | 仅限主动导航 | 防止链接注入 |

**数据持久化**: electron-store，仅存储 UI 状态（repos 列表、选中项等），不存储敏感信息。

---

## 10. 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                      Dependencies                            │
├─────────────────────────────────────────────────────────────┤
│  @xterm/xterm  →  @xterm/addon-fit  →  @xterm/addon-search  │
│       ↓                                                       │
│  node-pty  ←  simple-git  ←  electron-store                 │
│       ↓                                                       │
│  zustand  ←  lucide-react                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. 常见问题

**Q: 为什么终端中文显示乱码？**
A: PTY 环境变量设置了 `LANG=en_US.UTF-8`。如果需要中文支持，可改为 `LANG=zh_CN.UTF-8`，但可能影响某些命令输出。

**Q: 如何添加新的外部应用检测？**
A: 在 `src/main/index.ts` 的 `KNOWN_DEV_APPS` 数组中添加条目：
```typescript
{ bundleName: 'AppName.app', id: 'appid', name: 'App Name', command: 'open -a AppName', icon: 'icon-name', category: 'editor' }
```

**Q: worktree 目录命名规则是什么？**
A: `{当前分支名}-{6位随机字符}`，例如 `feature-login-a3f7k2`。定义在 `src/renderer/src/utils/helpers.ts` 的 `generateWorktreeDirName()`。

**Q: 为什么删除 worktree 只是标记为 archived？**
A: 为了安全起见，应用只执行 `git worktree remove --force`，这会删除 worktree 的 git 关联但保留工作目录。真正的文件删除由用户自行决定。

---

## 12. 快速开发指南

### 12.1 添加新 IPC 处理器

1. 在 `src/preload/index.ts` 添加方法：
```typescript
git: {
  myNewMethod: (arg: string) => ipcRenderer.invoke('git:myNewMethod', arg)
}
```

2. 在 `src/main/index.ts` 添加 handler：
```typescript
ipcMain.handle('git:myNewMethod', async (_e, arg: string) => {
  // 实现
})
```

### 12.2 添加新 UI 组件

1. 在 `src/renderer/src/components/` 创建目录
2. 在父组件中导入使用
3. 组件使用 Tailwind CSS 样式

### 12.3 添加新状态

1. 在 `src/renderer/src/types/index.ts` 定义接口
2. 在 `src/renderer/src/stores/` 创建或扩展 store
3. 通过 `window.api.store.get/set` 持久化

---

## 13. 文件索引

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| `src/main/index.ts` | 471 | 主进程、IPC、PTY、Git |
| `src/preload/index.ts` | 60 | API 桥接 |
| `src/renderer/src/App.tsx` | 16 | React 根组件 |
| `src/renderer/src/stores/repoStore.ts` | 271 | 仓库/WT 状态管理 |
| `src/renderer/src/stores/settingsStore.ts` | - | 设置状态管理 |
| `src/renderer/src/stores/toastStore.ts` | - | Toast 通知 |
| `src/renderer/src/types/index.ts` | 40 | 类型定义 |
| `src/renderer/src/utils/helpers.ts` | - | 工具函数 |
| `electron.vite.config.ts` | 26 | 构建配置 |
