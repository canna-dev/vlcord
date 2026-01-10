const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vlcord', {
  quit: () => ipcRenderer.invoke('vlcord:quit'),
  show: () => ipcRenderer.invoke('vlcord:show'),
});
