const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Profiles
  listProfiles:     ()              => ipcRenderer.invoke('list-profiles'),
  createProfile:    (data)          => ipcRenderer.invoke('create-profile', data),
  updateProfile:    (data)          => ipcRenderer.invoke('update-profile', data),
  deleteProfile:    (id)            => ipcRenderer.invoke('delete-profile', id),
  setActiveProfile: (id)            => ipcRenderer.invoke('set-active-profile', id),
  getActiveProfile: ()              => ipcRenderer.invoke('get-active-profile'),
  getLastProfileId: ()              => ipcRenderer.invoke('get-last-profile-id'),
  // Files
  openFileDialog:   ()              => ipcRenderer.invoke('open-file-dialog'),
  listUploads:      ()              => ipcRenderer.invoke('list-uploads'),
  loadUpload:       (filePath)      => ipcRenderer.invoke('load-upload', filePath),
  deleteUpload:     (filePath)      => ipcRenderer.invoke('delete-upload', filePath),
  readDiskCache:    (filePath)      => ipcRenderer.invoke('read-disk-cache', filePath),
  writeDiskCache:   (payload)       => ipcRenderer.invoke('write-disk-cache', payload),
  readAggCache:     ()              => ipcRenderer.invoke('read-agg-cache'),
  writeAggCache:    (payload)       => ipcRenderer.invoke('write-agg-cache', payload),
  getUploadsDir:    ()              => ipcRenderer.invoke('get-uploads-dir'),
  // Prefs
  savePrefs:        (updates)       => ipcRenderer.invoke('save-prefs', updates),
  loadPrefs:        ()              => ipcRenderer.invoke('load-prefs'),
  saveApiKey:       (key)           => ipcRenderer.invoke('save-api-key', key),
  loadApiKey:       ()              => ipcRenderer.invoke('load-api-key'),
  // Anthropic
  callAnthropic:    (payload)       => ipcRenderer.invoke('call-anthropic', payload),
  // Events
  onFileLoaded:     (cb)            => ipcRenderer.on('file-loaded', (_, data) => cb(data)),
  onLoadDemo:       (cb)            => ipcRenderer.on('load-demo', () => cb()),
  platform: process.platform
});
