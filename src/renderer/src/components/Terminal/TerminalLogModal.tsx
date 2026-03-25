import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { X, Copy, Search, Maximize2, Minimize2 } from 'lucide-react'
import { stripAnsi } from '../../utils/helpers'

interface TerminalLogModalProps {
  buffer: string
  terminalPath: string
  onClose: () => void
}

interface LogLine {
  timestamp: string
  content: string
}

const MIN_WIDTH = 420
const MIN_HEIGHT = 300
const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 500

export function TerminalLogModal({
  buffer,
  terminalPath,
  onClose
}: TerminalLogModalProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const contentRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Drag-resize state
  const resizing = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT })

  const lines = useMemo((): LogLine[] => {
    const raw = stripAnsi(buffer)
    const allLines = raw.split('\n').filter((l) => l.trim().length > 0)
    const last500 = allLines.slice(-500)
    const now = new Date()
    return last500.map((line, i) => {
      const ts = new Date(now.getTime() - (last500.length - i) * 200)
      return {
        timestamp: ts.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        content: line
      }
    })
  }, [buffer])

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines
    const q = searchQuery.toLowerCase()
    return lines.filter((l) => l.content.toLowerCase().includes(q))
  }, [lines, searchQuery])

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [filteredLines])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height }

    const onMouseMove = (ev: MouseEvent): void => {
      if (!resizing.current) return
      const newW = Math.max(MIN_WIDTH, resizeStart.current.w + ev.clientX - resizeStart.current.x)
      const newH = Math.max(MIN_HEIGHT, resizeStart.current.h + ev.clientY - resizeStart.current.y)
      setSize({ width: newW, height: newH })
    }

    const onMouseUp = (): void => {
      resizing.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [size])

  const handleCopyAll = async (): Promise<void> => {
    const text = filteredLines.map((l) => `${l.timestamp} ${l.content}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const highlightMatch = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="rounded-sm bg-warning/30 text-warning">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  const modalStyle = isMaximized
    ? { width: 'calc(100vw - 2rem)', height: 'calc(100vh - 2rem)' }
    : { width: size.width, height: size.height }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        style={modalStyle}
        className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Traffic lights */}
            <div className="flex gap-1.5">
              <button
                onClick={onClose}
                className="h-3 w-3 rounded-full bg-[#FF5F57] transition-opacity hover:opacity-80"
              />
              <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="h-3 w-3 rounded-full bg-[#28C840] transition-opacity hover:opacity-80"
                title={isMaximized ? '恢复默认大小' : '最大化'}
              />
            </div>
            <h2 className="text-sm font-medium text-text-primary">终端日志</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              title={isMaximized ? '恢复默认大小' : '最大化'}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              {isMaximized ? '还原' : '最大化'}
            </button>
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <Copy size={12} />
              {copied ? '已复制' : '复制全部'}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="shrink-0 border-b border-border-muted px-4 py-2">
          <div className="flex items-center gap-2 rounded-md bg-bg-primary px-3 py-1.5">
            <Search size={13} className="shrink-0 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索日志..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
            />
          </div>
        </div>

        {/* Path bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-1.5 text-[11px]">
          <span className="text-text-muted">{terminalPath}</span>
          <span className="text-text-muted">
            {filteredLines.length}/{lines.length}条记录
          </span>
        </div>

        {/* Log content */}
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
          {filteredLines.map((line, i) => (
            <div key={i} className="flex gap-3 py-0.5 leading-5">
              <span className="shrink-0 text-text-muted">{line.timestamp}</span>
              <span
                className={
                  line.content.startsWith('$')
                    ? 'text-terminal-green'
                    : 'text-text-primary'
                }
              >
                {highlightMatch(line.content)}
              </span>
            </div>
          ))}
          {filteredLines.length === 0 && (
            <div className="flex h-full items-center justify-center text-text-muted">
              {searchQuery ? '无匹配结果' : '暂无日志'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border-muted px-4 py-2">
          <span className="text-[11px] text-text-muted">
            显示最近 500 条 · 直接可复制
          </span>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            关闭
          </button>
        </div>

        {/* Resize handle — bottom-right corner drag area (only when not maximized) */}
        {!isMaximized && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
            title="拖拽调整大小"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-full w-full text-border-muted"
              fill="currentColor"
            >
              <path d="M11 10h1v1h-1zM12 11h1v1h-1zM13 12h1v1h-1zM10 11h1v1h-1zM11 12h1v1h-1zM12 13h1v1h-1zM9 12h1v1h-1zM10 13h1v1h-1zM11 14h1v1h-1z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
