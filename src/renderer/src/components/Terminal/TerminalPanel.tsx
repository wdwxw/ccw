import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useRepoStore } from '../../stores/repoStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { TerminalToolbar } from './TerminalToolbar'
import { CommandInput, CommandInputHandle } from './CommandInput'
import { QuickButtonsBar } from './QuickButtonsBar'
import { TerminalLogModal } from './TerminalLogModal'
import { FolderOpen, SquareX, Pencil, ArrowDown, X } from 'lucide-react'

// Warm terminal theme — closely mirrors reference, subtle warm shift
const XTERM_THEME = {
  background: '#0f0e0c',
  foreground: '#c8c2b8',
  cursor: '#c8c2b8',
  cursorAccent: '#0f0e0c',
  selectionBackground: 'rgba(200, 190, 160, 0.20)',
  selectionForeground: undefined,
  black: '#181614',
  red: '#c91b00',
  green: '#00c200',
  yellow: '#c7c400',
  blue: '#3060d0',
  magenta: '#c830c0',
  cyan: '#00b8bc',
  white: '#c8c2b8',
  brightBlack: '#686460',
  brightRed: '#ff6d67',
  brightGreen: '#5ff967',
  brightYellow: '#fefb67',
  brightBlue: '#6878ff',
  brightMagenta: '#ff76ff',
  brightCyan: '#5ffdff',
  brightWhite: '#fffcf4',
}

interface WorktreeTerminal {
  xterm: Terminal
  ptyId: string
  cleanup: () => void
  cwd: string
  fitAddon: FitAddon
  element: HTMLDivElement
  name: string
}

interface SessionGroup {
  sessions: WorktreeTerminal[]
  activeIndex: number
}

export function TerminalPanel(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const currentPtyId = useRef<string | null>(null)
  // worktreeId -> SessionGroup (多 session 支持)
  const sessionGroups = useRef(new Map<string, SessionGroup>())
  const currentWorktreeId = useRef<string | null>(null)
  const generationRef = useRef(0)

  const commandInputRef = useRef<CommandInputHandle>(null)
  // 记录最后获得焦点的区域，用于快捷按钮的插入目标判断
  const lastFocusArea = useRef<'terminal' | 'commandInput'>('terminal')

  const [showCommandInput, setShowCommandInput] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [terminalPath, setTerminalPath] = useState('')
  const [logBuffer, setLogBuffer] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  // 驱动 tab 栏重渲染
  const [_sessionVersion, setSessionVersion] = useState(0)
  // 正在编辑的 tab：{ wtId, index }
  const [editingTab, setEditingTab] = useState<{ wtId: string; index: number } | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const selectedRepoId = useRepoStore((s) => s.selectedRepoId)
  const selectedWorktreeId = useRepoStore((s) => s.selectedWorktreeId)
  const repos = useRepoStore((s) => s.repos)

  const selectedRepo = repos.find((r) => r.id === selectedRepoId)
  const selectedWorktree = selectedRepo?.worktrees.find((w) => w.id === selectedWorktreeId)
  const currentCwd = selectedWorktree?.path || selectedRepo?.path || ''
  const hasSelection = selectedRepo !== undefined

  const wtId = selectedWorktreeId || (selectedRepoId ? `repo-${selectedRepoId}` : null)
  const currentGroup = wtId ? sessionGroups.current.get(wtId) : undefined
  const sessionCount = currentGroup?.sessions.length ?? 0
  const activeSessionIndex = currentGroup?.activeIndex ?? 0

  const sessionBlinks = useNotificationStore((s) => wtId ? s.sessionBlinks[wtId] : undefined)

  const destroyAllTerminals = useCallback(async () => {
    for (const [, group] of sessionGroups.current) {
      for (const terminal of group.sessions) {
        terminal.cleanup()
        await window.api.pty.kill(terminal.ptyId)
        terminal.xterm.dispose()
        terminal.element.remove()
      }
    }
    sessionGroups.current.clear()
    xtermRef.current = null
    fitAddonRef.current = null
    currentPtyId.current = null
    currentWorktreeId.current = null
  }, [])

  const createTerminalInstance = useCallback(
    async (wtId: string, cwd: string, sessionIdx: number): Promise<WorktreeTerminal | null> => {
      if (!containerRef.current || !cwd) return null

      const gen = ++generationRef.current

      const xterm = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Consolas', 'Menlo', monospace",
        lineHeight: 1.4,
        letterSpacing: 0,
        theme: XTERM_THEME,
        allowProposedApi: true,
        scrollback: 10000,
        fontWeight: 'normal',
        fontWeightBold: 'bold',
        macOptionIsMeta: true
      })

      const fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)
      xterm.loadAddon(new WebLinksAddon())
      xterm.loadAddon(new SearchAddon())

      const ptyId = `pty-${wtId}-s${sessionIdx}-${Date.now()}`

      await window.api.pty.create(ptyId, cwd, wtId)

      if (gen !== generationRef.current) {
        await window.api.pty.kill(ptyId)
        return null
      }

      xterm.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true
        if (e.code === 'Enter' && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          window.api.pty.write(ptyId, '\x1b\r')
          return false
        }
        if (e.code === 'Enter' && e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          window.api.pty.write(ptyId, '\x1b\r')
          return false
        }
        // Cmd+I: 阻止写入终端，让事件冒泡到 window 处理
        if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
          return false
        }
        return true
      })

      xterm.onData((data) => {
        window.api.pty.write(ptyId, data)
        // 清除该 session 的闪烁（用户输入表示正在操作）
        const blinks = useNotificationStore.getState().sessionBlinks[wtId]
        if (blinks?.has(ptyId)) {
          useNotificationStore.getState().clearSessionBlink(wtId, ptyId)
        }
      })
      xterm.onResize(({ cols, rows }) => window.api.pty.resize(ptyId, cols, rows))

      const removeDataListener = window.api.pty.onData(ptyId, (data) => xterm.write(data))
      const removeExitListener = window.api.pty.onExit(ptyId, () => {
        xterm.writeln('\r\n\x1b[33m终端会话已结束\x1b[0m')
      })

      const cleanup = () => {
        removeDataListener()
        removeExitListener()
      }

      const element = document.createElement('div')
      element.style.cssText = 'position: absolute; inset: 0; display: none;'
      containerRef.current.appendChild(element)

      xterm.open(element)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      try {
        fitAddon.fit()
      } catch {
        /* initial fit may fail */
      }

      await window.api.pty.resize(ptyId, xterm.cols, xterm.rows)

      if (gen !== generationRef.current) {
        cleanup()
        await window.api.pty.kill(ptyId)
        xterm.dispose()
        element.remove()
        return null
      }

      return { xterm, ptyId, cleanup, cwd, fitAddon, element, name: 'Untitled' }
    },
    []
  )

  // 激活某个 session（显示其 element，更新 refs）
  const activateSession = useCallback(
    async (wtId: string, terminal: WorktreeTerminal, skipWorktreeCheck = false) => {
      if (!skipWorktreeCheck && currentWorktreeId.current === wtId) {
        // 仅更新 refs，不跳过（可能切换了 session index）
      }

      // 隐藏所有 session 的 element
      for (const [, group] of sessionGroups.current) {
        for (const t of group.sessions) {
          t.element.style.display = 'none'
        }
      }
      terminal.element.style.display = 'block'

      await new Promise((resolve) => requestAnimationFrame(resolve))
      const _xterm = terminal.xterm
      const _wasAtBottom = _xterm.buffer.active.viewportY === _xterm.buffer.active.baseY
      try {
        terminal.fitAddon.fit()
      } catch {
        /* ignore */
      }
      if (_wasAtBottom) { _xterm.scrollToBottom() }

      xtermRef.current = terminal.xterm
      fitAddonRef.current = terminal.fitAddon
      currentPtyId.current = terminal.ptyId
      currentWorktreeId.current = wtId
      setTerminalPath(terminal.cwd)

      await window.api.pty.resize(terminal.ptyId, terminal.xterm.cols, terminal.xterm.rows)
      lastFocusArea.current = 'terminal'
      terminal.xterm.focus()
    },
    []
  )

  // 新增一个 session（"+" 按钮调用）
  const handleAddSession = useCallback(async () => {
    if (!wtId || !currentCwd) return

    const group = sessionGroups.current.get(wtId)
    if (!group) return

    const sessionIdx = group.sessions.length
    const terminal = await createTerminalInstance(wtId, currentCwd, sessionIdx)
    if (!terminal) return

    group.sessions.push(terminal)
    group.activeIndex = group.sessions.length - 1
    setSessionVersion((v) => v + 1)

    await activateSession(wtId, terminal, true)
  }, [wtId, currentCwd, createTerminalInstance, activateSession])

  // 切换到指定 session index
  const handleSwitchSession = useCallback(
    async (index: number) => {
      if (!wtId) return
      const group = sessionGroups.current.get(wtId)
      if (!group || index < 0 || index >= group.sessions.length) return
      if (group.activeIndex === index) return

      group.activeIndex = index
      setSessionVersion((v) => v + 1)
      await activateSession(wtId, group.sessions[index], true)

      // 清除该 tab 的闪烁通知
      const ptyId = group.sessions[index].ptyId
      const blinks = useNotificationStore.getState().sessionBlinks[wtId]
      if (blinks?.has(ptyId)) {
        useNotificationStore.getState().clearSessionBlink(wtId, ptyId)
      }
    },
    [wtId, activateSession]
  )

  // 关闭指定 session
  const handleCloseSession = useCallback(
    async (index: number) => {
      if (!wtId) return
      const group = sessionGroups.current.get(wtId)
      if (!group || group.sessions.length <= 1) return // 至少保留一个

      const terminal = group.sessions[index]
      terminal.cleanup()
      await window.api.pty.kill(terminal.ptyId)
      terminal.xterm.dispose()
      terminal.element.remove()

      group.sessions.splice(index, 1)

      // 调整 activeIndex
      const newActive = Math.min(group.activeIndex, group.sessions.length - 1)
      group.activeIndex = newActive
      setSessionVersion((v) => v + 1)

      // 激活新的 active session
      await activateSession(wtId, group.sessions[newActive], true)
    },
    [wtId, activateSession]
  )

  // 开始编辑 tab 名称
  const handleStartEdit = useCallback(
    (e: React.MouseEvent, targetWtId: string, index: number, currentName: string) => {
      e.stopPropagation()
      setEditingTab({ wtId: targetWtId, index })
      setEditingName(currentName)
      // 下一帧聚焦输入框
      requestAnimationFrame(() => editInputRef.current?.focus())
    },
    []
  )

  // 提交编辑
  const handleCommitEdit = useCallback(() => {
    if (!editingTab) return
    const group = sessionGroups.current.get(editingTab.wtId)
    if (group && group.sessions[editingTab.index]) {
      group.sessions[editingTab.index].name = editingName.trim() || 'Untitled'
      setSessionVersion((v) => v + 1)
    }
    setEditingTab(null)
  }, [editingTab, editingName])

  // Handle worktree/repo selection and terminal switching
  useEffect(() => {
    if (!hasSelection || !currentCwd || !wtId) return

    const existingGroup = sessionGroups.current.get(wtId)
    if (existingGroup) {
      // 切换到该 worktree 已有的 active session
      const terminal = existingGroup.sessions[existingGroup.activeIndex]
      if (currentWorktreeId.current !== wtId) {
        activateSession(wtId, terminal)
        setSessionVersion((v) => v + 1)
      }
    } else {
      // 首次为该 worktree 创建 session
      createTerminalInstance(wtId, currentCwd, 0).then(async (terminal) => {
        if (terminal) {
          // 隐藏所有其他终端
          for (const [, group] of sessionGroups.current) {
            for (const t of group.sessions) {
              t.element.style.display = 'none'
            }
          }
          terminal.element.style.display = 'block'

          sessionGroups.current.set(wtId, { sessions: [terminal], activeIndex: 0 })
          currentWorktreeId.current = wtId
          xtermRef.current = terminal.xterm
          fitAddonRef.current = terminal.fitAddon
          currentPtyId.current = terminal.ptyId
          setTerminalPath(terminal.cwd)
          setSessionVersion((v) => v + 1)

          await new Promise((resolve) => requestAnimationFrame(resolve))
          const _wasAtBottom = terminal.xterm.buffer.active.viewportY === terminal.xterm.buffer.active.baseY
          try {
            terminal.fitAddon.fit()
          } catch {
            /* ignore */
          }
          if (_wasAtBottom) { terminal.xterm.scrollToBottom() }
          try {
            await window.api.pty.resize(terminal.ptyId, terminal.xterm.cols, terminal.xterm.rows)
          } catch {
            /* ignore */
          }
          terminal.xterm.focus()
        }
      })
    }
  }, [hasSelection, currentCwd, selectedWorktreeId, selectedRepoId, wtId, createTerminalInstance, activateSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyAllTerminals()
    }
  }, [destroyAllTerminals])

  // Global keyboard shortcuts for terminal sessions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+I: 呼起/关闭 CommandInput 对话框
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        setShowCommandInput((v) => {
          if (v) {
            // 关闭时聚回终端
            lastFocusArea.current = 'terminal'
            xtermRef.current?.focus()
          }
          return !v
        })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 通过 IPC 接收主进程转发的 Cmd+T / Cmd+W（原生菜单拦截后转发）
  useEffect(() => {
    const removeCloseTab = window.api.app.onCloseTab(() => {
      if (!hasSelection || !wtId) return
      const group = sessionGroups.current.get(wtId)
      if (!group) return
      if (group.sessions.length > 1) {
        handleCloseSession(group.activeIndex)
      }
      // 只有 1 个 session 时什么都不做（不关闭软件）
    })

    const removeNewTab = window.api.app.onNewTab(() => {
      if (!hasSelection || !wtId) return
      handleAddSession()
    })

    return () => {
      removeCloseTab()
      removeNewTab()
    }
  }, [hasSelection, wtId, handleCloseSession, handleAddSession])

  // Handle window/container resize
  useEffect(() => {
    const handleResize = (): void => {
      const term = xtermRef.current
      const fitAddon = fitAddonRef.current
      if (!fitAddon || !term) return
      const wasAtBottom = term.buffer.active.viewportY === term.buffer.active.baseY
      try {
        fitAddon.fit()
      } catch {
        /* ignore */
      }
      if (wasAtBottom) { term.scrollToBottom() }
    }

    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [])

  const handleSendCommand = useCallback((command: string) => {
    if (currentPtyId.current) {
      window.api.pty.write(currentPtyId.current, command + '\r')
    }
  }, [])

  const handleAppendToInput = useCallback((content: string, autoEnter: boolean) => {
    if (currentPtyId.current && content) {
      const ptyId = currentPtyId.current
      window.api.pty.write(ptyId, content)
      if (autoEnter) {
        setTimeout(() => {
          if (currentPtyId.current === ptyId) {
            window.api.pty.write(ptyId, '\r')
          }
        }, 50)
      }
    }
    xtermRef.current?.focus()
  }, [])

  // 快捷按钮点击：根据焦点区域决定插入到终端还是 CommandInput
  const handleQuickButtonSend = useCallback((content: string, autoEnter: boolean) => {
    if (showCommandInput && lastFocusArea.current === 'commandInput' && commandInputRef.current) {
      commandInputRef.current.insertAtCursor(content)
    } else {
      handleAppendToInput(content, autoEnter)
    }
  }, [showCommandInput, handleAppendToInput])

  const handleShowLog = useCallback(async () => {
    if (currentPtyId.current) {
      const buffer = await window.api.pty.getBuffer(currentPtyId.current)
      setLogBuffer(buffer)
    }
    setShowLogModal(true)
  }, [])

  const handleOpenInFinder = useCallback(() => {
    if (currentCwd) {
      window.api.app.openExternal('open', currentCwd)
    }
  }, [currentCwd])

  const handleScrollToBottom = useCallback(() => {
    xtermRef.current?.scrollToBottom()
  }, [])

  const handleClearNotifications = useCallback(() => {
    if (wtId) {
      useNotificationStore.getState().clearNotification(wtId)
    }
  }, [wtId])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleContextMenuCopy = useCallback(() => {
    const selection = xtermRef.current?.getSelection()
    if (selection) navigator.clipboard.writeText(selection)
    setContextMenu(null)
    xtermRef.current?.focus()
  }, [])

  const handleContextMenuPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (currentPtyId.current && text) {
        window.api.pty.write(currentPtyId.current, text)
      }
    } catch { /* ignore */ }
    setContextMenu(null)
    xtermRef.current?.focus()
  }, [])

  // 将图片路径写入 PTY（供拖拽和粘贴共用）
  const writeImagePathToPty = useCallback(async (base64Data: string, ext: string) => {
    if (!currentPtyId.current) return
    const result = await window.api.image.saveTempFile(base64Data, ext)
    if (result.success && result.path) {
      window.api.pty.write(currentPtyId.current, result.path)
    }
  }, [])

  // 拖拽图片到终端区域
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasImage = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    )
    if (hasImage) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    const file = files[0]
    // Electron 渲染进程中 File 对象有非标准的 .path 属性（本地绝对路径）
    const localPath = (file as any).path as string | undefined
    if (localPath) {
      if (currentPtyId.current) {
        window.api.pty.write(currentPtyId.current, localPath)
      }
      xtermRef.current?.focus()
      return
    }
    // 回退：读取 ArrayBuffer 转 base64
    const ext = file.name.split('.').pop() || 'png'
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      writeImagePathToPty(base64, ext)
    }
    reader.readAsDataURL(file)
    xtermRef.current?.focus()
  }, [writeImagePathToPty])

  // Cmd+V 粘贴图片（剪贴板中有图片时优先处理，否则交给 xterm 默认行为）
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!currentPtyId.current) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageItem = Array.from(items).find(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      )
      if (!imageItem) return
      e.preventDefault()
      e.stopPropagation()
      const file = imageItem.getAsFile()
      if (!file) return
      const ext = file.type.split('/')[1] || 'png'
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1]
        writeImagePathToPty(base64, ext)
      }
      reader.readAsDataURL(file)
    }
    window.addEventListener('paste', handlePaste, true)
    return () => window.removeEventListener('paste', handlePaste, true)
  }, [writeImagePathToPty])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Single unified tabbar (34px, matches reference) ─────── */}
      {hasSelection && (
        <div
          className="flex items-stretch shrink-0"
          style={{
            height: 32,
            background: 'var(--color-bg-secondary)',
            borderBottom: '0.5px solid var(--bs)',
          }}
        >
          {/* Session tabs */}
          {sessionCount > 0 && currentGroup?.sessions.map((session, i) => {
            const isActive  = i === activeSessionIndex
            const isEditing = editingTab?.wtId === wtId && editingTab?.index === i
            const isBlinking = sessionBlinks?.has(session.ptyId) ?? false
            return (
              <div
                key={i}
                className="group relative flex cursor-pointer items-center gap-[6px] whitespace-nowrap transition-colors duration-100"
                style={{
                  padding: '0 14px',
                  fontSize: 'calc(12px * var(--font-scale))',
                  color: isActive ? 'var(--t1)' : 'var(--t4)',
                  borderBottom: isActive && !isBlinking
                    ? '1.5px solid var(--t1)'
                    : '1.5px solid transparent',
                  position: 'relative',
                  top: '0.5px',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--t3)'
                    e.currentTarget.style.background = 'var(--hv)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--t4)'
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
                onClick={() => !isEditing && handleSwitchSession(i)}
              >
                {/* blinking underline for pending notification */}
                {isBlinking && (
                  <span
                    className="tab-blink-underline"
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '1.5px',
                      background: 'var(--color-success)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {/* ✴ star prefix — matches reference */}
                <span style={{ color: isActive ? 'var(--t2)' : 'var(--t4)', fontSize: 'calc(12px * var(--font-scale))', lineHeight: 1 }}>
                  ✴
                </span>
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    className="w-20 rounded px-1 text-[11px] outline-none"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      border: '0.5px solid var(--bm)',
                      color: 'var(--t1)',
                    }}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitEdit()
                      if (e.key === 'Escape') setEditingTab(null)
                    }}
                    onBlur={handleCommitEdit}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="max-w-[80px] truncate">{session.name}</span>
                )}
                {/* Edit + close — visible on hover */}
                {!isEditing && (
                  <span
                    className="invisible group-hover:visible flex items-center gap-[2px]"
                    style={{ marginLeft: 2 }}
                  >
                    <span
                      className="flex items-center justify-center w-3 h-3 rounded"
                      style={{ color: 'var(--t4)' }}
                      onClick={(e) => wtId && handleStartEdit(e, wtId, i, session.name)}
                      title="重命名"
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
                    >
                      <Pencil size={8} />
                    </span>
                    {sessionCount > 1 && (
                      <span
                        className="flex items-center justify-center w-3 h-3 rounded"
                        style={{ color: 'var(--t4)' }}
                        onClick={(e) => { e.stopPropagation(); handleCloseSession(i) }}
                        title="关闭"
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t3)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
                      >
                        <X size={8} />
                      </span>
                    )}
                  </span>
                )}
              </div>
            )
          })}

          {/* + new session — tab-plus style */}
          <div
            className="flex cursor-pointer items-center px-2 transition-colors duration-100"
            style={{
              fontSize: 'calc(17px * var(--font-scale))',
              lineHeight: 1,
              color: 'var(--t4)',
              borderBottom: '1.5px solid transparent',
              position: 'relative',
              top: '0.5px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t3)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t4)')}
            onClick={handleAddSession}
            title="新建终端会话 (⌘T)"
          >
            +
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Right: path + finder button */}
          <div
            className="flex items-center gap-2 pr-3"
            style={{ color: 'var(--t4)', fontSize: 'calc(11px * var(--font-scale))' }}
          >
            {/* clear notifications */}
            <button
              onClick={handleClearNotifications}
              className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
              title="清除提醒"
            >
              <SquareX size={12} />
            </button>
            <button
              onClick={handleOpenInFinder}
              className="flex items-center gap-1 rounded px-[6px] py-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--t3)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
              title="在 Finder 中打开"
            >
              <FolderOpen size={12} />
            </button>
            {/* clock icon */}
            <button
              className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--t3)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={handleShowLog}
              title="查看日志"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.4"/>
              </svg>
            </button>
            {/* scroll to bottom */}
            <button
              className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
              style={{ color: 'var(--t4)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--t3)'
                e.currentTarget.style.background = 'var(--hv)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t4)'
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={handleScrollToBottom}
              title="滚动到底部"
            >
              <ArrowDown size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Terminal body */}
      <div className="relative flex-1 overflow-hidden">
        {hasSelection ? (
          <div ref={containerRef} className="relative h-full w-full" style={{ background: '#0f0e0c' }} onContextMenu={handleContextMenu} onMouseDown={() => { lastFocusArea.current = 'terminal' }} onDragOver={handleDragOver} onDrop={handleDrop} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--t4)', opacity: 0.35 }}>
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
              <path d="M4 6l2.5 2L4 10M8.5 10h3.5"/>
            </svg>
            <p className="text-[12px]" style={{ color: 'var(--t3)', opacity: 0.7 }}>选择一个 Worktree 开始</p>
            <p className="text-[11px]" style={{ color: 'var(--t4)', opacity: 0.5 }}>左侧面板添加 Git 仓库，然后创建 Worktree</p>
          </div>
        )}
      </div>

      {/* Command input */}
      {showCommandInput && hasSelection && (
        <CommandInput
          ref={commandInputRef}
          onSend={handleSendCommand}
          onClose={() => {
            setShowCommandInput(false)
            lastFocusArea.current = 'terminal'
            xtermRef.current?.focus()
          }}
          onFocusTextarea={() => { lastFocusArea.current = 'commandInput' }}
        />
      )}

      {/* Quick buttons bar — above the toolbar */}
      {hasSelection && <QuickButtonsBar onSend={handleQuickButtonSend} />}

      {/* Toolbar */}
      {hasSelection && (
        <TerminalToolbar
          showCommandInput={showCommandInput}
          onToggleCommandInput={() => {
            setShowCommandInput((v) => {
              if (v) {
                lastFocusArea.current = 'terminal'
                xtermRef.current?.focus()
              }
              return !v
            })
          }}
          onShowLog={handleShowLog}
        />
      )}

      {/* Log modal */}
      {showLogModal && (
        <TerminalLogModal
          buffer={logBuffer}
          terminalPath={terminalPath}
          onClose={() => setShowLogModal(false)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            minWidth: 110,
            padding: '3px 0',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleContextMenuCopy}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 14px',
              fontSize: 'calc(12px * var(--font-scale))',
              color: xtermRef.current?.getSelection() ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: xtermRef.current?.getSelection() ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => {
              if (xtermRef.current?.getSelection()) e.currentTarget.style.background = 'var(--color-bg-primary)'
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            复制
          </button>
          <button
            onClick={handleContextMenuPaste}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 14px',
              fontSize: 'calc(12px * var(--font-scale))',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            粘贴
          </button>
        </div>
      )}
    </div>
  )
}
