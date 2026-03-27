# Claude Code 任务通知设计文档

**日期**: 2026-03-27
**状态**: 已确认（v2，修复审核问题）

---

## 1. 功能目标

当 ccw 内任意终端 session 运行 Claude Code 完成任务（Stop hook）或需要用户操作（Notification hook）时，在左侧 Sidebar 的对应 WorktreeItem 上显示视觉提醒：绿色呼吸光晕 + 右侧灰色数字 badge。用户点击该 worktree 条目后通知清除。

**核心约束**：不修改用户的 `~/.claude/settings.json`，全程临时注入。

---

## 2. 整体架构

```
App 启动
  └─ 主进程启动 HTTP server (127.0.0.1:随机端口)
  └─ 写出 ~/.ccw/bin/claude          (wrapper script)
  └─ 写出 ~/.ccw/bin/ccw-hook        (hook handler script)
  └─ 写出 ~/.ccw/zdotdir/.zshrc      (ZDOTDIR shell integration)
  └─ 写出 ~/.ccw/shell-integration.zsh

用户选择 Worktree → TerminalPanel 调用 pty:create(id, cwd, worktreeId)
  └─ PTY env 注入 CCW_WORKTREE_ID、CCW_HOOK_PORT、ZDOTDIR、CCW_ORIG_ZDOTDIR
  └─ zsh 自动 source ~/.ccw/zdotdir/.zshrc
  └─ PATH 最前面加入 ~/.ccw/bin

用户在终端输入 claude ...
  └─ ~/.ccw/bin/claude wrapper 拦截
  └─ 检测到 CCW_WORKTREE_ID → 写临时文件 /tmp/ccw-hooks-<pid>.json
  └─ exec real_claude --settings /tmp/ccw-hooks-<pid>.json （临时，不改 settings.json）
  └─ claude 退出后临时文件由 trap 自动清理

Claude Code 触发 Stop / Notification hook
  └─ 运行 ~/.ccw/bin/ccw-hook <type>
  └─ 读取 stdin JSON → curl POST http://127.0.0.1:CCW_HOOK_PORT/hook
  └─ 主进程 HTTP handler → win.webContents.send('ccw:notification', payload)

渲染进程 notificationStore
  └─ onNotification 回调：检查 selectedWorktreeId，若匹配则忽略
  └─ 否则 setNotification(worktreeId) → count +1
  └─ WorktreeItem 读取 store → 显示呼吸动画 + 数字 badge

用户点击 WorktreeItem
  └─ clearNotification(worktreeId) → 动画 + 数字消失
```

---

## 3. 文件改动清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/ccwHookServer.ts` | HTTP server + 脚本写出逻辑 |
| `src/renderer/src/stores/notificationStore.ts` | Zustand 通知状态管理 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/main/index.ts` | app ready 时初始化 hook server；`pty:create` 增加 `worktreeId` 参数并注入 env；`window-all-closed` 时关闭 HTTP server |
| `src/preload/index.ts` | 暴露 `onNotification` IPC 监听方法（返回 disposer）；**`pty.create` wrapper 签名更新为 `(id, cwd, worktreeId)`** |
| `src/renderer/src/components/Sidebar/WorktreeItem.tsx` | 读取 notificationStore，显示呼吸动画 + badge |
| `src/renderer/src/components/Terminal/TerminalPanel.tsx` | `createTerminalInstance` 和 `handleAddSession` 两处调用均传入 `worktreeId` |
| `src/renderer/src/index.css` | 新增 `@keyframes ccw-breathe` 和 `.dot-notif-active` |

---

## 4. 详细实现

### 4.1 ccwHookServer.ts

**职责**：
1. 启动本地 HTTP server，监听随机端口，绑定 `127.0.0.1`
2. 处理 `POST /hook` 请求，通过 IPC 发送到渲染进程
3. App 启动时写出脚本文件（幂等，内容不变则跳过，写出后 `chmod +x`）
4. 导出 `port` 供 `pty:create` 使用，导出 `closeServer()` 供退出时调用

```typescript
import http from 'http'
import { AddressInfo } from 'net'

let server: http.Server | null = null
let _port = 0

export function startHookServer(
  onNotification: (payload: { worktreeId: string; type: string }) => void
): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/hook') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const payload = JSON.parse(body)
            onNotification({ worktreeId: payload.worktreeId, type: payload.type })
          } catch { /* ignore malformed */ }
          res.writeHead(200)
          res.end('OK')
        })
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    server.listen(0, '127.0.0.1', () => {
      _port = (server!.address() as AddressInfo).port
      resolve(_port)
    })
  })
}

export function closeHookServer(): void {
  server?.close()
  server = null
}
```

**`window-all-closed` 和 `before-quit` 处理**：`closeHookServer()` 注册在 `app.on('before-quit')` 而非 `window-all-closed`——在 macOS 上关闭最后一个窗口时 app 仍保持存活，只有 `before-quit`/`will-quit` 才真正对应应用退出。

### 4.2 写出的脚本内容

**`~/.ccw/shell-integration.zsh`**：
```bash
# 把 ~/.ccw/bin 加到 PATH 最前（幂等）
[[ ":$PATH:" != *":$HOME/.ccw/bin:"* ]] && export PATH="$HOME/.ccw/bin:$PATH"
```

**`~/.ccw/zdotdir/.zshrc`**（使用 `CCW_ORIG_ZDOTDIR` 安全恢复原始 ZDOTDIR）：
```bash
# 恢复用户原始 ZDOTDIR（若用户未设置则默认 $HOME）
_ccw_orig="${CCW_ORIG_ZDOTDIR:-$HOME}"
ZDOTDIR="$_ccw_orig"
unset _ccw_orig

# source 用户原有 .zshrc
[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"

# 注入 ccw shell integration
[[ -f "$HOME/.ccw/shell-integration.zsh" ]] && source "$HOME/.ccw/shell-integration.zsh"
```

**`~/.ccw/bin/claude`**（wrapper script，`--settings` 使用临时文件）：
```bash
#!/usr/bin/env bash

# 找真实 claude（跳过自身目录）
find_real_claude() {
  local self_dir
  self_dir="$(cd "$(dirname "$0")" && pwd)"
  local IFS=:
  for d in $PATH; do
    [[ "$d" == "$self_dir" ]] && continue
    [[ -x "$d/claude" ]] && printf '%s' "$d/claude" && return 0
  done
  return 1
}

REAL_CLAUDE=$(find_real_claude) || { echo "Error: claude not found" >&2; exit 127; }

# 不在 ccw 中 → 直接透传
[[ -z "$CCW_WORKTREE_ID" || -z "$CCW_HOOK_PORT" ]] && exec "$REAL_CLAUDE" "$@"

# 跳过不支持 --settings 的子命令
case "${1:-}" in
  mcp|config|api-key|rc|remote-control) exec "$REAL_CLAUDE" "$@" ;;
esac

# 写临时 JSON 文件（--settings 接受文件路径）
HOOKS_TMP="$(mktemp /tmp/ccw-hooks-XXXXXX.json)"
trap 'rm -f "$HOOKS_TMP"' EXIT

cat > "$HOOKS_TMP" <<'EOF'
{
  "hooks": {
    "Stop": [{"matcher":"","hooks":[{"type":"command","command":"ccw-hook stop","timeout":10}]}],
    "Notification": [{"matcher":"","hooks":[{"type":"command","command":"ccw-hook notification","timeout":10}]}]
  }
}
EOF

exec "$REAL_CLAUDE" --settings "$HOOKS_TMP" "$@"
```

**`~/.ccw/bin/ccw-hook`**（hook handler，使用 `jq` 安全构建 JSON，jq 不存在则回退简单拼接）：
```bash
#!/usr/bin/env bash
INPUT=$(cat)
TYPE="${1:-stop}"
PORT="${CCW_HOOK_PORT:-}"
WT_ID="${CCW_WORKTREE_ID:-}"

[[ -z "$PORT" || -z "$WT_ID" ]] && exit 0

# 安全构建 JSON payload
if command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n --arg type "$TYPE" --arg wid "$WT_ID" '{type:$type,worktreeId:$wid}')"
else
  # worktreeId 由 app 内部生成，为字母数字加连字符，安全拼接
  PAYLOAD="{\"type\":\"$TYPE\",\"worktreeId\":\"$WT_ID\"}"
fi

curl -s -X POST "http://127.0.0.1:$PORT/hook" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 3 \
  >/dev/null 2>&1 || true
```

### 4.3 PTY 创建改动（src/main/index.ts）

`pty:create` handler 增加第三个参数 `worktreeId`，并注入 `CCW_ORIG_ZDOTDIR`：

```typescript
ipcMain.handle('pty:create', (_e, id: string, cwd: string, worktreeId: string) => {
  // ...existing env cleanup...
  const origZdotdir = process.env.ZDOTDIR || ''   // 保留用户原始 ZDOTDIR
  const pty = ptyModule.spawn(shell, ['--login'], {
    env: {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      TERM_PROGRAM: 'vscode',
      LANG: process.env.LANG || 'en_US.UTF-8',
      // ccw 通知相关
      CCW_WORKTREE_ID: worktreeId,
      CCW_HOOK_PORT: String(hookServerPort),
      ZDOTDIR: path.join(os.homedir(), '.ccw', 'zdotdir'),
      CCW_ORIG_ZDOTDIR: origZdotdir || os.homedir(),
    }
  })
})
```

### 4.4 TerminalPanel.tsx 改动

`createTerminalInstance` 和 `handleAddSession` 两处均需传入 `worktreeId`。

`createTerminalInstance` 已有 `wtId` 参数，直接透传：

```typescript
// 调用改为：
await window.api.pty.create(ptyId, cwd, wtId)
```

`handleAddSession` 同样使用当前 `wtId`：

```typescript
const terminal = await createTerminalInstance(wtId, currentCwd, sessionIdx)
// 内部调用 window.api.pty.create(ptyId, cwd, wtId) — 已覆盖
```

### 4.5 notificationStore.ts

使用 `Record<string, number>` 而非 `Map`（与现有 store 模式一致，Zustand 浅比较友好）：

```typescript
import { create } from 'zustand'
import { useRepoStore } from './repoStore'

interface NotificationState {
  notifications: Record<string, number>   // worktreeId → count
  addNotification: (worktreeId: string) => void
  clearNotification: (worktreeId: string) => void
  getCount: (worktreeId: string) => number
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: {},

  addNotification: (worktreeId) => {
    // 若该 worktree 当前已选中，忽略通知
    const selected = useRepoStore.getState().selectedWorktreeId
    if (selected === worktreeId) return

    set((s) => ({
      notifications: {
        ...s.notifications,
        [worktreeId]: (s.notifications[worktreeId] ?? 0) + 1,
      },
    }))
  },

  clearNotification: (worktreeId) => {
    set((s) => {
      const next = { ...s.notifications }
      delete next[worktreeId]
      return { notifications: next }
    })
  },

  getCount: (worktreeId) => get().notifications[worktreeId] ?? 0,
}))

// IPC 监听（模块级单例，返回 disposer 供测试或 HMR 清理）
export function initNotificationListener(): () => void {
  return window.api.notification.onNotification(({ worktreeId }) => {
    useNotificationStore.getState().addNotification(worktreeId)
  })
}
```

`initNotificationListener()` 在 `src/renderer/src/main.tsx` 应用启动时调用一次，返回值不需要保存（生产环境为单例，App 生命周期内不释放）。

### 4.6 Preload 改动（src/preload/index.ts）

与现有 `pty.onData` / `pty.onExit` 模式一致，返回 disposer：

```typescript
notification: {
  onNotification: (cb: (payload: { worktreeId: string; type: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { worktreeId: string; type: string }) => cb(payload)
    ipcRenderer.on('ccw:notification', handler)
    return () => ipcRenderer.removeListener('ccw:notification', handler)
  }
},
// pty.create 签名同步更新：
pty: {
  create: (id: string, cwd: string, worktreeId: string) =>
    ipcRenderer.invoke('pty:create', id, cwd, worktreeId),
  // ...其他方法不变
}
```

### 4.7 WorktreeItem.tsx 改动

```tsx
const count = useNotificationStore((s) => s.notifications[worktree.id] ?? 0)
const clearNotification = useNotificationStore((s) => s.clearNotification)

// 点击时清除
onClick={() => {
  if (!isArchived && !isRenaming) {
    selectWorktree(repoId, worktree.id)
    if (count > 0) clearNotification(worktree.id)
  }
}}

// 状态点：有通知时添加呼吸动画 class
<div
  className={count > 0 && !isArchived ? 'dot-notif-active' : ''}
  style={{
    width: 7, height: 7, borderRadius: '50%',
    background: isArchived ? 'var(--t4)'
      : isSelected ? 'var(--orange, #c88832)'
      : 'var(--color-success)',
    boxShadow: isSelected ? '0 0 5px rgba(200,136,50,0.45)' : undefined,
  }}
/>

// 右侧 badge（有通知且未归档时显示）
{count > 0 && !isArchived && (
  <span style={{
    fontSize: 10,
    lineHeight: 1,
    color: '#8B949E',
    background: 'rgba(139,148,158,0.15)',
    borderRadius: 7,
    padding: '1px 4px',
    minWidth: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }}>
    {count}
  </span>
)}
```

### 4.8 index.css 新增

```css
@keyframes ccw-breathe {
  0%   { box-shadow: 0 0 0 0px rgba(63, 185, 80, 0.0); }
  40%  { box-shadow: 0 0 0 4px rgba(63, 185, 80, 0.35); }
  70%  { box-shadow: 0 0 0 6px rgba(63, 185, 80, 0.0); }
  100% { box-shadow: 0 0 0 0px rgba(63, 185, 80, 0.0); }
}

.dot-notif-active {
  animation: ccw-breathe 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

---

## 5. UI 行为规则

| 场景 | 表现 |
|------|------|
| 1 个 session 完成 | 绿色呼吸动画 + 右侧灰色数字 **1** |
| N 个 session 完成 | 绿色呼吸动画 + 右侧灰色数字 **N** |
| 点击该 worktree | 动画停止，数字消失，恢复静止绿点 |
| worktree 已归档 | 不显示通知（跳过，opacity 0.4 状态下） |
| worktree 当前已选中 | `addNotification` 内检查 `repoStore.selectedWorktreeId`，匹配则忽略，不累计 |

---

## 6. 文件写出时机与幂等性

- App `ready` 事件后执行，写出前校验内容是否一致，相同则跳过
- `~/.ccw/bin/` 下脚本写出后执行 `fs.chmodSync(path, 0o755)`
- HTTP server 端口每次 App 启动随机分配，通过 `CCW_HOOK_PORT` env var 传入 PTY
- `ZDOTDIR` 覆写通过 `CCW_ORIG_ZDOTDIR` 安全传递用户原始值（支持自定义 ZDOTDIR 用户）
- App 退出时调用 `closeHookServer()` 关闭 HTTP server

---

## 7. 不在范围内

- bash 用户的 shell integration（当前只支持 zsh）
- macOS 系统通知（UNNotification）
- 通知持久化（App 重启后清空）
