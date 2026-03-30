import { contextBridge, ipcRenderer } from 'electron'

const api = {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value)
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  },
  git: {
    isRepo: (dir: string) => ipcRenderer.invoke('git:isRepo', dir),
    getRepoName: (dir: string) => ipcRenderer.invoke('git:getRepoName', dir),
    getCurrentBranch: (dir: string) => ipcRenderer.invoke('git:getCurrentBranch', dir),
    listWorktrees: (dir: string) => ipcRenderer.invoke('git:listWorktrees', dir),
    addWorktree: (repoPath: string, newBranch: string, targetDir: string, baseBranch: string) =>
      ipcRenderer.invoke('git:addWorktree', repoPath, newBranch, targetDir, baseBranch),
    removeWorktree: (repoPath: string, worktreePath: string) =>
      ipcRenderer.invoke('git:removeWorktree', repoPath, worktreePath),
    getBranches: (dir: string) => ipcRenderer.invoke('git:getBranches', dir),
    renameBranch: (worktreePath: string, oldBranch: string, newBranch: string) =>
      ipcRenderer.invoke('git:renameBranch', worktreePath, oldBranch, newBranch),
    merge: (repoPath: string, source: string, target: string, strategy: string) =>
      ipcRenderer.invoke('git:merge', repoPath, source, target, strategy)
  },
  pty: {
    create: (id: string, cwd: string, worktreeId: string) => ipcRenderer.invoke('pty:create', id, cwd, worktreeId),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    getBuffer: (id: string) => ipcRenderer.invoke('pty:getBuffer', id),
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `pty:data:${id}`
      const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onExit: (id: string, callback: () => void) => {
      const channel = `pty:exit:${id}`
      const handler = () => callback()
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  },
  app: {
    openExternal: (command: string, cwd: string) =>
      ipcRenderer.invoke('app:openExternal', command, cwd),
    detectInstalledApps: () => ipcRenderer.invoke('app:detectInstalledApps')
  },
  fs: {
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path)
  },
  path: {
    dirname: (filePath: string) => ipcRenderer.invoke('path:dirname', filePath)
  },
  notification: {
    onNotification: (cb: (payload: { worktreeId: string; type: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { worktreeId: string; type: string }) => cb(payload)
      ipcRenderer.on('ccw:notification', handler)
      return () => ipcRenderer.removeListener('ccw:notification', handler)
    }
  },
  tray: {
    setFlashing: (flashing: boolean) => ipcRenderer.invoke('tray:setFlashing', flashing),
    setVisible: (visible: boolean) => ipcRenderer.invoke('tray:setVisible', visible),
  },
  logger: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('logger:setEnabled', enabled),
    getLogPath: (): Promise<string> => ipcRenderer.invoke('logger:getLogPath'),
  },
  image: {
    saveTempFile: (base64Data: string, ext: string): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('image:saveTempFile', base64Data, ext),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
