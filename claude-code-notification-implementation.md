# Claude Code 任务完成后通知的实现原理

本文档详细说明 cmux 如何实现 **Claude Code 任务完成后自动发送通知** 的功能。

## 核心设计思想

cmux 通过以下三层机制实现通知：

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Claude Code Hooks (临时注入, 不修改 settings.json)     │
│  → 任务完成时触发 Stop hook                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: cmux CLI (claude-hook 命令)                           │
│  → 接收 hook 调用，解析任务结果                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: cmux App (TerminalNotificationStore)                  │
│  → 通过 Unix Socket 发送通知给运行中的 cmux 应用                   │
└─────────────────────────────────────────────────────────────────┘
```

## 完整实现代码

### Layer 1: Claude Wrapper 脚本

放置于 `Resources/bin/claude`（需要添加到 PATH 且命名为 `claude`）：

```bash
#!/usr/bin/env bash
# cmux claude wrapper - injects hooks and session tracking
#
# 当检测到在 cmux 终端内运行时 (CMUX_SURFACE_ID 已设置)，
# 自动注入 Claude Code hooks，让任务完成时触发通知。

set -e

# 检测是否在 cmux 环境中
IN_CMUX=0
if [[ -n "$CMUX_SURFACE_ID" ]]; then
    IN_CMUX=1
fi

# 检查 cmux socket 是否可用
cmux_socket_available() {
    local socket="${CMUX_SOCKET_PATH:-}"
    [[ -n "$socket" && -S "$socket" ]] || return 1
    command -v cmux &>/dev/null || return 1
    cmux ping &>/dev/null 2>&1 || return 1
}

# 不在 cmux 中或 hooks 被禁用：直接调用原始 claude
if [[ "$IN_CMUX" == "0" ]] || [[ "$CMUX_CLAUDE_HOOKS_DISABLED" == "1" ]] || ! cmux_socket_available; then
    exec $(command -v claude) "$@"
fi

# 找到原始 claude 二进制文件（跳过 wrapper 自己）
find_real_claude() {
    local self_dir="$(cd "$(dirname "$0")" && pwd)"
    local IFS=:
    for d in $PATH; do
        [[ "$d" == "$self_dir" ]] && continue
        [[ -x "$d/claude" ]] && { echo "$d/claude"; return 0; }
    done
    return 1
}

REAL_CLAUDE=$(find_real_claude) || { echo "Error: claude not found" >&2; exit 127; }

# 某些子命令不支持 --settings，跳过
case "${1:-}" in
    mcp|config|api-key|rc|remote-control) exec "$REAL_CLAUDE" "$@";;
esac

# 生成唯一的 session ID
SESSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

# 构建 hooks JSON - 这是核心！
# Claude Code 会将这些 hooks 的 stdout 作为命令执行
HOOKS_JSON='{"hooks":{
    "Stop": [{"matcher":"","hooks":[{"type":"command","command":"cmux claude-hook stop","timeout":10}]}]
}}'

# 执行 claude，注入 hooks 和 session-id
exec "$REAL_CLAUDE" --session-id "$SESSION_ID" --settings "$HOOKS_JSON" "$@"
```

### Layer 2: cmux CLI 处理逻辑 (Swift)

在 cmux 的 CLI 中处理 `claude-hook stop` 命令。核心代码在 `CLI/cmux.swift`：

```swift
// 关键函数：处理 claude-hook stop
private func runClaudeHook(commandArgs: [String], client: SocketClient, telemetry: CLISocketSentryTelemetry) throws {
    let subcommand = commandArgs.first?.lowercased() ?? "help"

    // 从 stdin 读取 Claude Code 传来的 JSON
    let rawInput = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let parsedInput = parseClaudeHookInput(rawInput: rawInput)

    switch subcommand {
    case "stop":
        // 解析任务完成信息
        let completion = summarizeClaudeHookStop(parsedInput: parsedInput, sessionRecord: nil)

        if let completion {
            let title = "Claude Code"
            let subtitle = completion.subtitle  // 如 "Completed in my-project"
            let body = completion.body          // 最后一条 AI 回复的摘要

            // 关键：通过 socket 发送通知给 cmux 应用
            let payload = "\(title)|\(subtitle)|\(body)"
            _ = try? sendV1Command("notify_target \(workspaceId) \(surfaceId) \(payload)", client: client)
        }
        print("OK")
    }
}

// 解析 Claude Code hook 传来的 JSON 输入
private func parseClaudeHookInput(rawInput: String) -> ClaudeHookParsedInput {
    guard let data = rawInput.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data, options []) as? [String: Any] else {
        return ClaudeHookParsedInput(rawInput: rawInput, object: nil, sessionId: nil, cwd: nil, transcriptPath: nil)
    }

    let sessionId = extractSessionId(from: json)
    let cwd = extractCwd(from: json)
    return ClaudeHookParsedInput(rawInput: rawInput, object: json, sessionId: sessionId, cwd: cwd, transcriptPath: nil)
}

// 生成通知内容摘要
private func summarizeClaudeHookStop(parsedInput: ClaudeHookParsedInput, sessionRecord: ClaudeHookSessionRecord?) -> (subtitle: String, body: String)? {
    let cwd = parsedInput.cwd ?? sessionRecord?.cwd

    // 从 transcript 读取最后一条 AI 回复作为 body
    let transcript = parsedInput.transcriptPath.flatMap { readTranscriptSummary(path: $0) }
    if let lastMsg = transcript?.lastAssistantMessage {
        let projectName = URL(fileURLWithPath: cwd ?? "").lastPathComponent
        let subtitle = "Completed in \(projectName)"
        return (subtitle, truncate(lastMsg, maxLength: 200))
    }

    return ("Claude Code", "Task completed")
}
```

### Layer 3: cmux App 接收通知

在 cmux App 端，`TerminalController.swift` 处理 `notify_target` 命令：

```swift
// TerminalController.swift 中的命令分发
case "notify_target":
    return notifyTarget(args)

// notifyTarget 实现
private func notifyTarget(_ args: String) -> String {
    // 解析参数: notify_target <workspace_id> <surface_id> <title>|<subtitle>|<body>
    let parts = args.split(separator: " ", maxSplits: 2).map(String.init)
    let tabArg = parts[0]
    let panelArg = parts[1]
    let payload = parts.count > 2 ? parts[2] : ""

    var result = "OK"
    DispatchQueue.main.sync {
        // 找到对应的 Tab 和 Panel
        guard let tab = resolveTab(from: tabArg) else {
            result = "ERROR: Tab not found"
            return
        }

        // 解析通知内容 (格式: title|subtitle|body)
        let (title, subtitle, body) = parseNotificationPayload(payload)

        // 添加到通知存储
        TerminalNotificationStore.shared.addNotification(
            tabId: tab.id,
            surfaceId: panelId,
            title: title,
            subtitle: subtitle,
            body: body
        )
    }
    return result
}
```

## 通知流程时序图

```
用户终端                              cmux wrapper                    Claude Code                        cmux App
   │                                    │                                │                                  │
   │  1. 运行 claude                    │                                │                                  │
   │────────────────────────────────>│                                │                                  │
   │                                    │                                │                                  │
   │  2. 检测到 CMUX_SURFACE_ID         │                                │                                  │
   │     注入 --session-id 和 --settings│                                │                                  │
   │                                    │                                │                                  │
   │  3. exec claude --session-id XXX   │                                │                                  │
   │     --settings HOOKS_JSON          │                                │                                  │
   │────────────────────────────────────────────────>│                                │
   │                                    │                                │                                  │
   │  4. 用户与 Claude Code 交互...      │                                │                                  │
   │<─────────────────────────────────────────────────│                                  │
   │                                    │                                │                                  │
   │  5. 任务完成，Claude Code 触发       │                                │                                  │
   │     Stop hook: cmux claude-hook stop│                                │                                  │
   │<─────────────────────────────────────────────────│                                  │
   │                                    │                                │                                  │
   │  6. 读取 stdin 的 JSON，解析结果    │                                │                                  │
   │                                    │                                │                                  │
   │  7. sendV1Command                  │                                │                                  │
   │     "notify_target workspace surface │                                │                                  │
   │      title|subtitle|body"          │                                │                                  │
   │─────────────────────────────────────────────────────────────────────>│
   │                                    │                                │         │
   │                                    │                                │  8. TerminalNotificationStore     │
   │                                    │                                │     .addNotification()           │
   │                                    │                                │────────────────────────────────>│
   │                                    │                                │                                  │
   │                                    │                                │    9. 如果 app 未聚焦:           │
   │                                    │                                │       发送 macOS 系统通知        │
   │                                    │                                │       + Dock badge 更新          │
   │                                    │                                │                                  │
   │                                    │                                │    10. 如果 app 已聚焦且          │
   │                                    │                                │       surface 已选中:             │
   │                                    │                                │       只显示 UI 指示器            │
```

## 如何复刻这个功能

### 方案 A: 完整复刻 cmux 架构（推荐）

如果你要做一个类似 cmux 的终端模拟器：

1. **实现 Unix Socket 服务器**：监听 `~/.cmux/socket` 或指定路径
2. **实现 cmux CLI**：处理 `claude-hook` 子命令和 `notify_target` 等
3. **实现通知存储和展示**：类似 `TerminalNotificationStore`
4. **创建 claude wrapper**：注入 hooks

### 方案 B: 简化版（只做通知功能）

如果你只需要在任务完成时收到通知，不需要完整的 cmux 架构：

#### Step 1: 创建 claude wrapper

```bash
#!/usr/bash
# 保存到 ~/bin/claude（确保在 PATH 中且在 /usr/local/bin 之前）

REAL_CLAUDE="/usr/local/bin/claude"  # 或 $(which claude)

# 只在 TERM_PROGRAM=cmux 时注入
if [[ "$TERM_PROGRAM" == "cmux" ]]; then
    HOOKS_JSON='{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"your-notify-script","timeout":10}]}]}}'
    exec "$REAL_CLAUDE" --session-id "$(uuidgen)" --settings "$HOOKS_JSON" "$@"
else
    exec "$REAL_CLAUDE" "$@"
fi
```

#### Step 2: 创建通知脚本

保存为 `~/bin/your-notify-script`：

```bash
#!/usr/bin/env bash
# 读取 Claude Code 传来的 JSON
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // .id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // .context.cwd // empty')

# 生成通知内容
PROJECT=$(basename "$CWD" 2>/dev/null || echo "project")
TITLE="Claude Code"
SUBTITLE="Completed in $PROJECT"
BODY="Task finished at $(date +'%H:%M:%S')"

# 发送 macOS 通知
osascript -e "display notification \"$BODY\" with title \"$TITLE\" subtitle \"$SUBTITLE\""
```

#### Step 3: 设置权限

```bash
chmod +x ~/bin/claude ~/bin/your-notify-script
```

### 方案 C: 使用 Claude Code 原生 hooks 配置

如果你只想配置 hooks，不创建 wrapper：

```bash
# 在 ~/.claude/settings.json 中添加：
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "osascript -e 'display notification \"Claude Code finished\" with title \"Claude\"'"
      }]
    }]
  }
}
```

**注意**：这会永久修改 `settings.json`，而且 Claude Code 不会传递 `session_id` 等上下文信息。

## 关键文件索引

| 文件 | 功能 |
|------|------|
| `Resources/bin/claude` | Wrapper 脚本，注入 hooks |
| `CLI/cmux.swift` | 处理 `claude-hook stop` 命令 |
| `Sources/TerminalController.swift` | 处理 `notify_target` socket 命令 |
| `Sources/TerminalNotificationStore.swift` | 通知存储和分发 |
| `Sources/NotificationsPage.swift` | 通知列表 UI |

## Claude Code Hooks 参考

Claude Code 支持以下 hooks：

| Hook 名称 | 触发时机 | 用途 |
|-----------|----------|------|
| `SessionStart` | 会话开始时 | 记录 session 开始 |
| `Stop` | 任务/turn 完成时 | **发送通知** |
| `SessionEnd` | 会话真正结束时 | 清理状态 |
| `Notification` | 需要用户确认时 | 权限提示通知 |
| `UserPromptSubmit` | 用户提交 prompt 时 | 清除通知 |
| `PreToolUse` | 工具执行前 | 更新状态 |

## 注意事项

1. **临时注入 vs 永久修改**：cmux 使用 `--settings` 参数临时注入 hooks，不修改用户 `settings.json`
2. **Socket 通信**：cmux CLI 和 App 之间通过 Unix Domain Socket 通信
3. **焦点感知**：如果用户正在使用该 surface，只显示 UI 指示器而不弹系统通知
4. **Session 追踪**：通过 `--session-id` 追踪同一个会话的多个 turn

## 参考资料

- Claude Code `--settings` 参数文档
- cmux 源码：`CLI/cmux.swift`, `Sources/TerminalController.swift`
