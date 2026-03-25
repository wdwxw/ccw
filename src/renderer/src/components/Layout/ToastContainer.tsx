import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import type { Toast } from '../../stores/toastStore'

const iconMap = {
  success: <CheckCircle size={14} className="text-success" />,
  error: <AlertCircle size={14} className="text-danger" />,
  warning: <AlertTriangle size={14} className="text-warning" />,
  info: <Info size={14} className="text-accent" />
}

const bgMap = {
  success: 'border-success/30 bg-success/5',
  error: 'border-danger/30 bg-danger/5',
  warning: 'border-warning/30 bg-warning/5',
  info: 'border-accent/30 bg-accent/5'
}

export function ToastContainer(): React.ReactElement {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-10 right-4 z-100 flex flex-col gap-2">
      {toasts.map((toast: Toast) => (
        <div
          key={toast.id}
          className={`flex w-80 items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg ${bgMap[toast.type]}`}
        >
          <span className="mt-0.5 shrink-0">{iconMap[toast.type]}</span>
          <span className="flex-1 text-xs leading-5 text-text-primary">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
