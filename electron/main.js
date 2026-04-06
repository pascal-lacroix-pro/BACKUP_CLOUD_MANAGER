import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import fs from 'fs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '..', '.env')
require('dotenv').config({ path: envPath })

const isDev = !app.isPackaged

// ─── Fenêtre principale ───────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 620,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? 'http://localhost:5173' : 'file://'
    if (!url.startsWith(allowed)) event.preventDefault()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFABCDJsu]/g, '')
    .replace(/\r/g, '')
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Convertit le format compact rclone en bytes : "7.432Mi" → 7794892, "0" → 0
function parseRcloneSize(sizeStr) {
  if (!sizeStr) return 0
  const m = sizeStr.trim().match(/^([\d.]+)\s*([kMGTPE]?i?)$/)
  if (!m) return 0
  const value = parseFloat(m[1])
  const suffix = m[2]
  const multipliers = { '': 1, 'k': 1e3, 'ki': 1024, 'M': 1e6, 'Mi': 1024 ** 2, 'G': 1e9, 'Gi': 1024 ** 3, 'T': 1e12, 'Ti': 1024 ** 4 }
  return Math.min(Math.round(value * (multipliers[suffix] ?? 1)), 1e13) // cap à ~10 TB
}

function formatDate(d) {
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidRelativePath(p) {
  if (typeof p !== 'string') return false
  if (p.trim() === '') return false
  if (/\.\./.test(p)) return false
  if (/[;&|`$!*?{}[\]<>\\]/.test(p)) return false
  return true
}

// ─── Construction des args rclone ─────────────────────────────────────────────

function buildRcloneArgs(subPath, direction, dryRun) {
  const ssdBase       = process.env.VITE_SSD_PATH
  const dropboxRemote = process.env.VITE_DROPBOX_REMOTE

  if (!ssdBase || !dropboxRemote) {
    throw new Error('VITE_SSD_PATH ou VITE_DROPBOX_REMOTE manquant dans le fichier .env')
  }

  const ssdFull     = path.join(ssdBase, subPath)
  const dropboxFull = `${dropboxRemote}:${subPath}`

  const [src, dst] = direction === 'ssd-to-dropbox'
    ? [ssdFull, dropboxFull]
    : [dropboxFull, ssdFull]

  // localBase = répertoire source local (pour fs.statSync), null si source distante
  const localBase  = direction === 'ssd-to-dropbox' ? ssdFull : null
  const remoteSrc  = direction === 'dropbox-to-ssd' ? dropboxFull : null

  const args = ['copy', src, dst, '--progress', '--log-level', 'INFO']
  if (dryRun) args.push('--dry-run')

  return { args, localBase, remoteSrc }
}

// ─── Parsing des lignes rclone → événements fichiers ──────────────────────────

// Capture le nom + la taille au format rclone : "7.432Mi", "0", "1.2Gi", etc.
const RE_FILE_DRYRUN = /(?:NOTICE|INFO)\s*:\s+(.+?):\s+Skipped copy as --dry-run is set(?:\s+\(size ([^)]+)\))?/
const RE_FILE_COPIED = /(?:NOTICE|INFO)\s*:\s+(.+?):\s+Copied/

function statDate(localBase, name) {
  if (!localBase) return '—'
  try {
    return formatDate(fs.statSync(path.join(localBase, name)).mtime)
  } catch {
    return '—'
  }
}

// Récupère les métadonnées (date de modification) d'une source distante via lsjson.
// Retourne une Map : chemin relatif → Date
const LSJSON_MAX_BYTES = 50 * 1024 * 1024  // 50 MB max — protection contre les remotes énormes

function fetchRemoteMeta(rcloneBin, remotePath) {
  return new Promise((resolve) => {
    const chunks = []
    let totalBytes = 0
    let aborted = false

    const proc = spawn(rcloneBin, ['lsjson', remotePath, '--recursive', '--max-depth', '10'])

    proc.stdout.on('data', (d) => {
      totalBytes += d.length
      if (totalBytes > LSJSON_MAX_BYTES) {
        aborted = true
        proc.kill('SIGTERM')
        resolve(new Map())
        return
      }
      chunks.push(d)
    })

    proc.on('close', () => {
      if (aborted) return
      try {
        const files = JSON.parse(Buffer.concat(chunks).toString())
        const map = new Map()
        files.forEach(f => { if (!f.IsDir) map.set(f.Path, new Date(f.ModTime)) })
        resolve(map)
      } catch {
        resolve(new Map())
      }
    })

    proc.on('error', () => resolve(new Map()))
  })
}

function processFileLine(event, line, localBase, fileMeta) {
  function getDate(name) {
    if (fileMeta?.has(name)) return formatDate(fileMeta.get(name))
    return statDate(localBase, name)
  }

  const dryMatch = line.match(RE_FILE_DRYRUN)
  if (dryMatch) {
    const name      = dryMatch[1].trim()
    const sizeBytes = parseRcloneSize(dryMatch[2])
    const size      = formatBytes(sizeBytes)
    event.reply('rclone:file', { name, size, sizeBytes, date: getDate(name), status: 'pending' })
    return
  }

  const copyMatch = line.match(RE_FILE_COPIED)
  if (copyMatch) {
    const name = copyMatch[1].trim()
    event.reply('rclone:file', { name, date: getDate(name), status: 'done' })
  }
}

// ─── IPC : arrêt d'urgence ────────────────────────────────────────────────────

let currentProc = null

ipcMain.on('rclone:stop', () => {
  if (currentProc) {
    currentProc.kill('SIGTERM')
    // currentProc sera nullé par le handler 'close'
  }
})

// ─── IPC : exécution de rclone ────────────────────────────────────────────────

ipcMain.on('rclone:run', async (event, { subPath, direction, dryRun }) => {
  if (!isValidRelativePath(subPath)) {
    event.reply('rclone:log', '[ERREUR] Chemin invalide.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  if (!['ssd-to-dropbox', 'dropbox-to-ssd'].includes(direction)) {
    event.reply('rclone:log', '[ERREUR] Direction invalide.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  const safeDryRun = dryRun === true

  const rcloneBin = process.env.VITE_RCLONE_PATH || '/usr/local/bin/rclone'
  if (!rcloneBin.startsWith('/')) {
    event.reply('rclone:log', '[ERREUR] VITE_RCLONE_PATH doit être un chemin absolu.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  let args, localBase, remoteSrc
  try {
    ;({ args, localBase, remoteSrc } = buildRcloneArgs(subPath, direction, safeDryRun))
  } catch (err) {
    event.reply('rclone:log', `[ERREUR] ${err.message}`)
    event.reply('rclone:done', { code: 1 })
    return
  }

  // Pour dropbox-to-ssd : récupère les dates de modification via lsjson
  let fileMeta = new Map()
  if (remoteSrc) {
    event.reply('rclone:log', `[INFO] Récupération des métadonnées (${remoteSrc})…`)
    fileMeta = await fetchRemoteMeta(rcloneBin, remoteSrc)
  }

  event.reply('rclone:log', `$ ${rcloneBin} ${args.join(' ')}`)

  currentProc = spawn(rcloneBin, args)

  const handleData = (data) => {
    const text = stripAnsi(data.toString())
    event.reply('rclone:log', text)
    text.split('\n').forEach(l => processFileLine(event, l.trim(), localBase, fileMeta))
  }

  currentProc.stdout.on('data', handleData)
  currentProc.stderr.on('data', handleData)

  currentProc.on('close', (code) => {
    currentProc = null
    event.reply('rclone:done', { code: code ?? 1 })
  })

  currentProc.on('error', (err) => {
    currentProc = null
    event.reply('rclone:log', `[ERREUR] Impossible de lancer rclone : ${err.message}`)
    event.reply('rclone:done', { code: 1 })
  })
})

// ─── IPC : dialog de confirmation ─────────────────────────────────────────────

ipcMain.handle('dialog:confirm', async (_event, message) => {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Annuler', 'Confirmer'],
    defaultId: 0,
    cancelId: 0,
    title: 'Confirmation',
    message,
  })
  return response === 1
})
