const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rcloneAPI', {

  run(subPath, direction, dryRun) {
    ipcRenderer.send('rclone:run', { subPath, direction, dryRun })
  },

  stop() {
    ipcRenderer.send('rclone:stop')
  },

  onLog(callback) {
    const handler = (_event, line) => callback(line)
    ipcRenderer.on('rclone:log', handler)
    return () => ipcRenderer.removeListener('rclone:log', handler)
  },

  onFile(callback) {
    const handler = (_event, file) => callback(file)
    ipcRenderer.on('rclone:file', handler)
    return () => ipcRenderer.removeListener('rclone:file', handler)
  },

  onDone(callback) {
    const handler = (_event, result) => callback(result)
    ipcRenderer.on('rclone:done', handler)
    return () => ipcRenderer.removeListener('rclone:done', handler)
  },

  confirm(message) {
    return ipcRenderer.invoke('dialog:confirm', message)
  },
})
