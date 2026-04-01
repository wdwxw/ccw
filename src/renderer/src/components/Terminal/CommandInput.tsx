import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send, X, ChevronUp, ChevronDown } from 'lucide-react'

export interface CommandInputHandle {
  insertAtCursor: (text: string) => void
}

interface CommandInputProps {
  onSend: (command: string) => void
  onClose: () => void
  onFocusTextarea?: () => void
}

// 历史记录存储（模块级别，内存存储）
const commandHistory: string[] = []
const MAX_HISTORY = 10

// 未提交内容草稿（模块级别，内存存储）
let draftContent = ''

export const CommandInput = forwardRef<CommandInputHandle, CommandInputProps>(
  ({ onSend, onClose, onFocusTextarea }, ref) => {
    const [command, setCommand] = useState('')
    const [historyIndex, setHistoryIndex] = useState(-1) // -1 表示正在编辑新内容
    const [tempContent, setTempContent] = useState('') // 浏览历史时临时保存当前编辑内容
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const el = textareaRef.current
        if (!el) return
        const start = el.selectionStart ?? command.length
        const end = el.selectionEnd ?? command.length
        const newValue = command.slice(0, start) + text + command.slice(end)
        setCommand(newValue)
        // 编辑时重置历史索引
        if (historyIndex !== -1) {
          setHistoryIndex(-1)
        }
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + text.length
            textareaRef.current.selectionEnd = start + text.length
            textareaRef.current.focus()
          }
        })
      },
    }))

    // 组件挂载时恢复草稿内容
    useEffect(() => {
      if (draftContent) {
        setCommand(draftContent)
        draftContent = '' // 恢复后清空草稿
      }
      textareaRef.current?.focus()
    }, [])

    // 组件卸载时保存未提交内容
    useEffect(() => {
      return () => {
        const currentCommand = command.trim()
        if (currentCommand) {
          draftContent = currentCommand
        } else {
          draftContent = ''
        }
      }
    }, [command])

    useEffect(() => {
      const handleEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    useEffect(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }, [command])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }

    const handleSend = (): void => {
      const trimmed = command.trim()
      if (!trimmed) {
        // 空内容时发送纯回车，让终端处理
        onSend('')
        return
      }

      // 添加到历史记录（去重：如果与最新一条相同则不添加）
      if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== trimmed) {
        commandHistory.push(trimmed)
        // 限制最多10条
        if (commandHistory.length > MAX_HISTORY) {
          commandHistory.shift()
        }
      }

      // 发送命令
      onSend(trimmed)

      // 重置状态
      setCommand('')
      setHistoryIndex(-1)
      setTempContent('')
    }

    const handleHistoryUp = (): void => {
      if (commandHistory.length === 0) return

      if (historyIndex === -1) {
        // 保存当前编辑内容
        setTempContent(command)
      }

      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1)
      setHistoryIndex(newIndex)
      // 从历史数组末尾开始取（最新的在前）
      setCommand(commandHistory[commandHistory.length - 1 - newIndex])
    }

    const handleHistoryDown = (): void => {
      if (historyIndex === -1) return

      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)

      if (newIndex === -1) {
        // 回到当前编辑内容
        setCommand(tempContent)
      } else {
        setCommand(commandHistory[commandHistory.length - 1 - newIndex])
      }
    }

    const canGoUp = commandHistory.length > 0 && historyIndex < commandHistory.length - 1
    const canGoDown = historyIndex > -1

    return (
      /* input-zone */
      <div
        style={{
          borderTop: '0.5px solid var(--bs)',
          padding: '14px 18px',
          background: 'var(--color-bg-primary)',
          flexShrink: 0,
        }}
      >
        {/* input-card */}
        <div
          className="overflow-hidden transition-colors duration-150"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '0.5px solid var(--bm)',
            borderRadius: 10,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--ac-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--bm)')}
        >
          {/* textarea */}
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={onFocusTextarea}
            placeholder="输入命令, Enter 发送, Shift+Enter 换行..."
            rows={1}
            style={{
              display: 'block',
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--t2)',
              fontSize: 'calc(13px * var(--font-scale))',
              lineHeight: 1.55,
              padding: '12px 14px 10px',
              resize: 'none',
              minHeight: 52,
              maxHeight: 200,
              fontFamily: 'var(--font-mono)',
            }}
            className="placeholder-[var(--t4)]"
          />

          {/* input-bar */}
          <div
            className="flex items-center gap-[5px]"
            style={{
              padding: '6px 10px 8px',
              borderTop: '0.5px solid var(--bs)',
            }}
          >
            {/* 历史记录导航按钮 */}
            <div className="flex items-center gap-[2px]">
              <button
                onClick={handleHistoryUp}
                disabled={!canGoUp}
                className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
                style={{
                  color: canGoUp ? 'var(--t3)' : 'var(--t4)',
                  opacity: canGoUp ? 1 : 0.4,
                  cursor: canGoUp ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => {
                  if (canGoUp) {
                    e.currentTarget.style.color = 'var(--t2)'
                    e.currentTarget.style.background = 'var(--hv)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = canGoUp ? 'var(--t3)' : 'var(--t4)'
                  e.currentTarget.style.background = 'transparent'
                }}
                title="上一条历史"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={handleHistoryDown}
                disabled={!canGoDown}
                className="flex items-center justify-center rounded p-[3px] transition-colors duration-100"
                style={{
                  color: canGoDown ? 'var(--t3)' : 'var(--t4)',
                  opacity: canGoDown ? 1 : 0.4,
                  cursor: canGoDown ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => {
                  if (canGoDown) {
                    e.currentTarget.style.color = 'var(--t2)'
                    e.currentTarget.style.background = 'var(--hv)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = canGoDown ? 'var(--t3)' : 'var(--t4)'
                  e.currentTarget.style.background = 'transparent'
                }}
                title="下一条历史"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--t4)' }}>
              Enter 发送 · Shift+Enter 换行
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={onClose}
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
              title="关闭 (Esc)"
            >
              <X size={13} />
            </button>
            {/* send-btn — matches reference */}
            <button
              onClick={handleSend}
              className="flex items-center justify-center rounded-[6px] p-[5px] transition-colors duration-100"
              style={{
                background: 'var(--hv)',
                border: '0.5px solid var(--bm)',
                color: 'var(--t3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hv2)'
                e.currentTarget.style.color = 'var(--t1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--hv)'
                e.currentTarget.style.color = 'var(--t3)'
              }}
              title="发送 (Enter)"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    )
  }
)

CommandInput.displayName = 'CommandInput'
