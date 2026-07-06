const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  updateDiscordPresence: (details) => ipcRenderer.send("discord-rpc:update", details),
  clearDiscordPresence: () => ipcRenderer.send("discord-rpc:clear"),
  
  // Tray events
  onTrayPlayPause: (callback) => ipcRenderer.on("tray:play-pause", () => callback()),
  onTrayNext: (callback) => ipcRenderer.on("tray:next", () => callback()),
  onTrayPrev: (callback) => ipcRenderer.on("tray:prev", () => callback()),

  // Local filesystem downloader
  downloadTrack: (track, url) => ipcRenderer.send("download-track", { track, url }),
  onDownloadProgress: (callback) => ipcRenderer.on("download-progress", (event, data) => callback(data)),
  onDownloadCompleted: (callback) => ipcRenderer.on("download-completed", (event, data) => callback(data)),
  onDownloadFailed: (callback) => ipcRenderer.on("download-failed", (event, data) => callback(data)),
  
  // Check offline files
  getOfflineTrackPath: (trackId) => ipcRenderer.invoke("get-offline-track-path", trackId),
  deleteOfflineTrack: (trackId) => ipcRenderer.invoke("delete-offline-track", trackId),
  getDownloadedTrackIds: () => ipcRenderer.invoke("get-downloaded-tracks"),
  
  // Console logging to file
  writeLog: (level, msg) => ipcRenderer.send("log:write", { level, msg })
});
