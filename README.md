# ccw — Git Worktree 可视化管理工具

面向开发者的 Git Worktree 可视化管理客户端，降低 Worktree 使用门槛，提升多分支并行开发效率。

## 功能特性

### 核心功能 (M1)
- **Repo 管理** — 添加、展示、删除本地 Git 仓库
- **Worktree 创建** — 基于当前分支一键创建 Worktree，自动生成随机目录名
- **Worktree 归档** — 执行 `git worktree remove` 移除 Worktree
- **内嵌终端** — 右侧面板嵌入完整终端（xterm.js + node-pty），支持彩色输出、光标控制
- **多 Repo 支持** — 左侧列表同时管理多个 Git 仓库

### 进阶功能 (M2)
- **胶囊快捷入口** — 快速在 VS Code、Cursor、iTerm2 等外部软件中打开当前 Worktree
- **终端日志查看** — 弹窗展示最近 500 行终端历史，支持搜索高亮、一键复制
- **快捷命令输入** — 底部 Enter 区域快速向终端追加命令

### 协作功能 (M3)
- **PR / 合并** — 将当前 Worktree 变更合并至源 Repo 分支，支持 Merge / Rebase / Squash
- **已归档展示** — 已归档 Worktree 以置灰样式显示
- **设置页** — 自定义外部应用列表

### 体验优化 (M4)
- **快捷键** — `Cmd+N` 新建 Worktree，`Cmd+,` 打开设置
- **深色主题** — 与 IDE 风格一致的深色界面
- **状态栏** — 底部显示当前分支、路径、仓库/Worktree 统计

### Claude Code 通知集成

CCW 在运行时会自动向 Claude Code 的全局配置文件注入 hooks，实现任务完成时侧边栏工作树呼吸灯提醒：

- **自动注入**：启动时向 `~/.claude/settings.json` 添加 `Stop` 和 `Notification` hooks
- **自动清理**：正常退出时会自动移除注入的配置
- **零 PATH 侵入**：不使用 wrapper 拦截，不修改 shell 配置，不依赖 PATH 顺序

> ⚠️ **卸载注意事项**：若 CCW 异常退出（崩溃/强制退出），hooks 可能残留。卸载前请手动检查并清理，详见下方「卸载与清理」章节。

## 技术栈

| 模块 | 技术 |
|------|------|
| 桌面框架 | Electron 34 |
| UI 框架 | React 19 + TypeScript |
| 终端组件 | @xterm/xterm + node-pty |
| 状态管理 | Zustand 5 |
| 样式方案 | Tailwind CSS 4 |
| Git 操作 | simple-git |
| 本地存储 | electron-store |
| 图标库 | Lucide React |
| 构建工具 | electron-vite + Vite 6 |

## 快速开始

### 前置要求

- macOS 12+
- Node.js 18+
- Git 2.17+
- Python 3（用于编译 node-pty 原生模块）

### 安装与运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 打包 macOS 应用
npm run dist:mac
```

### 遇到 node-pty 编译问题？

如果遇到 `ModuleNotFoundError: No module named 'distutils'`，需要安装 Python setuptools：

```bash
pip3 install --break-system-packages setuptools
npx electron-builder install-app-deps
```

## 项目结构

```
ccw/
├── src/
│   ├── main/index.ts              # Electron 主进程（IPC、PTY、Git 操作）
│   ├── preload/index.ts           # Preload 脚本（安全 IPC 桥接）
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx           # React 入口
│           ├── App.tsx            # 根组件
│           ├── index.css          # 全局样式 + 主题变量
│           ├── components/
│           │   ├── Layout/        # 布局：AppLayout, AppHeader, StatusBar
│           │   ├── Sidebar/       # 侧边栏：Sidebar, RepoItem, WorktreeItem
│           │   ├── Terminal/      # 终端：TerminalPanel, CapsuleButton, CommandInput
│           │   ├── Dialogs/       # 对话框：ConfirmDialog, MergeDialog
│           │   └── Settings/      # 设置页
│           ├── stores/            # Zustand 状态管理
│           ├── types/             # TypeScript 类型定义
│           └── utils/             # 工具函数
├── electron.vite.config.ts        # electron-vite 配置
├── package.json
├── tsconfig.json
└── tsconfig.node.json / tsconfig.web.json
```

## 界面设计

采用经典两栏布局，深色主题：

- **左侧面板**（240px）：Repo 列表 + Worktree 树形列表
- **右侧主区域**：顶部工具栏 + 内嵌终端 + 底部操作栏
- **顶部导航**：面包屑路径 + 时间 + 设置
- **底部状态栏**：分支 + 路径 + 统计

### 主题色

| 用途 | 色值 |
|------|------|
| 主背景 | `#0D1117` |
| 侧边栏 | `#161B22` |
| 强调色 | `#1A56DB` |
| 文字主色 | `#E6EDF3` |
| 文字次色 | `#8B949E` |
| 边框 | `#30363D` |
| 成功 | `#3FB950` |
| 警告 | `#D29922` |
| 危险 | `#F85149` |

## 安全性

- 删除 Repo 操作仅从应用数据库移除记录，不删除磁盘文件
- 归档 Worktree 操作前必须二次确认
- PR/合并操作仅支持本地 merge，不对接远程 API

## 兼容性

- macOS 12+（Monterey 及以上）
- Git 2.17+

## 卸载与清理

CCW 在运行时会对系统进行以下修改，卸载前请手动清理：

| 路径/文件 | 修改内容 | 清理方式 |
|-----------|----------|----------|
| `~/.claude/settings.json` | 注入 `Stop` / `Notification` hooks | 删除包含 `__ccw__` 的 hooks 条目，或整个 `hooks` 字段（如不再需要） |
| `~/.ccw/` | 存放 registry.json、ccw-hook 脚本 | 删除整个目录：`rm -rf ~/.ccw` |

**手动清理命令：**

```bash
# 1. 清理 Claude Code settings.json 中的 CCW hooks
python3 -c "
import json, os
p = os.path.expanduser('~/.claude/settings.json')
try:
    with open(p) as f: d = json.load(f)
    if 'hooks' in d:
        for k in list(d['hooks'].keys()):
            d['hooks'][k] = [e for e in d['hooks'][k] if '__ccw__' not in json.dumps(e)]
            if not d['hooks'][k]: del d['hooks'][k]
        if not d['hooks']: del d['hooks']
    with open(p, 'w') as f: json.dump(d, f, indent=2)
    print('已清理 settings.json')
except Exception as e: print('跳过:', e)
"

# 2. 删除 CCW 配置目录
rm -rf ~/.ccw
```

## License

MIT
>>>>>>> 5e9d29e (mm)
