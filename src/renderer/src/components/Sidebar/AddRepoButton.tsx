import { useRepoStore } from '../../stores/repoStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Settings } from 'lucide-react'

export function AddRepoButton(): React.ReactElement {
  const addRepo        = useRepoStore((s) => s.addRepo)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)

  return (
    <div
      className="flex items-center justify-between"
      style={{
        borderTop: '0.5px solid var(--bs, rgba(255,220,160,0.07))',
        padding: '9px 8px',
      }}
    >
      {/* Add repository — matches reference .add-repo-btn */}
      <button
        onClick={addRepo}
        className="flex items-center gap-[7px] rounded-[5px] text-[12px] transition-colors duration-100"
        style={{ color: 'var(--t3)', padding: '4px 7px' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--t2)'
          e.currentTarget.style.background = 'var(--hv)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--t3)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* external-link-plus icon */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3a1 1 0 0 1 1-1h3v2H3v9h9v-3h2v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>
          <path d="M10 1h5v5M15 1L9 7" strokeWidth="1.5"/>
        </svg>
        Add repository
      </button>

      {/* Footer icons: info + settings */}
      <div className="flex gap-[2px]">
        <FooterIcon aria-label="info">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.2"/>
            <path d="M8 7v4.5M8 5.2v.6"/>
          </svg>
        </FooterIcon>
        <FooterIcon onClick={toggleSettings} aria-label="settings">
          <Settings size={14} />
        </FooterIcon>
      </div>
    </div>
  )
}

function FooterIcon({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button
      {...props}
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
    >
      {children}
    </button>
  )
}
