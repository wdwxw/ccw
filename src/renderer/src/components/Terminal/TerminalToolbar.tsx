import { CornerDownLeft, Eye } from 'lucide-react'

interface TerminalToolbarProps {
  showCommandInput: boolean
  onToggleCommandInput: () => void
  onShowLog: () => void
}

export function TerminalToolbar({
  showCommandInput,
  onToggleCommandInput,
  onShowLog
}: TerminalToolbarProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-[2px] px-2"
      style={{
        height: 36,
        background: 'var(--color-bg-primary)',
        borderTop: '0.5px solid var(--bs, rgba(255,220,160,0.07))',
      }}
    >
      {/* chip style — matches reference .chip */}
      <ChipBtn active={showCommandInput} onClick={onToggleCommandInput}>
        <CornerDownLeft size={12} />
        Enter
      </ChipBtn>
      <ChipBtn onClick={onShowLog}>
        <Eye size={12} />
        Show
      </ChipBtn>
      <div style={{ flex: 1 }} />
    </div>
  )
}

function ChipBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-[5px] rounded-[5px] px-2 py-[3px] text-[11.5px] transition-colors duration-100"
      style={{
        color: active ? 'var(--t2)' : 'var(--t3)',
        background: active ? 'var(--hv)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--t2)'
        e.currentTarget.style.background = 'var(--hv)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = active ? 'var(--t2)' : 'var(--t3)'
        e.currentTarget.style.background = active ? 'var(--hv)' : 'transparent'
      }}
    >
      {children}
    </button>
  )
}
