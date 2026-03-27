// src/main/ccwHookServer.ts
import http from 'http'
import { AddressInfo } from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let server: http.Server | null = null

export function startHookServer(
  onNotification: (payload: { worktreeId?: string; gitPath?: string; type: string }) => void
): Promise<number> {
  if (server !== null) {
    throw new Error('ccwHookServer: server already started')
  }
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/hook') {
        let body = ''
        req.on('data', (chunk) => { if (body.length < 4096) body += chunk })
        req.on('end', () => {
          try {
            const payload = JSON.parse(body)
            onNotification({
              worktreeId: payload.worktreeId || undefined,
              gitPath: payload.gitPath || undefined,
              type: payload.type || 'stop',
            })
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
      writeRegistry(port)
      writeCcwHookScript()
      injectHooksIntoSettings()
      resolve(port)
    })
  })
}

export function closeHookServer(): void {
  removeHooksFromSettings()
  server?.close()
  server = null
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function writeRegistry(port: number): void {
  const registryPath = path.join(os.homedir(), '.ccw', 'registry.json')
  const content = JSON.stringify({ port, pid: process.pid }, null, 2)
  try {
    if (fs.readFileSync(registryPath, 'utf-8') === content) return
  } catch { /* file doesn't exist yet */ }
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, content, 'utf-8')
}

// ---------------------------------------------------------------------------
// ccw-hook script (absolute path used in settings.json — no PATH dependency)
// ---------------------------------------------------------------------------

function writeCcwHookScript(): void {
  const ccwHookPath = path.join(os.homedir(), '.ccw', 'bin', 'ccw-hook')
  const content = `#!/usr/bin/env bash
TYPE="\${1:-stop}"

# --- Resolve PORT + CCW PID ---
PORT="\${CCW_HOOK_PORT:-}"
_CCW_PID=""
if [[ -z "$PORT" ]]; then
  _REG="$HOME/.ccw/registry.json"
  if [[ -f "$_REG" ]]; then
    PORT=$(grep -o '"port":[[:space:]]*[0-9]*' "$_REG" | grep -o '[0-9]*')
    _CCW_PID=$(grep -o '"pid":[[:space:]]*[0-9]*' "$_REG" | grep -o '[0-9]*')
  fi
fi
[[ -z "$PORT" ]] && exit 0

# CCW process is dead → skip silently (avoids 3-second curl timeout)
if [[ -n "$_CCW_PID" ]] && ! kill -0 "$_CCW_PID" 2>/dev/null; then
  exit 0
fi

# --- Resolve worktree identifier ---
WT_ID="\${CCW_WORKTREE_ID:-}"
if [[ -n "$WT_ID" ]]; then
  # Fast path: CCW env var set (CCW's own terminals)
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD="$(jq -n --arg type "$TYPE" --arg wid "$WT_ID" '{type:$type,worktreeId:$wid}')"
  else
    PAYLOAD="{\\"type\\":\\"$TYPE\\",\\"worktreeId\\":\\"$WT_ID\\"}"
  fi
else
  # Fallback: detect git root path (wecode / Zed / any external terminal)
  GIT_PATH=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD="$(jq -n --arg type "$TYPE" --arg p "$GIT_PATH" '{type:$type,gitPath:$p}')"
  else
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'type':sys.argv[1],'gitPath':sys.argv[2]}))" "$TYPE" "$GIT_PATH" 2>/dev/null) || \
    PAYLOAD="{\\"type\\":\\"$TYPE\\",\\"gitPath\\":\\"$(echo "$GIT_PATH" | sed 's/"/\\\\"/g')\\"}"
  fi
fi

curl -s -X POST "http://127.0.0.1:$PORT/hook" \\
  -H "Content-Type: application/json" \\
  -d "$PAYLOAD" \\
  --max-time 3 \\
  >/dev/null 2>&1 || true
`
  fs.mkdirSync(path.dirname(ccwHookPath), { recursive: true })
  try {
    if (fs.readFileSync(ccwHookPath, 'utf-8') === content) return
  } catch { /* not exists */ }
  fs.writeFileSync(ccwHookPath, content, 'utf-8')
  fs.chmodSync(ccwHookPath, 0o755)
}

// ---------------------------------------------------------------------------
// ~/.claude/settings.json hook injection
// ---------------------------------------------------------------------------

const CCW_HOOK_MARKER = '.ccw/bin/ccw-hook'  // substring present in all CCW hook commands

function settingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function ccwHookCommand(type: string): string {
  // Absolute path — works regardless of PATH in any shell/tool context
  return `${os.homedir()}/.ccw/bin/ccw-hook ${type}`
}

function ccwHookEntry(type: string): object {
  return {
    matcher: '',
    hooks: [{ type: 'command', command: ccwHookCommand(type), timeout: 10 }],
  }
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  const p = settingsPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
}

export function injectHooksIntoSettings(): void {
  const settings = readSettings()
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>

  for (const event of ['Stop', 'Notification'] as const) {
    const existing = (hooks[event] ?? []) as object[]
    // Skip if already injected (idempotent)
    const alreadyPresent = existing.some((entry) =>
      JSON.stringify(entry).includes(CCW_HOOK_MARKER)
    )
    if (!alreadyPresent) {
      hooks[event] = [...existing, ccwHookEntry(event)]
    }
  }

  settings.hooks = hooks
  writeSettings(settings)
}

export function removeHooksFromSettings(): void {
  try {
    const settings = readSettings()
    const hooks = settings.hooks as Record<string, unknown[]> | undefined
    if (!hooks) return

    for (const event of Object.keys(hooks)) {
      hooks[event] = (hooks[event] as object[]).filter(
        (entry) => !JSON.stringify(entry).includes(CCW_HOOK_MARKER)
      )
      if (hooks[event].length === 0) delete hooks[event]
    }

    if (Object.keys(hooks).length === 0) delete settings.hooks
    writeSettings(settings)
  } catch { /* ignore if file unreadable on quit */ }
}
