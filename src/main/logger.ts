// src/main/logger.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const LOG_DIR = path.join(os.homedir(), '.ccw', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'ccw.log')
const LOG_BAK = path.join(LOG_DIR, 'ccw.log.bak')
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

let enabled = false

function rotate(): void {
  try {
    const stat = fs.statSync(LOG_FILE)
    if (stat.size >= MAX_SIZE) {
      if (fs.existsSync(LOG_BAK)) fs.unlinkSync(LOG_BAK)
      fs.renameSync(LOG_FILE, LOG_BAK)
    }
  } catch {
    // 文件不存在时忽略
  }
}

function write(level: string, module: string, msg: string, data?: unknown): void {
  if (!enabled) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    rotate()
    const ts = new Date().toISOString()
    const extra = data !== undefined ? ' ' + JSON.stringify(data) : ''
    const line = `[${ts}] [${level}] [${module}] ${msg}${extra}\n`
    fs.appendFileSync(LOG_FILE, line, 'utf-8')
  } catch {
    // 日志写入失败不影响主流程
  }
}

export const logger = {
  setEnabled(value: boolean): void {
    enabled = value
  },

  getLogPath(): string {
    return LOG_FILE
  },

  info(module: string, msg: string, data?: unknown): void {
    write('INFO', module, msg, data)
  },

  debug(module: string, msg: string, data?: unknown): void {
    write('DEBUG', module, msg, data)
  },

  warn(module: string, msg: string, data?: unknown): void {
    write('WARN', module, msg, data)
  },

  error(module: string, msg: string, data?: unknown): void {
    write('ERROR', module, msg, data)
  },
}
