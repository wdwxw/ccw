import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send, X } from 'lucide-react'

export interface CommandInputHandle {
  insertAtCursor: (text: string) => void
}

interface CommandInputProps {
  onSend: (command: string) => void
  onClose: () => void
  onFocusTextarea?: () => void
}

export const CommandInput = forwardRef<CommandInputHandle, CommandInputProps>(
  ({ onSend, onClose, onFocusTextarea }, ref) => {
    const [command, setCommand] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const el = textareaRef.current
        if (!el) return
        const start = el.selectionStart ?? command.length
        const end = el.selectionEnd ?? command.length
        const newValue = command.slice(0, start) + text + command.slice(end)
        setCommand(newValue)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + text.length
            textareaRef.current.selectionEnd = start + text.length
            textareaRef.current.focus()
          }
        })
      },
    }))

    useEffect(() => { textareaRef.current?.focus() }, [])

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
        onSend(command)
        setCommand('')
      }
    }

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
              onClick={() => { if (command.trim()) { onSend(command); setCommand('') } }}
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
