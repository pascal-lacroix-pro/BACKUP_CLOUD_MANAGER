const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rcloneAPI', {

  diff(src, dst) {
    ipcRenderer.send('rclone:diff', { src, dst })
  },

  run(src, dst, filesList) {
    ipcRenderer.send('rclone:run', { src, dst, filesList })
  },

  stop() {
    ipcRenderer.send('rclone:stop')
  },

  listRemotes() {
    return ipcRenderer.invoke('rclone:listremotes')
  },

  browse() {
    return ipcRenderer.invoke('dialog:browse')
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
