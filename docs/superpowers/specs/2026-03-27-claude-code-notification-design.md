# Claude Code 任务通知设计文档

**日期**: 2026-03-27
**状态**: 已确认

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
  └─ PTY env 注入 CCW_WORKTREE_ID、CCW_HOOK_PORT、ZDOTDIR
  └─ zsh 自动 source ~/.ccw/zdotdir/.zshrc
  └─ PATH 最前面加入 ~/.ccw/bin

用户在终端输入 claude ...
  └─ ~/.ccw/bin/claude wrapper 拦截
  └─ 检测到 CCW_WORKTREE_ID → exec real_claude --settings HOOKS_JSON
  └─ HOOKS_JSON 注入 Stop + Notification hooks（临时，不改 settings.json）

Claude Code 触发 Stop / Notification hook
  └─ 运行 ~/.ccw/bin/ccw-hook <type>
  └─ 读取 stdin JSON → curl POST http://127.0.0.1:CCW_HOOK_PORT/hook
  └─ 主进程 HTTP handler → win.webContents.send('ccw:notification', payload)

渲染进程 notificationStore
  └─ setNotification(worktreeId) → count +1
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
| `src/main/index.ts` | app ready 时初始化 hook server；`pty:create` 增加 `worktreeId` 参数并注入 env |
| `src/preload/index.ts` | 暴露 `onNotification` IPC 监听方法 |
| `src/renderer/src/components/Sidebar/WorktreeItem.tsx` | 读取 notificationStore，显示呼吸动画 + badge |
| `src/renderer/src/components/Terminal/TerminalPanel.tsx` | `pty:create` 调用传入 `worktreeId` |

---

## 4. 详细实现

### 4.1 ccwHookServer.ts

**职责**：
1. 启动本地 HTTP server，监听随机端口
2. 处理 `POST /hook` 请求，解析 `worktreeId` + `type`，通过 IPC 发送到渲染进程
3. App 启动时写出以下文件（幂等，内容不变则跳过）：
   - `~/.ccw/bin/claude`
   - `~/.ccw/bin/ccw-hook`
   - `~/.ccw/zdotdir/.zshrc`
   - `~/.ccw/shell-integration.zsh`

**HTTP server**：
```typescript
// 监听随机端口，绑定 127.0.0.1
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/hook') {
    // 读取 body → 解析 { type, worktreeId }
    // win.webContents.send('ccw:notification', { worktreeId, type })
    res.end('OK')
  }
})
server.listen(0, '127.0.0.1')
const port = (server.address() as AddressInfo).port
```

### 4.2 写出的脚本内容

**`~/.ccw/shell-integration.zsh`**：
```bash
# 把 ~/.ccw/bin 加到 PATH 最前（幂等）
[[ ":$PATH:" != *":$HOME/.ccw/bin:"* ]] && export PATH="$HOME/.ccw/bin:$PATH"
```

**`~/.ccw/zdotdir/.zshrc`**：
```bash
# 先恢复真实 ZDOTDIR，source 用户原有 .zshrc
ZDOTDIR="$HOME"
[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"
# 注入 ccw shell integration
[[ -f "$HOME/.ccw/shell-integration.zsh" ]] && source "$HOME/.ccw/shell-integration.zsh"
```

**`~/.ccw/bin/claude`**（wrapper script）：
```bash
#!/usr/bin/env bash
# 找真实 claude（跳过自身目录）
find_real_claude() {
  local self_dir="$(cd "$(dirname "$0")" && pwd)"
  local IFS=:
  for d in $PATH; do
    [[ "$d" == "$self_dir" ]] && continue
    [[ -x "$d/claude" ]] && echo "$d/claude" && return 0
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

# 临时注入 hooks（不修改 settings.json）
HOOKS_JSON='{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"ccw-hook stop","timeout":10}]}],"Notification":[{"matcher":"","hooks":[{"type":"command","command":"ccw-hook notification","timeout":10}]}]}}'

exec "$REAL_CLAUDE" --settings "$HOOKS_JSON" "$@"
```

**`~/.ccw/bin/ccw-hook`**（hook handler）：
```bash
#!/usr/bin/env bash
INPUT=$(cat)
TYPE="${1:-stop}"
PORT="${CCW_HOOK_PORT:-}"
WT_ID="${CCW_WORKTREE_ID:-}"

[[ -z "$PORT" || -z "$WT_ID" ]] && exit 0

PAYLOAD="{\"type\":\"$TYPE\",\"worktreeId\":\"$WT_ID\"}"
curl -s -X POST "http://127.0.0.1:$PORT/hook" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 3 \
  >/dev/null 2>&1 || true
```

### 4.3 PTY 创建改动（src/main/index.ts）

`pty:create` handler 增加第三个参数 `worktreeId`：

```typescript
ipcMain.handle('pty:create', (_e, id: string, cwd: string, worktreeId: string) => {
  // ...existing env cleanup...
  const pty = ptyModule.spawn(shell, ['--login'], {
    env: {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      TERM_PROGRAM: 'vscode',
      LANG: process.env.LANG || 'en_US.UTF-8',
      // 新增：ccw 通知相关
      CCW_WORKTREE_ID: worktreeId,
      CCW_HOOK_PORT: String(hookServerPort),
      ZDOTDIR: path.join(os.homedir(), '.ccw', 'zdotdir'),
    }
  })
})
```

### 4.4 notificationStore.ts

```typescript
interface NotificationState {
  // worktreeId → 未读通知计数
  notifications: Map<string, number>
  addNotification: (worktreeId: string) => void
  clearNotification: (worktreeId: string) => void
  getCount: (worktreeId: string) => number
}
```

- `addNotification`：count + 1
- `clearNotification`：删除该 worktreeId 条目
- `getCount`：返回计数，无通知返回 0

IPC 监听（在 store 初始化时注册）：
```typescript
window.api.onNotification(({ worktreeId }) => {
  addNotification(worktreeId)
})
```

### 4.5 WorktreeItem.tsx 改动

```tsx
const count = useNotificationStore((s) => s.getCount(worktree.id))
const clearNotification = useNotificationStore((s) => s.clearNotification)

// 点击时清除
onClick={() => {
  selectWorktree(repoId, worktree.id)
  if (count > 0) clearNotification(worktree.id)
}}

// 状态点：有通知时叠加呼吸动画 CSS class
<div
  className={count > 0 ? 'dot-notif-active' : ''}
  style={{
    width: 7, height: 7, borderRadius: '50%',
    background: isSelected ? '#c88832' : '#3FB950',
    // boxShadow 动画通过 CSS keyframe 实现
  }}
/>

// 右侧 badge
{count > 0 && !isArchived && (
  <span style={{
    fontSize: 10, color: '#8B949E',
    background: 'rgba(139,148,158,0.15)',
    borderRadius: 7, padding: '0 4px',
    minWidth: 16, height: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {count}
  </span>
)}
```

**CSS keyframe**（index.css 新增）：
```css
@keyframes ccw-breathe {
  0%   { box-shadow: 0 0 0 0px rgba(63,185,80,0.0); }
  40%  { box-shadow: 0 0 0 4px rgba(63,185,80,0.35); }
  70%  { box-shadow: 0 0 0 6px rgba(63,185,80,0.0); }
  100% { box-shadow: 0 0 0 0px rgba(63,185,80,0.0); }
}
.dot-notif-active {
  animation: ccw-breathe 2s cubic-bezier(0.4,0,0.6,1) infinite;
}
```

---

## 5. Preload 改动

```typescript
// src/preload/index.ts 新增
notification: {
  onNotification: (cb: (payload: { worktreeId: string; type: string }) => void) =>
    ipcRenderer.on('ccw:notification', (_e, payload) => cb(payload))
}
```

---

## 6. UI 行为规则

| 场景 | 表现 |
|------|------|
| 1 个 session 完成 | 绿色呼吸动画 + 右侧灰色数字 **1** |
| N 个 session 完成 | 绿色呼吸动画 + 右侧灰色数字 **N** |
| 点击该 worktree | 动画停止，数字消失，恢复静止绿点 |
| worktree 已归档 | 不显示通知（opacity 0.4，跳过） |
| worktree 当前已选中 | 收到通知时不累计（已在查看，直接忽略） |

---

## 7. 文件写出时机与幂等性

- App `ready` 事件后立即执行，写出前校验文件内容是否与目标一致，相同则跳过
- `~/.ccw/bin/` 下脚本写出后设置 `chmod +x`
- HTTP server 端口每次 App 启动随机分配，通过 env var 传入 PTY

---

## 8. 不在范围内

- bash 用户的 shell integration（当前只支持 zsh，与现有用户环境一致）
- macOS 系统通知（UNNotification）
- 通知持久化（App 重启后清空）
