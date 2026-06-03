const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noteFlow', {
  // Notes
  getNotesByRange: (start, end) => ipcRenderer.invoke('notes:getByRange', start, end),
  getNotesByDate: (date) => ipcRenderer.invoke('notes:getByDate', date),
  getNoteById: (id) => ipcRenderer.invoke('notes:getById', id),
  createNote: (data) => ipcRenderer.invoke('notes:create', data),
  updateNote: (data) => ipcRenderer.invoke('notes:update', data),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

  // Stats
  getYearStats: (year) => ipcRenderer.invoke('notes:getYearStats', year),
  getMonthDots: (yearMonth) => ipcRenderer.invoke('notes:getMonthDots', yearMonth),

  // Images
  saveImage: (data) => ipcRenderer.invoke('image:save', data),
  getImagesByNote: (noteId) => ipcRenderer.invoke('image:getByNote', noteId),
  readImage: (filename) => ipcRenderer.invoke('image:read', filename),
  deleteImage: (imageId) => ipcRenderer.invoke('image:delete', imageId),

  // Tags
  listTags: () => ipcRenderer.invoke('tags:list'),
  createTag: (name) => ipcRenderer.invoke('tags:create', { name }),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),

  // Charts
  getStatsData: (opts) => ipcRenderer.invoke('stats:getData', opts),
  extractBase64Images: (data) => ipcRenderer.invoke('image:extractBase64', data),

  // Dialog
  openImageDialog: () => ipcRenderer.invoke('dialog:openImage')
});
