# Claude Code Task Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a green breathing-ring animation + grey count badge on WorktreeItem sidebar entries when Claude Code finishes a task or needs user input in a background terminal session.

**Architecture:** An HTTP server in the Electron main process listens on a random localhost port. On PTY creation, we inject `CCW_WORKTREE_ID`, `CCW_HOOK_PORT`, and a custom `ZDOTDIR` into the shell environment. A `~/.ccw/bin/claude` wrapper (first in PATH) intercepts `claude` invocations and passes a temp JSON file via `--settings` to inject Stop/Notification hooks; the hook script POSTs back to the HTTP server, which fires an IPC event to the renderer, which updates a Zustand store that WorktreeItem reads.

**Tech Stack:** TypeScript, Node.js `http` module, Electron IPC, Zustand, React, CSS keyframes

**Spec:** `docs/superpowers/specs/2026-03-27-claude-code-notification-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/main/ccwHookServer.ts` | HTTP server + idempotent script writer |
| Modify | `src/main/index.ts` | Init hook server; inject env in `pty:create`; close on quit |
| Modify | `src/preload/index.ts` | Add `notification.onNotification`; update `pty.create` signature |
| Create | `src/renderer/src/stores/notificationStore.ts` | Zustand notification state + IPC listener init |
| Modify | `src/renderer/src/main.tsx` | Call `initNotificationListener()` at startup |
| Modify | `src/renderer/src/index.css` | `@keyframes ccw-breathe` + `.dot-notif-active` |
| Modify | `src/renderer/src/components/Sidebar/WorktreeItem.tsx` | Read store, show animation + badge, clear on click |
| Modify | `src/renderer/src/components/Terminal/TerminalPanel.tsx` | Pass `wtId` to `pty.create` |

---

## Task 1: Create `src/main/ccwHookServer.ts`

**Files:**
- Create: `src/main/ccwHookServer.ts`

This module starts the HTTP server and writes the four helper scripts to `~/.ccw/`.

- [ ] **Step 1: Create the file with HTTP server logic**

```typescript
// src/main/ccwHookServer.ts
import http from 'http'
import { AddressInfo } from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let server: http.Server | null = null

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
      const port = (server!.address() as AddressInfo).port
      writeScripts()
      resolve(port)
    })
  })
}

export function closeHookServer(): void {
  server?.close()
  server = null
}

function writeFile(filePath: string, content: string, executable: boolean): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  try {
    if (fs.readFileSync(filePath, 'utf-8') === content) return
  } catch { /* file doesn't exist yet */ }
  fs.writeFileSync(filePath, content, 'utf-8')
  if (executable) fs.chmodSync(filePath, 0o755)
}

function writeScripts(): void {
  const home = os.homedir()
  const ccwDir = path.join(home, '.ccw')

  // shell-integration.zsh
  writeFile(
    path.join(ccwDir, 'shell-integration.zsh'),
    `# CCW shell integration — adds ~/.ccw/bin to PATH (idempotent)\n[[ ":$PATH:" != *":$HOME/.ccw/bin:"* ]] && export PATH="$HOME/.ccw/bin:$PATH"\n`,
    false
  )

  // zdotdir/.zshrc
  writeFile(
    path.join(ccwDir, 'zdotdir', '.zshrc'),
    `# Restore user original ZDOTDIR (or $HOME if unset)\n_ccw_orig="\${CCW_ORIG_ZDOTDIR:-$HOME}"\nZDOTDIR="$_ccw_orig"\nunset _ccw_orig\n\n# Source user's real .zshrc\n[[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"\n\n# Inject CCW shell integration\n[[ -f "$HOME/.ccw/shell-integration.zsh" ]] && source "$HOME/.ccw/shell-integration.zsh"\n`,
    false
  )

  // claude wrapper
  writeFile(
    path.join(ccwDir, 'bin', 'claude'),
    `#!/usr/bin/env bash

# CCW claude wrapper — injects Stop/Notification hooks via temp --settings file

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

# Not in CCW context → pass through
[[ -z "$CCW_WORKTREE_ID" || -z "$CCW_HOOK_PORT" ]] && exec "$REAL_CLAUDE" "$@"

# Subcommands that don't support --settings
case "\${1:-}" in
  mcp|config|api-key|rc|remote-control) exec "$REAL_CLAUDE" "$@" ;;
esac

# Write temp JSON file for --settings (file path, not inline JSON)
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
`,
    true
  )

  // ccw-hook handler
  writeFile(
    path.join(ccwDir, 'bin', 'ccw-hook'),
    `#!/usr/bin/env bash
INPUT=$(cat)
TYPE="\${1:-stop}"
PORT="\${CCW_HOOK_PORT:-}"
WT_ID="\${CCW_WORKTREE_ID:-}"

[[ -z "$PORT" || -z "$WT_ID" ]] && exit 0

if command -v jq >/dev/null 2>&1; then
  PAYLOAD="$(jq -n --arg type "$TYPE" --arg wid "$WT_ID" '{type:$type,worktreeId:$wid}')"
else
  # worktreeId is alphanumeric + hyphens — safe to interpolate
  PAYLOAD="{\\"type\\":\\"$TYPE\\",\\"worktreeId\\":\\"$WT_ID\\"}"
fi

curl -s -X POST "http://127.0.0.1:$PORT/hook" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" \\
  --max-time 3 \\
  >/dev/null 2>&1 || true
`,
    true
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles (no build yet, just check for import errors)**

Open `src/main/ccwHookServer.ts` and confirm no red underlines in editor, or run:
```bash
cd /usr/local/work/data1/ai/ccw
pnpm tsc --noEmit 2>&1 | head -30
```

---

## Task 2: Update `src/main/index.ts`

**Files:**
- Modify: `src/main/index.ts`

Three changes: (a) import and start the hook server in `whenReady`, (b) close it on `before-quit`, (c) add `worktreeId` param and env vars to `pty:create`.

- [ ] **Step 1: Add import and module-level port variable**

At the top of the file, after the existing imports, add:

```typescript
import { startHookServer, closeHookServer } from './ccwHookServer'
import * as os from 'os'
import * as path from 'path'

let hookServerPort = 0
```

- [ ] **Step 2: Start hook server in `app.whenReady()`**

Inside `app.whenReady().then(async () => {`, find the line `mainWindowRef = createWindow()` (line ~278). Insert the hook server start **immediately before** that line (after the `detectInstalledApps` block that stores app icons):

```typescript
  // Start CCW hook server for Claude Code notifications
  hookServerPort = await startHookServer(({ worktreeId }) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('ccw:notification', { worktreeId })
    }
  })

  mainWindowRef = createWindow()
```

- [ ] **Step 3: Register `before-quit` cleanup**

After `app.on('window-all-closed', ...)` block, add:

```typescript
app.on('before-quit', () => {
  closeHookServer()
})
```

> **Note:** The spec's File Change table mentions `window-all-closed`, but the spec prose (section 4.1) explains that on macOS closing the last window does not quit the app — `before-quit` / `will-quit` are the correct events for true app exit. This plan intentionally uses `before-quit` as specified in the prose.

- [ ] **Step 4: Update `pty:create` handler signature and env**

In `registerIpcHandlers()`, find the `pty:create` handler (line ~445). Replace:
```typescript
ipcMain.handle('pty:create', (_e, id: string, cwd: string) => {
```
with:
```typescript
ipcMain.handle('pty:create', (_e, id: string, cwd: string, worktreeId: string) => {
```

Then find the `env: { ... }` block inside the `ptyModule.spawn()` call. Replace:
```typescript
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        TERM_PROGRAM: 'vscode',
        LANG: process.env.LANG || 'en_US.UTF-8'
      }
```
with:
```typescript
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        TERM_PROGRAM: 'vscode',
        LANG: process.env.LANG || 'en_US.UTF-8',
        CCW_WORKTREE_ID: worktreeId || '',
        CCW_HOOK_PORT: String(hookServerPort),
        ZDOTDIR: path.join(os.homedir(), '.ccw', 'zdotdir'),
        CCW_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
      }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /usr/local/work/data1/ai/ccw
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the changes above.

- [ ] **Step 6: Commit**

```bash
git add src/main/ccwHookServer.ts src/main/index.ts
git commit -m "feat(notification): add hook HTTP server and PTY env injection"
```

---

## Task 3: Update `src/preload/index.ts`

**Files:**
- Modify: `src/preload/index.ts`

Two changes: update `pty.create` signature; add `notification` namespace.

- [ ] **Step 1: Update `pty.create` signature**

Find (line 27):
```typescript
    create: (id: string, cwd: string) => ipcRenderer.invoke('pty:create', id, cwd),
```
Replace with:
```typescript
    create: (id: string, cwd: string, worktreeId: string) => ipcRenderer.invoke('pty:create', id, cwd, worktreeId),
```

- [ ] **Step 2: Add `notification` namespace**

After the `path: { ... }` block (before the closing `}`  of `const api = {`), add:

```typescript
  notification: {
    onNotification: (cb: (payload: { worktreeId: string; type: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { worktreeId: string; type: string }) => cb(payload)
      ipcRenderer.on('ccw:notification', handler)
      return () => ipcRenderer.removeListener('ccw:notification', handler)
    }
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(notification): expose notification IPC in preload; update pty.create signature"
```

---

## Task 4: Create `src/renderer/src/stores/notificationStore.ts` and update `main.tsx`

**Files:**
- Create: `src/renderer/src/stores/notificationStore.ts`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Create the notification store**

```typescript
// src/renderer/src/stores/notificationStore.ts
import { create } from 'zustand'
import { useRepoStore } from './repoStore'

interface NotificationState {
  notifications: Record<string, number>  // worktreeId → count
  addNotification: (worktreeId: string) => void
  clearNotification: (worktreeId: string) => void
  getCount: (worktreeId: string) => number
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: {},

  addNotification: (worktreeId) => {
    // If the worktree is currently selected, don't accumulate
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

// Call once at app startup. Returns a disposer (not needed in production).
export function initNotificationListener(): () => void {
  return window.api.notification.onNotification(({ worktreeId }) => {
    useNotificationStore.getState().addNotification(worktreeId)
  })
}
```

- [ ] **Step 2: Call `initNotificationListener` in `src/renderer/src/main.tsx`**

Open `src/renderer/src/main.tsx`. The current content is:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

Add the import and call before the `ReactDOM.createRoot` call:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initNotificationListener } from './stores/notificationStore'

initNotificationListener()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/notificationStore.ts src/renderer/src/main.tsx
git commit -m "feat(notification): add notificationStore and init listener at startup"
```

---

## Task 5: Add breathing animation CSS to `src/renderer/src/index.css`

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Append animation CSS**

Open `src/renderer/src/index.css` and append at the very end:

```css
/* CCW: Claude Code task-complete notification dot animation */
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

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "feat(notification): add ccw-breathe keyframe animation CSS"
```

---

## Task 6: Wire up the UI — `WorktreeItem.tsx` and `TerminalPanel.tsx`

**Files:**
- Modify: `src/renderer/src/components/Sidebar/WorktreeItem.tsx`
- Modify: `src/renderer/src/components/Terminal/TerminalPanel.tsx`

### Part A: WorktreeItem.tsx

- [ ] **Step 1: Add notification store import**

At the top of `WorktreeItem.tsx`, after the existing imports, add:
```typescript
import { useNotificationStore } from '../../stores/notificationStore'
```

- [ ] **Step 2: Read notification state**

Inside the `WorktreeItem` function, after the existing store subscriptions (around line 26), add:
```typescript
  const count = useNotificationStore((s) => s.notifications[worktree.id] ?? 0)
  const clearNotification = useNotificationStore((s) => s.clearNotification)
```

- [ ] **Step 3: Clear notification on click**

Find the `onClick` handler (line ~89):
```typescript
        onClick={() => { if (!isArchived && !isRenaming) selectWorktree(repoId, worktree.id) }}
```
Replace with:
```typescript
        onClick={() => {
          if (!isArchived && !isRenaming) {
            selectWorktree(repoId, worktree.id)
            if (count > 0) clearNotification(worktree.id)
          }
        }}
```

- [ ] **Step 4: Add `dot-notif-active` class to the status dot**

Find the status dot `<div>` (the 7×7px circle, around line 93-105). It currently has no `className`. Add one:
```tsx
          <div
            className={count > 0 && !isArchived ? 'dot-notif-active' : ''}
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
```

- [ ] **Step 5: Add the count badge on the right side of the item**

The item layout is: `[dot-wrap] [wt-info flex-1] [action buttons group-hover:visible]`.

We need to insert the badge **between** `wt-info` and the action buttons. Find the closing `</div>` of the `wt-info` block (the one with `style={{ flex: 1, minWidth: 0 }}`), then right after it (before the action buttons `{!isArchived && !isRenaming && ...}`), add:

```tsx
        {/* Notification count badge */}
        {count > 0 && !isArchived && (
          <span
            style={{
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
            }}
          >
            {count}
          </span>
        )}
```

### Part B: TerminalPanel.tsx

- [ ] **Step 6: Pass `wtId` to `pty.create` in `createTerminalInstance`**

There are two call paths that create PTY sessions:
1. `createTerminalInstance(wtId, cwd, sessionIdx)` → calls `window.api.pty.create(ptyId, cwd)` directly inside it
2. `handleAddSession()` → calls `createTerminalInstance(wtId, ...)` which in turn calls `window.api.pty.create`

Both paths go through the single `window.api.pty.create` call inside `createTerminalInstance`. Fixing that one call site covers both paths — `wtId` is already the first parameter of `createTerminalInstance` and is in scope.

Find (line ~139):
```typescript
      await window.api.pty.create(ptyId, cwd)
```
Replace with:
```typescript
      await window.api.pty.create(ptyId, cwd, wtId)
```

Both `createTerminalInstance(...)` and `handleAddSession()` are now covered by this single change.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/Sidebar/WorktreeItem.tsx \
        src/renderer/src/components/Terminal/TerminalPanel.tsx
git commit -m "feat(notification): show breathing dot + count badge on WorktreeItem; pass wtId to pty.create"
```

---

## Task 7: Smoke test end-to-end

- [ ] **Step 1: Start the dev app**

```bash
pnpm dev
```

- [ ] **Step 2: Verify scripts are written on startup**

```bash
ls -la ~/.ccw/bin/claude ~/.ccw/bin/ccw-hook ~/.ccw/zdotdir/.zshrc ~/.ccw/shell-integration.zsh
```
Expected: all four files exist, `claude` and `ccw-hook` are executable (`-rwxr-xr-x`).

- [ ] **Step 3: Verify env injection in PTY**

Open a terminal in CCW, then run:
```bash
echo "WORKTREE=$CCW_WORKTREE_ID PORT=$CCW_HOOK_PORT ZDOTDIR=$ZDOTDIR"
```
Expected: shows non-empty `WORKTREE` and `PORT` values.

- [ ] **Step 4: Simulate a hook POST manually**

In the same terminal, run (replace PORT with the value from Step 3):
```bash
curl -s -X POST "http://127.0.0.1:$CCW_HOOK_PORT/hook" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"stop\",\"worktreeId\":\"$CCW_WORKTREE_ID\"}"
```
Then switch to a **different** worktree and look at the worktree you ran the command from.

Expected:
- Green breathing ring appears on the dot
- Count badge "1" appears on the right side

- [ ] **Step 5: Click the notified worktree**

Expected: breathing animation stops, badge disappears, dot returns to static green.

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -p
git commit -m "fix(notification): <describe fixup if any>"
```
