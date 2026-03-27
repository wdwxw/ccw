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
      writeScripts()
      resolve(port)
    })
  })
}

export function closeHookServer(): void {
  server?.close()
  server = null
}

function writeRegistry(port: number): void {
  const registryPath = path.join(os.homedir(), '.ccw', 'registry.json')
  const content = JSON.stringify({ port }, null, 2)
  try {
    if (fs.readFileSync(registryPath, 'utf-8') === content) return
  } catch { /* file doesn't exist yet */ }
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, content, 'utf-8')
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

# Determine hook port: prefer CCW_HOOK_PORT env var, fall back to registry file
_CCW_PORT="\${CCW_HOOK_PORT:-}"
if [[ -z "$_CCW_PORT" ]]; then
  _REG="$HOME/.ccw/registry.json"
  [[ -f "$_REG" ]] && _CCW_PORT=$(grep -o '"port":[[:space:]]*[0-9]*' "$_REG" | grep -o '[0-9]*')
fi

# No CCW context at all → pass through
[[ -z "$_CCW_PORT" ]] && exec "$REAL_CLAUDE" "$@"

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
TYPE="\${1:-stop}"

# --- Resolve PORT ---
PORT="\${CCW_HOOK_PORT:-}"
if [[ -z "$PORT" ]]; then
  _REG="$HOME/.ccw/registry.json"
  [[ -f "$_REG" ]] && PORT=$(grep -o '"port":[[:space:]]*[0-9]*' "$_REG" | grep -o '[0-9]*')
fi
[[ -z "$PORT" ]] && exit 0

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
  # Fallback: detect git root path (used for wecode / external terminals)
  GIT_PATH=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD="$(jq -n --arg type "$TYPE" --arg p "$GIT_PATH" '{type:$type,gitPath:$p}')"
  else
    # gitPath may contain path chars — use python3 for safe JSON encoding
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'type':sys.argv[1],'gitPath':sys.argv[2]}))" "$TYPE" "$GIT_PATH" 2>/dev/null) || \
    PAYLOAD="{\\"type\\":\\"$TYPE\\",\\"gitPath\\":\\"$(echo "$GIT_PATH" | sed 's/"/\\\\"/g')\\"}"
  fi
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
