import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowLeft, Save, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import type { ExternalApp, QuickButton } from '../../types'
import { generateId } from '../../utils/helpers'
type FontScale = 1 | 1.25 | 1.5

type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error'

interface UpdateResult {
  latestVersion: string
  downloadUrl: string
}

const FONT_SCALE_OPTIONS: { label: string; value: FontScale }[] = [
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
]

export function SettingsPage(): React.ReactElement {
  const externalApps = useSettingsStore((s) => s.externalApps)
  const setExternalApps = useSettingsStore((s) => s.setExternalApps)
  const quickButtons = useSettingsStore((s) => s.quickButtons)
  const setQuickButtons = useSettingsStore((s) => s.setQuickButtons)
  const toggleSettings = useSettingsStore((s) => s.toggleSettings)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const fontScale = useSettingsStore((s) => s.fontScale)
  const setFontScale = useSettingsStore((s) => s.setFontScale)
  const showTrayIcon = useSettingsStore((s) => s.showTrayIcon)
  const setShowTrayIcon = useSettingsStore((s) => s.setShowTrayIcon)
  const debugLog = useSettingsStore((s) => s.debugLog)
  const setDebugLog = useSettingsStore((s) => s.setDebugLog)
  const addToast = useToastStore((s) => s.addToast)

  const [apps, setApps] = useState<ExternalApp[]>(externalApps)
  const [buttons, setButtons] = useState<QuickButton[]>(quickButtons)
  const [logPath, setLogPath] = useState<string>('')
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null)
  const [updateError, setUpdateError] = useState<string>('')

  useEffect(() => {
    setApps(externalApps)
  }, [externalApps])

  useEffect(() => {
    setButtons(quickButtons)
  }, [quickButtons])

  useEffect(() => {
    window.api.logger.getLogPath().then(setLogPath)
    window.api.app.getVersion().then(setCurrentVersion)
  }, [])

  const handleAddApp = (): void => {
    setApps([...apps, { id: generateId(), name: '', command: '', icon: 'terminal' }])
  }

  const handleRemoveApp = (id: string): void => {
    if (apps.length <= 1) {
      addToast('warning', '至少保留一个外部应用')
      return
    }
    setApps(apps.filter((a) => a.id !== id))
  }

  const handleUpdateApp = (id: string, field: keyof ExternalApp, value: string): void => {
    setApps(apps.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
  }

  const handleAddButton = (): void => {
    setButtons([...buttons, { id: generateId(), title: '', content: '', autoEnter: false }])
  }

  const handleRemoveButton = (id: string): void => {
    setButtons(buttons.filter((b) => b.id !== id))
  }

  const handleUpdateButton = (id: string, field: keyof QuickButton, value: string | boolean): void => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  const handleCheckUpdate = async (): Promise<void> => {
    setUpdateStatus('checking')
    setUpdateResult(null)
    setUpdateError('')
    const result = await window.api.app.checkUpdate()
    if (result.error) {
      setUpdateStatus('error')
      setUpdateError(result.error)
    } else if (result.hasUpdate) {
      setUpdateStatus('available')
      setUpdateResult({ latestVersion: result.latestVersion!, downloadUrl: result.downloadUrl! })
    } else {
      setUpdateStatus('latest')
    }
  }

  const handleSave = async (): Promise<void> => {    const validApps = apps.filter((a) => a.name.trim() && a.command.trim())
    if (validApps.length === 0) {
      addToast('warning', '请至少配置一个有效的外部应用')
      return
    }
    const validButtons = buttons.filter((b) => b.title.trim() && b.content.trim())
    await setExternalApps(validApps)
    await setQuickButtons(validButtons)
    addToast('success', '设置已保存')
    toggleSettings()
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-bg-primary p-6">
      <div className="mx-auto w-full max-w-xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={toggleSettings}
            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-medium text-text-primary">设置</h1>
        </div>

        {/* Menu Bar 图标 */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Menu Bar 图标</h2>
          <div className="flex items-center justify-between rounded-lg border border-border-muted bg-bg-secondary px-4 py-3">
            <div>
              <p className="text-xs font-medium text-text-primary">显示 Menu Bar 图标</p>
              <p className="mt-0.5 text-xs text-text-muted">在 macOS 顶部菜单栏显示 CCW 图标，收到通知时闪烁提醒</p>
            </div>
            <button
              onClick={() => setShowTrayIcon(!showTrayIcon)}
              className={`relative h-5 w-9 flex-shrink-0 overflow-hidden rounded-full transition-colors ${
                showTrayIcon ? 'bg-accent' : 'bg-bg-elevated'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  showTrayIcon ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">主题风格</h2>
          <p className="mb-4 text-xs text-text-muted">选择应用外观配色，立即生效</p>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme('dazi')}
              className={`relative flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
                theme === 'dazi'
                  ? 'border-accent bg-accent-muted'
                  : 'border-border-muted bg-bg-secondary hover:border-border'
              }`}
            >
              {/* 打子主题预览色块 */}
              <div className="flex gap-1">
                <div className="h-8 w-5 rounded-sm" style={{ background: '#161B22' }} />
                <div className="h-8 w-10 rounded-sm" style={{ background: '#0D1117' }} />
                <div className="flex flex-col gap-1">
                  <div className="h-3 w-8 rounded-sm" style={{ background: '#1A56DB' }} />
                  <div className="h-1.5 w-8 rounded-sm" style={{ background: '#30363D' }} />
                  <div className="h-1.5 w-6 rounded-sm" style={{ background: '#30363D' }} />
                </div>
              </div>
              <span className="text-left text-xs font-medium text-text-primary">打子</span>
              {theme === 'dazi' && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={10} />
                </span>
              )}
            </button>

            <button
              onClick={() => setTheme('brown')}
              className={`relative flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
                theme === 'brown'
                  ? 'border-accent bg-accent-muted'
                  : 'border-border-muted bg-bg-secondary hover:border-border'
              }`}
            >
              {/* 棕色主题预览色块 */}
              <div className="flex gap-1">
                <div className="h-8 w-5 rounded-sm" style={{ background: '#161310' }} />
                <div className="h-8 w-10 rounded-sm" style={{ background: '#1d1b18' }} />
                <div className="flex flex-col gap-1">
                  <div className="h-3 w-8 rounded-sm" style={{ background: '#b87840' }} />
                  <div className="h-1.5 w-8 rounded-sm" style={{ background: '#302820' }} />
                  <div className="h-1.5 w-6 rounded-sm" style={{ background: '#302820' }} />
                </div>
              </div>
              <span className="text-left text-xs font-medium text-text-primary">棕色</span>
              {theme === 'brown' && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={10} />
                </span>
              )}
            </button>
          </div>
        </section>

        {/* Font Size */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">界面字体大小</h2>
          <p className="mb-4 text-xs text-text-muted">调整界面文字大小，立即生效</p>
          <div className="flex gap-3">
            {FONT_SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFontScale(opt.value)}
                className={`relative flex min-w-[64px] items-center justify-center rounded-lg border px-4 py-2.5 transition-colors ${
                  fontScale === opt.value
                    ? 'border-accent bg-accent-muted'
                    : 'border-border-muted bg-bg-secondary hover:border-border'
                }`}
              >
                <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                {fontScale === opt.value && (
                  <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-white">
                    <Check size={9} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* External Apps */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">外部应用</h2>
          <p className="mb-4 text-xs text-text-muted">
            配置可在胶囊按钮中打开的外部应用程序
          </p>

          <div className="space-y-2">
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center gap-2 rounded-lg border border-border-muted bg-bg-secondary p-3"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={app.name}
                      onChange={(e) => handleUpdateApp(app.id, 'name', e.target.value)}
                      placeholder="名称 (如: VS Code)"
                      className="flex-1 rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      value={app.command}
                      onChange={(e) => handleUpdateApp(app.id, 'command', e.target.value)}
                      placeholder="命令 (如: code)"
                      className="flex-1 rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveApp(app.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddApp}
            className="mt-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <Plus size={13} />
            添加应用
          </button>
        </section>

        {/* Quick Buttons */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">快捷按钮</h2>
          <p className="mb-4 text-xs text-text-muted">
            配置终端底部的快捷命令按钮，点击后将内容追加到终端输入
          </p>

          <div className="space-y-2">
            {buttons.map((btn) => (
              <div
                key={btn.id}
                className="flex items-start gap-2 rounded-lg border border-border-muted bg-bg-secondary p-3"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <input
                    type="text"
                    value={btn.title}
                    onChange={(e) => handleUpdateButton(btn.id, 'title', e.target.value)}
                    placeholder="标题 (按钮显示文字)"
                    className="rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent"
                  />
                  <textarea
                    value={btn.content}
                    onChange={(e) => handleUpdateButton(btn.id, 'content', e.target.value)}
                    placeholder="内容 (点击后追加到终端的文字)"
                    rows={2}
                    className="resize-none rounded-md border border-border bg-bg-primary px-2.5 py-1.5 font-mono text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent"
                  />
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={btn.autoEnter}
                      onChange={(e) => handleUpdateButton(btn.id, 'autoEnter', e.target.checked)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span className="text-xs text-text-secondary">自动 Enter（点击后自动执行）</span>
                  </label>
                </div>
                <button
                  onClick={() => handleRemoveButton(btn.id)}
                  className="mt-0.5 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddButton}
            className="mt-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <Plus size={13} />
            添加按钮
          </button>
        </section>

        {/* Keyboard shortcuts info */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">快捷键</h2>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex items-center justify-between rounded-md bg-bg-secondary px-3 py-2">
              <span>新建 Worktree</span>
              <kbd className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-text-muted">
                Cmd+N
              </kbd>
            </div>
            <div className="flex items-center justify-between rounded-md bg-bg-secondary px-3 py-2">
              <span>打开设置</span>
              <kbd className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-text-muted">
                Cmd+,
              </kbd>
            </div>
          </div>
        </section>

        {/* Debug Log */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">调试日志</h2>
          <div className="flex items-center justify-between rounded-lg border border-border-muted bg-bg-secondary px-4 py-3">
            <div>
              <p className="text-xs font-medium text-text-primary">记录调试日志</p>
              <p className="mt-0.5 text-xs text-text-muted">开启后将 Hook 通知等关键事件写入日志文件，方便排查问题</p>
            </div>
            <button
              onClick={() => setDebugLog(!debugLog)}
              className={`relative h-5 w-9 flex-shrink-0 overflow-hidden rounded-full transition-colors ${
                debugLog ? 'bg-accent' : 'bg-bg-elevated'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  debugLog ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {logPath && (
            <p className="mt-2 break-all font-mono text-xs text-text-muted">{logPath}</p>
          )}
        </section>

        {/* About */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-text-primary">关于</h2>
          <div className="rounded-lg border border-border-muted bg-bg-secondary px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-primary">CCW</span>
                <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-text-muted">
                  v{currentVersion}
                </span>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={updateStatus === 'checking'}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={12} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                {updateStatus === 'checking' ? '检查中...' : '检查更新'}
              </button>
            </div>

            {updateStatus === 'latest' && (
              <p className="mt-2 text-xs text-success">已是最新版本</p>
            )}
            {updateStatus === 'error' && (
              <p className="mt-2 text-xs text-danger">{updateError}</p>
            )}
            {updateStatus === 'available' && updateResult && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-warning">
                  发现新版本 <span className="font-mono">v{updateResult.latestVersion}</span>
                </p>
                <button
                  onClick={() => window.api.app.openUrl(updateResult.downloadUrl)}
                  className="flex items-center gap-1 text-xs text-accent transition-colors hover:underline"
                >
                  <ExternalLink size={11} />
                  前往下载
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs text-white transition-colors hover:bg-accent-hover"
          >
            <Save size={13} />
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}
