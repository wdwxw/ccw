import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.ReactElement {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onCancel])

  const confirmColor =
    variant === 'danger'
      ? 'bg-danger hover:bg-danger/80'
      : variant === 'warning'
        ? 'bg-warning hover:bg-warning/80'
        : 'bg-accent hover:bg-accent-hover'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[380px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl">
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <div
              className={`rounded-full p-1.5 ${
                variant === 'danger'
                  ? 'bg-danger/10 text-danger'
                  : variant === 'warning'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-accent/10 text-accent'
              }`}
            >
              <AlertTriangle size={16} />
            </div>
            <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          </div>
          <p className="text-xs leading-5 text-text-secondary">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-muted px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-xs text-white transition-colors ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
