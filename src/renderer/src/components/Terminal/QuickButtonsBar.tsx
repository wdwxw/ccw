import { useSettingsStore } from '../../stores/settingsStore'

interface QuickButtonsBarProps {
  onSend: (content: string, autoEnter: boolean) => void
}

export function QuickButtonsBar({ onSend }: QuickButtonsBarProps): React.ReactElement | null {
  const quickButtons = useSettingsStore((s) => s.quickButtons)
  if (quickButtons.length === 0) return null

  return (
    <div
      className="flex flex-wrap gap-1 px-3 py-2"
      style={{
        background: 'var(--color-bg-primary)',
        borderTop: '0.5px solid var(--bs, rgba(255,220,160,0.07))',
      }}
    >
      {quickButtons.map((btn) => (
        <button
          key={btn.id}
          onClick={() => onSend(btn.content, btn.autoEnter)}
          title={btn.autoEnter ? `${btn.content}  （自动 Enter）` : btn.content}
          className="flex items-center gap-[5px] rounded-[5px] px-2 py-[3px] text-[11.5px] transition-colors duration-100"
          style={{ color: 'var(--t3)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--t2)'
            e.currentTarget.style.background = 'var(--hv)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--t3)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {btn.title}
          {btn.autoEnter && (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
              <polyline points="14,4 14,9 3,9"/>
              <polyline points="6,6 3,9 6,12"/>
            </svg>
          )}
        </button>
      ))}
    </div>
  )
}
