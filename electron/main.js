import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'

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
    height: 720,
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

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(d) {
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFABCDJsu]/g, '')
    .replace(/\r/g, '')
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidRclonePath(p) {
  if (typeof p !== 'string' || p.trim() === '') return false
  if (p.includes(':')) {
    const colonIdx = p.indexOf(':')
    const remote  = p.slice(0, colonIdx)
    const subPath = p.slice(colonIdx + 1)
    if (!/^[\w][\w.-]*$/.test(remote)) return false
    if (/\.\./.test(subPath)) return false
    if (/[;&|`$!*?{}[\]<>\\]/.test(subPath)) return false
  } else {
    if (!p.startsWith('/')) return false
    if (/\.\./.test(p)) return false
    if (/[;&|`$!*?{}[\]<>\\]/.test(p)) return false
  }
  return true
}

// ─── lsjson : liste les fichiers d'un chemin (local ou remote) ────────────────

const LSJSON_MAX_BYTES = 50 * 1024 * 1024

function lsjson(rcloneBin, rclonePath) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0
    let aborted = false

    const proc = spawn(rcloneBin, ['lsjson', rclonePath, '--recursive', '--max-depth', '10'])

    proc.stdout.on('data', (d) => {
      totalBytes += d.length
      if (totalBytes > LSJSON_MAX_BYTES) {
        aborted = true
        proc.kill('SIGTERM')
        reject(new Error(`Le listing de "${rclonePath}" dépasse 50 MB, dossier trop volumineux.`))
        return
      }
      chunks.push(d)
    })

    proc.on('close', (code) => {
      if (aborted) return
      if (code !== 0) { reject(new Error(`lsjson a échoué (code ${code}) sur "${rclonePath}"`)); return }
      try {
        const files = JSON.parse(Buffer.concat(chunks).toString())
        // Retourne un Map : Path → { size, date }
        const map = new Map()
        files.forEach(f => {
          if (!f.IsDir) map.set(f.Path, { size: f.Size, date: new Date(f.ModTime) })
        })
        resolve(map)
      } catch {
        reject(new Error(`Impossible de parser le listing de "${rclonePath}"`))
      }
    })

    proc.on('error', (err) => reject(err))
  })
}

// ─── Parsing des lignes rclone APPLY → événements fichiers ───────────────────

const RE_FILE_COPIED = /(?:NOTICE|INFO)\s*:\s+(.+?):\s+Copied/

function processApplyLine(event, line, srcMap) {
  const copyMatch = line.match(RE_FILE_COPIED)
  if (copyMatch) {
    const name = copyMatch[1].trim()
    const meta = srcMap.get(name)
    const date = meta ? formatDate(meta.date) : '—'
    event.reply('rclone:file', { name, date, status: 'done' })
  }
}

// ─── IPC : arrêt d'urgence ────────────────────────────────────────────────────

let currentProc = null

ipcMain.on('rclone:stop', () => {
  if (currentProc) currentProc.kill('SIGTERM')
})

// ─── IPC : listremotes ────────────────────────────────────────────────────────

ipcMain.handle('rclone:listremotes', async () => {
  const rcloneBin = process.env.VITE_RCLONE_PATH || '/usr/local/bin/rclone'
  return new Promise((resolve) => {
    const proc = spawn(rcloneBin, ['listremotes'])
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', () => {
      const remotes = out.split('\n').map(r => r.trim().replace(/:$/, '')).filter(Boolean)
      resolve(remotes)
    })
    proc.on('error', () => resolve([]))
  })
})

// ─── IPC : browse (sélection dossier local) ───────────────────────────────────

ipcMain.handle('dialog:browse', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// ─── IPC : diff (TEST) ────────────────────────────────────────────────────────
// Deux lsjson en parallèle → diff en mémoire → émet rclone:file pour chaque absent

ipcMain.on('rclone:diff', async (event, { src, dst }) => {
  if (!isValidRclonePath(src) || !isValidRclonePath(dst)) {
    event.reply('rclone:log', '[ERREUR] Chemin source ou destination invalide.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  const rcloneBin = process.env.VITE_RCLONE_PATH || '/usr/local/bin/rclone'

  event.reply('rclone:log', `[INFO] Listing en parallèle…\n  src: ${src}\n  dst: ${dst}`)

  let srcMap, dstMap
  try {
    ;[srcMap, dstMap] = await Promise.all([lsjson(rcloneBin, src), lsjson(rcloneBin, dst)])
  } catch (err) {
    event.reply('rclone:log', `[ERREUR] ${err.message}`)
    event.reply('rclone:done', { code: 1 })
    return
  }

  // Diff : fichiers présents dans src mais absents de dst, ou même nom mais taille différente
  const IGNORED = /^(|.*\/).DS_Store$/
  let missing = 0
  for (const [filePath, srcMeta] of srcMap) {
    if (IGNORED.test(filePath)) continue
    const dstMeta = dstMap.get(filePath)
    if (!dstMeta || dstMeta.size !== srcMeta.size) {
      missing++
      event.reply('rclone:file', {
        name:      filePath,
        size:      formatBytes(srcMeta.size),
        sizeBytes: srcMeta.size,
        date:      formatDate(srcMeta.date),
        status:    'pending',
      })
    }
  }

  event.reply('rclone:log', `[INFO] Diff terminé : ${srcMap.size} fichiers source, ${dstMap.size} destination, ${missing} à copier.`)
  event.reply('rclone:done', { code: 0 })
})

// ─── IPC : run (APPLY) ────────────────────────────────────────────────────────

ipcMain.on('rclone:run', async (event, { src, dst, filesList }) => {
  if (!isValidRclonePath(src) || !isValidRclonePath(dst)) {
    event.reply('rclone:log', '[ERREUR] Chemin source ou destination invalide.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  const rcloneBin = process.env.VITE_RCLONE_PATH || '/usr/local/bin/rclone'
  if (!rcloneBin.startsWith('/')) {
    event.reply('rclone:log', '[ERREUR] VITE_RCLONE_PATH doit être un chemin absolu.')
    event.reply('rclone:done', { code: 1 })
    return
  }

  const args = ['copy', src, dst, '--progress', '--log-level', 'INFO', '--no-update-modtime']

  // Liste des fichiers connue depuis le diff → pas de re-scan
  let tmpFile = null
  if (Array.isArray(filesList) && filesList.length > 0) {
    tmpFile = path.join(os.tmpdir(), `bcm-files-${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, filesList.join('\n'), 'utf8')
    args.push('--files-from', tmpFile, '--no-traverse')
  }

  // On recharge le srcMap pour avoir les dates à jour lors des événements "done"
  // (léger, uniquement les fichiers à copier grâce à --no-traverse)
  let srcMap = new Map()
  try {
    srcMap = await lsjson(rcloneBin, src)
  } catch { /* non bloquant, les dates seront "—" */ }

  event.reply('rclone:log', `$ ${rcloneBin} ${args.join(' ')}`)

  currentProc = spawn(rcloneBin, args)

  const handleData = (data) => {
    const text = stripAnsi(data.toString())
    event.reply('rclone:log', text)
    text.split('\n').forEach(l => processApplyLine(event, l.trim(), srcMap))
  }

  currentProc.stdout.on('data', handleData)
  currentProc.stderr.on('data', handleData)

  currentProc.on('close', (code) => {
    currentProc = null
    if (tmpFile) try { fs.unlinkSync(tmpFile) } catch {}
    event.reply('rclone:done', { code: code ?? 1 })
  })

  currentProc.on('error', (err) => {
    currentProc = null
    if (tmpFile) try { fs.unlinkSync(tmpFile) } catch {}
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
