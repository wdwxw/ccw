import { app, shell, BrowserWindow, ipcMain, dialog, Tray, nativeImage, Menu, nativeTheme, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import simpleGit from 'simple-git'
import * as fs from 'fs'
import { startHookServer, closeHookServer } from './ccwHookServer'
import * as os from 'os'
import { logger } from './logger'

let hookServerPort = 0

// Resolve a git path to a CCW worktree ID by scanning stored repos
function resolveWorktreeByPath(gitPath: string): string | undefined {
  const repos = store.get('repos') as Array<{
    id: string; path: string;
    worktrees: Array<{ id: string; path: string; status: string }>
  }>
  if (!Array.isArray(repos)) return undefined
  for (const repo of repos) {
    for (const wt of (repo.worktrees || [])) {
      if (wt.status === 'active' && wt.path === gitPath) return wt.id
    }
    // Also match repo root itself
    if (repo.path === gitPath) return repo.worktrees.find(w => w.status === 'active')?.id
  }
  return undefined
}


const ptyModule = require('node-pty')

interface DetectedApp {
  id: string
  name: string
  command: string
  icon: string
  iconBase64?: string
  installed: boolean
}

const KNOWN_DEV_APPS: Array<{
  bundleName: string
  id: string
  name: string
  command: string
  icon: string
  category: 'editor' | 'ide' | 'terminal'
}> = [
  { bundleName: 'Visual Studio Code.app', id: 'vscode', name: 'VS Code', command: 'open -a Visual Studio Code', icon: 'code', category: 'editor' },
  { bundleName: 'Cursor.app', id: 'cursor', name: 'Cursor', command: 'open -a Cursor', icon: 'edit', category: 'editor' },
  { bundleName: 'IntelliJ IDEA.app', id: 'idea', name: 'IntelliJ IDEA', command: 'open -a IntelliJ IDEA', icon: 'braces', category: 'ide' },
  { bundleName: 'IntelliJ IDEA CE.app', id: 'idea-ce', name: 'IDEA CE', command: 'open -a "IntelliJ IDEA CE"', icon: 'braces', category: 'ide' },
  { bundleName: 'Zed.app', id: 'zed', name: 'Zed', command: 'open -a Zed', icon: 'zap', category: 'editor' },
  { bundleName: 'WebStorm.app', id: 'webstorm', name: 'WebStorm', command: 'open -a WebStorm', icon: 'globe', category: 'ide' },
  { bundleName: 'PyCharm.app', id: 'pycharm', name: 'PyCharm', command: 'open -a PyCharm', icon: 'braces', category: 'ide' },
  { bundleName: 'PyCharm CE.app', id: 'pycharm-ce', name: 'PyCharm CE', command: 'open -a "PyCharm CE"', icon: 'braces', category: 'ide' },
  { bundleName: 'GoLand.app', id: 'goland', name: 'GoLand', command: 'open -a GoLand', icon: 'braces', category: 'ide' },
  { bundleName: 'CLion.app', id: 'clion', name: 'CLion', command: 'open -a CLion', icon: 'braces', category: 'ide' },
  { bundleName: 'Rider.app', id: 'rider', name: 'Rider', command: 'open -a Rider', icon: 'braces', category: 'ide' },
  { bundleName: 'RubyMine.app', id: 'rubymine', name: 'RubyMine', command: 'open -a RubyMine', icon: 'braces', category: 'ide' },
  { bundleName: 'PhpStorm.app', id: 'phpstorm', name: 'PhpStorm', command: 'open -a PhpStorm', icon: 'braces', category: 'ide' },
  { bundleName: 'Android Studio.app', id: 'android-studio', name: 'Android Studio', command: 'open -a "Android Studio"', icon: 'braces', category: 'ide' },
  { bundleName: 'Xcode.app', id: 'xcode', name: 'Xcode', command: 'open -a Xcode', icon: 'braces', category: 'ide' },
  { bundleName: 'Sublime Text.app', id: 'sublime', name: 'Sublime Text', command: 'subl', icon: 'type', category: 'editor' },
  { bundleName: 'Nova.app', id: 'nova', name: 'Nova', command: 'open -a Nova', icon: 'code', category: 'editor' },
  { bundleName: 'Fleet.app', id: 'fleet', name: 'Fleet', command: 'open -a Fleet', icon: 'zap', category: 'editor' },
  { bundleName: 'Atom.app', id: 'atom', name: 'Atom', command: 'atom', icon: 'code', category: 'editor' },
  { bundleName: 'TextMate.app', id: 'textmate', name: 'TextMate', command: 'open -a TextMate', icon: 'type', category: 'editor' },
  { bundleName: 'Codex.app', id: 'codex', name: 'Codex', command: 'open -a Codex', icon: 'code', category: 'editor' },
  { bundleName: 'WeCode.app', id: 'wecode', name: 'WeCode', command: 'open -a WeCode', icon: 'code', category: 'editor' },
  { bundleName: 'iTerm.app', id: 'iterm2', name: 'iTerm2', command: 'open -a iTerm', icon: 'terminal-square', category: 'terminal' },
  { bundleName: 'Warp.app', id: 'warp', name: 'Warp', command: 'open -a Warp', icon: 'terminal-square', category: 'terminal' },
  { bundleName: 'Alacritty.app', id: 'alacritty', name: 'Alacritty', command: 'open -a Alacritty', icon: 'terminal-square', category: 'terminal' },
  { bundleName: 'kitty.app', id: 'kitty', name: 'kitty', command: 'open -a kitty', icon: 'terminal-square', category: 'terminal' },
  { bundleName: 'Terminal.app', id: 'terminal', name: 'Terminal', command: 'open -a Terminal', icon: 'monitor', category: 'terminal' },
  { bundleName: 'Hyper.app', id: 'hyper', name: 'Hyper', command: 'open -a Hyper', icon: 'terminal-square', category: 'terminal' },
  // Git clients
  { bundleName: 'Sourcetree.app', id: 'sourcetree', name: 'SourceTree', command: 'open -a Sourcetree', icon: 'git-branch', category: 'git' },
  { bundleName: 'Sublime Merge.app', id: 'sublime-merge', name: 'Sublime Merge', command: 'open -a "Sublime Merge"', icon: 'git-merge', category: 'git' },
  { bundleName: 'Git Tower.app', id: 'git-tower', name: 'Git Tower', command: 'open -a "Git Tower"', icon: 'git-branch', category: 'git' },
  { bundleName: 'SmartGit.app', id: 'smartgit', name: 'SmartGit', command: 'open -a SmartGit', icon: 'git-branch', category: 'git' },
  { bundleName: 'Fork.app', id: 'fork', name: 'Fork', command: 'open -a Fork', icon: 'git-branch', category: 'git' }
]

async function extractAppIcon(appPath: string): Promise<string | undefined> {
  // Strategy 1: read .icns directly from the .app bundle via sips (more reliable in dev mode)
  try {
    const resourcesDir = join(appPath, 'Contents', 'Resources')
    const entries = fs.readdirSync(resourcesDir)
    const icns = entries.find((e) => e.endsWith('.icns'))
    if (icns) {
      const icnsPath = join(resourcesDir, icns)
      const tmpPath = join(app.getPath('temp'), `ccw_icon_${Date.now()}.png`)
      await new Promise<void>((resolve, reject) => {
        const { spawn } = require('child_process')
        const child = spawn('sips', [
          '-s', 'format', 'png',
          icnsPath,
          '--out', tmpPath,
          '--resampleHeightWidth', '32', '32'
        ])
        child.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`sips exit ${code}`))))
        child.on('error', reject)
      })
      const png = fs.readFileSync(tmpPath)
      fs.unlinkSync(tmpPath)
      return png.toString('base64')
    }
  } catch {
    // fall through to getFileIcon
  }

  // Strategy 2: fallback to Electron getFileIcon
  try {
    const icon = await app.getFileIcon(appPath, { size: 'normal' })
    if (icon.isEmpty()) return undefined
    const resized = icon.resize({ width: 32, height: 32 })
    return resized.toPNG().toString('base64')
  } catch {
    return undefined
  }
}

async function detectInstalledApps(): Promise<DetectedApp[]> {
  const appsDirs = ['/Applications', '/System/Applications', '/System/Applications/Utilities']
  const installedBundles = new Set<string>()

  for (const dir of appsDirs) {
    try {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        if (entry.endsWith('.app')) {
          installedBundles.add(entry)
        }
      }
    } catch {
      // dir not readable
    }
  }

  const detected: DetectedApp[] = []
  for (const knownApp of KNOWN_DEV_APPS) {
    if (installedBundles.has(knownApp.bundleName)) {
      let appFullPath = join('/Applications', knownApp.bundleName)
      for (const dir of appsDirs) {
        const candidate = join(dir, knownApp.bundleName)
        if (fs.existsSync(candidate)) {
          appFullPath = candidate
          break
        }
      }

      const iconBase64 = await extractAppIcon(appFullPath)

      detected.push({
        id: knownApp.id,
        name: knownApp.name,
        command: knownApp.command,
        icon: knownApp.icon,
        iconBase64: iconBase64 ? `data:image/png;base64,${iconBase64}` : undefined,
        installed: true
      })
    }
  }
  return detected
}

// Claude CLI 用 \u001b\r (ESC+CR) 作为换行信号，keybindings.json 里必须有此绑定才能生效
// CCW 启动时自动确保绑定存在，用户无需手动运行 /terminal-setup
const CLAUDE_SHIFT_ENTER_BINDING = {
  key: 'shift+enter',
  command: 'workbench.action.terminal.sendSequence',
  args: { text: '\u001b\r' },
  when: 'terminalFocus'
}

function ensureClaudeKeybinding(): void {
  const home = process.env.HOME || ''
  const keybindingPaths = [
    join(home, 'Library/Application Support/Cursor/User/keybindings.json'),
    join(home, 'Library/Application Support/Code/User/keybindings.json')
  ]

  for (const filePath of keybindingPaths) {
    try {
      if (!fs.existsSync(filePath)) continue

      const raw = fs.readFileSync(filePath, 'utf-8')
      // 去掉行注释再解析 JSON
      const stripped = raw.replace(/\/\/[^\n]*/g, '').trim()
      const bindings: any[] = JSON.parse(stripped || '[]')

      const idx = bindings.findIndex(
        (b) =>
          b.key === 'shift+enter' &&
          b.command === 'workbench.action.terminal.sendSequence'
      )

      if (idx >= 0) {
        if (bindings[idx].args?.text === '\u001b\r') continue // 已正确，跳过
        bindings[idx] = CLAUDE_SHIFT_ENTER_BINDING // 替换错误的旧绑定
      } else {
        bindings.push(CLAUDE_SHIFT_ENTER_BINDING) // 新增绑定
      }

      const output =
        '// Place your key bindings in this file to override the defaults\n' +
        JSON.stringify(bindings, null, 4) +
        '\n'
      fs.writeFileSync(filePath, output, 'utf-8')
    } catch {
      // 忽略不可访问的文件或无效 JSON
    }
  }
}

const store = new Store({
  defaults: {
    repos: [],
    configVersion: 4,
    lastExternalApp: 'vscode',
    externalApps: [] as DetectedApp[]
  }
})

// App detection happens in whenReady (requires app to be ready for getFileIcon)

interface PtyProcess {
  id: string
  pty: any
  buffer: string[]
}

const ptyProcesses = new Map<string, PtyProcess>()

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 12 },
    backgroundColor: '#0D1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Cmd+W：发 IPC 给渲染进程处理关闭 tab，只有 1 个 tab 时隐藏窗口到 Tray
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'w' && input.meta && !input.shift && !input.alt && !input.control) {
      console.log('[CCW-MAIN] Cmd+W detected, sending app:close-tab, isLoading=', mainWindow.webContents.isLoading())
      _e.preventDefault()
      mainWindow.webContents.send('app:close-tab')
    }
    if (input.type === 'keyDown' && input.key === 't' && input.meta && !input.shift && !input.alt && !input.control) {
      console.log('[CCW-MAIN] Cmd+T detected, sending app:new-tab')
      _e.preventDefault()
      mainWindow.webContents.send('app:new-tab')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

let mainWindowRef: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

// ── Tray ──────────────────────────────────────────────────────────────────────

let tray: Tray | null = null
let flashInterval: NodeJS.Timeout | null = null
let flashPhase = false

// ── Tray 图标生成 ──────────────────────────────────────────────────────────────
// 镂空风格：圆角矩形背景 + CCW 透明镂空
//   深色菜单栏 → 白色背景 + CCW 镂空
//   浅色菜单栏 → 深色背景 + CCW 镂空
//   动画/Active → 蓝色背景 + CCW 镂空
// 32×32 RGBA（scaleFactor=2 → 16pt 逻辑像素，符合 macOS HIG）

function _assemblePNG(rgba: Buffer, SIZE: number): Buffer {
  const zlib = require('zlib') as typeof import('zlib')
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }
  function chunk(type: string, data: Buffer): Buffer {
    const typeB = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
    return Buffer.concat([len, typeB, data, crcB])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
  for (let y = 0; y < SIZE; y++) {
    raw[y * (1 + SIZE * 4)] = 0
    rgba.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// 镂空风格通用生成：圆角矩形背景（PAD=0, BRAD=6）+ CCW 像素镂空
// SIZE=44px (22pt @2x)，与系统标准菜单栏图标尺寸一致
function buildTrayIconPNG(bgR: number, bgG: number, bgB: number): Buffer {
  const SIZE = 44
  const rgba = Buffer.alloc(SIZE * SIZE * 4, 0)
  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
    const i = (y * SIZE + x) * 4; rgba[i]=r; rgba[i+1]=g; rgba[i+2]=b; rgba[i+3]=a
  }
  // 圆角矩形背景（BRAD=6，边缘填满）
  const BRAD = 6, x1 = SIZE - 1, y1 = SIZE - 1
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const inTL = px < BRAD && py < BRAD
      const inTR = px > x1-BRAD && py < BRAD
      const inBL = px < BRAD && py > y1-BRAD
      const inBR = px > x1-BRAD && py > y1-BRAD
      if (inTL) { const dx=px-BRAD, dy=py-BRAD; if (dx*dx+dy*dy > BRAD*BRAD) continue }
      else if (inTR) { const dx=px-(x1-BRAD), dy=py-BRAD; if (dx*dx+dy*dy > BRAD*BRAD) continue }
      else if (inBL) { const dx=px-BRAD, dy=py-(y1-BRAD); if (dx*dx+dy*dy > BRAD*BRAD) continue }
      else if (inBR) { const dx=px-(x1-BRAD), dy=py-(y1-BRAD); if (dx*dx+dy*dy > BRAD*BRAD) continue }
      setPixel(px, py, bgR, bgG, bgB, 255)
    }
  }
  // CCW 像素镂空（单元格坐标系，每单元 = 2×2 像素，22-unit 网格）
  // C1: 列4..6 行8..12 | C2: 列8..10 行8..12 | W: 列12..16 行8..12
  function dot2(ux: number, uy: number): void {
    setPixel(ux*2, uy*2, 0,0,0,0);     setPixel(ux*2+1, uy*2, 0,0,0,0)
    setPixel(ux*2, uy*2+1, 0,0,0,0);   setPixel(ux*2+1, uy*2+1, 0,0,0,0)
  }
  function h(x0: number, x1: number, y: number): void { for (let x=x0;x<=x1;x++) dot2(x,y) }
  function v(x: number, y0: number, y1: number): void { for (let y=y0;y<=y1;y++) dot2(x,y) }
  h(4,6,8);  h(4,6,12); v(4,9,11)        // C 左
  h(8,10,8); h(8,10,12); v(8,9,11)       // C 中
  v(12,8,11); v(16,8,11)                  // W 两竖
  dot2(13,12); dot2(15,12); dot2(14,11)   // W 底部 V 型
  return _assemblePNG(rgba, SIZE)
}

function buildTrayIconIdle(_isDark: boolean): Electron.NativeImage {
  // 始终使用白色背景，CCW 镂空
  return nativeImage.createFromBuffer(buildTrayIconPNG(255, 255, 255), { scaleFactor: 2 })
}

function buildTrayIconActive(): Electron.NativeImage {
  return nativeImage.createFromBuffer(buildTrayIconPNG(26, 86, 219), { scaleFactor: 2 }) // #1A56DB
}

function createTray(): void {
  tray = new Tray(buildTrayIconIdle(nativeTheme.shouldUseDarkColors))
  tray.setToolTip('CCW — Git Worktree Manager')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 CCW',
      click: () => {
        const win = getMainWindow()
        if (win) { win.show(); win.focus() }
      }
    },
    { type: 'separator' },
    {
      label: '退出 CCW',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  // 系统深/浅色切换时更新图标
  nativeTheme.on('updated', () => {
    if (!tray || flashInterval) return
    tray.setImage(buildTrayIconIdle(nativeTheme.shouldUseDarkColors))
  })

  tray.on('double-click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
}

function startTrayFlash(): void {
  if (flashInterval) return
  flashInterval = setInterval(() => {
    flashPhase = !flashPhase
    tray?.setImage(flashPhase ? buildTrayIconActive() : buildTrayIconIdle(nativeTheme.shouldUseDarkColors))
  }, 600)
}

function stopTrayFlash(): void {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }
  flashPhase = false
  tray?.setImage(buildTrayIconIdle(nativeTheme.shouldUseDarkColors))
}

// ──────────────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ccw.app')

  // 覆盖 macOS 默认应用菜单，将 Cmd+W 改为向渲染进程发 IPC，而非关闭窗口
  if (process.platform === 'darwin') {
    const appMenu = Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          {
            label: 'New Terminal Tab',
            accelerator: 'CmdOrCtrl+T',
            click: () => {
              const win = getMainWindow()
              if (win && !win.isDestroyed()) win.webContents.send('app:new-tab')
            }
          },
          {
            label: 'Close Terminal Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              const win = getMainWindow()
              if (win && !win.isDestroyed()) win.webContents.send('app:close-tab')
            }
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          { role: 'toggleDevTools' }
        ]
      },
      {
        // 显式声明 Window 菜单，阻止 Electron 自动注入含 Cmd+W Close 的默认 Window 菜单
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
      }
    ])
    Menu.setApplicationMenu(appMenu)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers 必须在窗口创建前注册，防止 activate 提前触发时渲染进程找不到 handler
  registerIpcHandlers()

  // 自动配置 Claude CLI 换行所需的 IDE keybinding（用户无需手动运行 /terminal-setup）
  ensureClaudeKeybinding()

  // Detect installed apps with icons on startup
  const detectedApps = await detectInstalledApps()
  if (detectedApps.length > 0) {
    store.set('externalApps', detectedApps)
    const lastApp = store.get('lastExternalApp') as string
    if (!detectedApps.find((a) => a.id === lastApp)) {
      store.set('lastExternalApp', detectedApps[0].id)
    }
  }

  // Start CCW hook server for Claude Code notifications
  const debugLog = store.get('debugLog') as boolean | undefined
  logger.setEnabled(debugLog === true)
  logger.info('Main', 'app ready, starting hook server')

  hookServerPort = await startHookServer(({ worktreeId, gitPath, type, sessionId }) => {
    const resolvedId = worktreeId || (gitPath ? resolveWorktreeByPath(gitPath) : undefined)
    logger.info('Main', 'notification received', { worktreeId, gitPath, type, resolvedId, sessionId })
    if (!resolvedId) {
      logger.warn('Main', 'notification dropped: could not resolve worktreeId', { worktreeId, gitPath })
      return
    }
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('ccw:notification', { worktreeId: resolvedId, type, sessionId })
      logger.info('Main', 'ccw:notification sent to renderer', { worktreeId: resolvedId, type, sessionId })
    } else {
      logger.warn('Main', 'notification dropped: main window not available')
    }
  })

  mainWindowRef = createWindow()
  // 关闭主窗口时隐藏到 Tray 后台，只有 isQuitting=true 时才真正退出
  mainWindowRef.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault()
      mainWindowRef!.hide()
    }
  })

  // 根据用户设置决定是否显示 Tray 图标（默认显示）
  const showTrayIcon = store.get('showTrayIcon') as boolean | undefined
  if (showTrayIcon !== false) {
    createTray()
  }

  app.on('activate', () => {
    // hidden 窗口仍在 getAllWindows() 中，直接 show 即可；
    // 只有窗口被真正销毁（isQuitting 后重启场景）才重建
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    } else {
      mainWindowRef = createWindow()
      mainWindowRef.on('close', (e) => {
        if (!(app as any).isQuitting) {
          e.preventDefault()
          mainWindowRef!.hide()
        }
      })
    }
  })
})

app.on('window-all-closed', () => {
  for (const [, proc] of ptyProcesses) {
    proc.pty.kill()
  }
  ptyProcesses.clear()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  closeHookServer()
  stopTrayFlash()
  tray?.destroy()
  tray = null
})

function registerIpcHandlers(): void {
  // ── Tray ──
  ipcMain.handle('tray:setFlashing', (_e, flashing: boolean) => {
    if (flashing) startTrayFlash()
    else stopTrayFlash()
  })

  ipcMain.handle('tray:setVisible', (_e, visible: boolean) => {
    if (visible) {
      if (!tray) createTray()
    } else {
      stopTrayFlash()
      tray?.destroy()
      tray = null
    }
  })

  // ── Store ──
  ipcMain.handle('store:get', (_e, key: string) => store.get(key))
  ipcMain.handle('store:set', (_e, key: string, value: unknown) => store.set(key, value))

  // ── Dialog ──
  ipcMain.handle('dialog:openDirectory', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // ── Git ──
  ipcMain.handle('git:isRepo', async (_e, dirPath: string) => {
    try {
      const git = simpleGit(dirPath)
      const isRepo = await git.checkIsRepo()
      return isRepo
    } catch {
      return false
    }
  })

  ipcMain.handle('git:getRepoName', async (_e, dirPath: string) => {
    const parts = dirPath.split('/')
    return parts[parts.length - 1] || 'unknown'
  })

  ipcMain.handle('git:getCurrentBranch', async (_e, dirPath: string) => {
    try {
      const git = simpleGit(dirPath)
      const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
      return branch.trim()
    } catch {
      return 'main'
    }
  })

  ipcMain.handle('git:listWorktrees', async (_e, dirPath: string) => {
    try {
      const git = simpleGit(dirPath)
      const result = await git.raw(['worktree', 'list', '--porcelain'])
      const worktrees: Array<{ path: string; branch: string; head: string }> = []
      const blocks = result.trim().split('\n\n')
      for (const block of blocks) {
        const lines = block.split('\n')
        const wtPath = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '') || ''
        const branch =
          lines
            .find((l) => l.startsWith('branch '))
            ?.replace('branch ', '')
            .replace('refs/heads/', '') || ''
        const head = lines.find((l) => l.startsWith('HEAD '))?.replace('HEAD ', '') || ''
        if (wtPath) {
          worktrees.push({ path: wtPath, branch, head })
        }
      }
      return worktrees
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'git:addWorktree',
    async (_e, repoPath: string, newBranch: string, targetDir: string, baseBranch: string) => {
      const git = simpleGit(repoPath)
      // Strategy 1: create new branch based on baseBranch
      try {
        await git.raw(['worktree', 'add', '-b', newBranch, targetDir, baseBranch])
        return { success: true, branch: newBranch }
      } catch (err1: any) {
        // Strategy 2: if new branch name conflicts, try detached HEAD
        try {
          await git.raw(['worktree', 'add', '--detach', targetDir, baseBranch])
          return { success: true, branch: baseBranch }
        } catch (err2: any) {
          return { success: false, error: err2.message || err1.message }
        }
      }
    }
  )

  ipcMain.handle('git:removeWorktree', async (_e, repoPath: string, worktreePath: string) => {
    try {
      const git = simpleGit(repoPath)
      await git.raw(['worktree', 'remove', worktreePath, '--force'])
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'git:renameBranch',
    async (_e, worktreePath: string, oldBranch: string, newBranch: string) => {
      try {
        const git = simpleGit(worktreePath)
        await git.raw(['branch', '-m', oldBranch, newBranch])
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('git:getBranches', async (_e, dirPath: string) => {
    try {
      const git = simpleGit(dirPath)
      const result = await git.branch()
      return result.all
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'git:merge',
    async (
      _e,
      repoPath: string,
      sourceBranch: string,
      targetBranch: string,
      strategy: string
    ) => {
      try {
        const git = simpleGit(repoPath)
        await git.checkout(targetBranch)
        if (strategy === 'rebase') {
          await git.rebase([sourceBranch])
        } else if (strategy === 'squash') {
          await git.merge([sourceBranch, '--squash'])
        } else {
          await git.merge([sourceBranch])
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── PTY / Terminal ──
  ipcMain.handle('pty:create', (_e, id: string, cwd: string, worktreeId: string) => {
    if (ptyProcesses.has(id)) {
      const existing = ptyProcesses.get(id)!
      existing.pty.kill()
    }

    const shell = process.env.SHELL || '/bin/zsh'
    // 清理会话变量，防止嵌套会话问题（如 CLAUDECODE 导致 claude 命令报错）
    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDECODE
    delete cleanEnv.CLASP_SOCKET_PATH
    delete cleanEnv.CLAUDE_SESSION_PATH
    // 清除 VS Code / Cursor 特有标识，防止 Claude CLI 误将嵌入终端识别为
    // Cursor 终端并尝试配置 Shift+Enter（会与 Cursor 已有绑定冲突）
    // 去除这些变量后，Claude CLI 将使用标准 xterm Option+Enter 换行流程
    delete cleanEnv.TERM_PROGRAM
    delete cleanEnv.TERM_PROGRAM_VERSION
    delete cleanEnv.VSCODE_INJECTION
    delete cleanEnv.VSCODE_GIT_IPC_HANDLE
    delete cleanEnv.VSCODE_GIT_ASKPASS_EXTRA_ARGS
    delete cleanEnv.VSCODE_GIT_ASKPASS_NODE
    delete cleanEnv.VSCODE_GIT_ASKPASS_MAIN
    delete cleanEnv.VSCODE_NONCE
    delete cleanEnv.VSCODE_PID
    delete cleanEnv.VSCODE_AMD_ENTRYPOINT
    delete cleanEnv.VSCODE_CWD
    delete cleanEnv.VSCODE_HANDLES_UNCAUGHT_ERRORS
    delete cleanEnv.VSCODE_IPC_HOOK
    delete cleanEnv.VSCODE_NLS_CONFIG
    delete cleanEnv.VSCODE_PORTABLE
    delete cleanEnv.GIT_ASKPASS
    const pty = ptyModule.spawn(shell, ['--login'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: fs.existsSync(cwd) ? cwd : process.env.HOME || '/',
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        TERM_PROGRAM: 'vscode',
        LANG: process.env.LANG || 'en_US.UTF-8',
        CCW_WORKTREE_ID: worktreeId || '',
        CCW_SESSION_ID: id,
        CCW_HOOK_PORT: String(hookServerPort),
      }
    })

    const proc: PtyProcess = { id, pty, buffer: [] }
    ptyProcesses.set(id, proc)

    pty.onData((data: string) => {
      proc.buffer.push(data)
      if (proc.buffer.length > 5000) {
        proc.buffer = proc.buffer.slice(-3000)
      }
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:data:${id}`, data)
      }
    })

    pty.onExit(() => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pty:exit:${id}`)
      }
      ptyProcesses.delete(id)
    })

    return { success: true, pid: pty.pid }
  })

  ipcMain.handle('pty:write', (_e, id: string, data: string) => {
    const proc = ptyProcesses.get(id)
    if (proc) {
      proc.pty.write(data)
    }
  })

  ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) => {
    const proc = ptyProcesses.get(id)
    if (proc) {
      proc.pty.resize(cols, rows)
    }
  })

  ipcMain.handle('pty:kill', (_e, id: string) => {
    const proc = ptyProcesses.get(id)
    if (proc) {
      proc.pty.kill()
      ptyProcesses.delete(id)
    }
  })

  ipcMain.handle('pty:getBuffer', (_e, id: string) => {
    const proc = ptyProcesses.get(id)
    if (proc) {
      return proc.buffer.join('')
    }
    return ''
  })

  // ── External Apps ──
  ipcMain.handle('app:openExternal', async (_e, command: string, cwd: string) => {
    try {
      const { spawn } = require('child_process')
      const parts = command.split(/\s+/)

      if (parts[0] === 'open' && parts[1] === '-a') {
        const appName = parts.slice(2).join(' ')
        return new Promise((resolve) => {
          const child = spawn('open', ['-a', appName, cwd])
          child.on('close', (code: number) => {
            resolve({ success: code === 0, error: code !== 0 ? `exit code ${code}` : undefined })
          })
          child.on('error', (err: Error) => {
            resolve({ success: false, error: err.message })
          })
        })
      }

      return new Promise((resolve) => {
        const child = spawn(parts[0], [...parts.slice(1), cwd])
        child.on('close', (code: number) => {
          resolve({ success: code === 0, error: code !== 0 ? `exit code ${code}` : undefined })
        })
        child.on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
        })
      })
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:detectInstalledApps', async () => {
    return await detectInstalledApps()
  })

  ipcMain.handle('fs:exists', (_e, path: string) => {
    return fs.existsSync(path)
  })

  ipcMain.handle('path:dirname', (_e, filePath: string) => {
    const { dirname } = require('path')
    return dirname(filePath)
  })

  ipcMain.handle('logger:setEnabled', (_e, enabled: boolean) => {
    logger.setEnabled(enabled)
    logger.info('Main', `debug logging ${enabled ? 'enabled' : 'disabled'}`)
  })

  ipcMain.handle('logger:getLogPath', () => {
    return logger.getLogPath()
  })

  // ── Image ──
  // ── Update Check ──
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:checkUpdate', async () => {
    try {
      const res = await net.fetch(
        'https://api.github.com/repos/wangchen12/ccw2/releases/latest',
        { headers: { 'User-Agent': 'CCW-App' } }
      )
      if (!res.ok) return { error: `请求失败 (${res.status})` }
      const data = await res.json() as { tag_name: string; html_url: string; name: string }
      const latestVersion = data.tag_name.replace(/^v/, '')
      const currentVersion = app.getVersion()
      const hasUpdate = latestVersion !== currentVersion
      return { hasUpdate, latestVersion, currentVersion, downloadUrl: data.html_url }
    } catch (e: any) {
      return { error: '网络连接失败，请稍后再试' }
    }
  })

  ipcMain.handle('app:openUrl', (_e, url: string) => {
    shell.openExternal(url)
  })

  // ── Image ──
  ipcMain.handle('image:saveTempFile', (_e, base64Data: string, ext: string) => {
    try {
      const { randomUUID } = require('crypto') as typeof import('crypto')
      const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'png'
      const tmpPath = join(os.tmpdir(), `ccw-img-${randomUUID()}.${safeExt}`)
      const buf = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(tmpPath, buf)
      return { success: true, path: tmpPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
