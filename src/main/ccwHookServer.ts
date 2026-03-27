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
  if (server !== null) {
    throw new Error('ccwHookServer: server already started')
  }
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
