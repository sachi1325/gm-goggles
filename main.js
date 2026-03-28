const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;
let activeProfileId = null; // set after profile selection

// ── Base paths ────────────────────────────────────────────────
const userData = () => app.getPath('userData');
const profilesFile = () => path.join(userData(), 'profiles.json');
const globalPrefsFile = () => path.join(userData(), 'global.json');

// ── Profile helpers ───────────────────────────────────────────
function readProfiles() {
  try {
    if (fs.existsSync(profilesFile()))
      return JSON.parse(fs.readFileSync(profilesFile(), 'utf-8'));
  } catch (e) {}
  return [];
}

function writeProfiles(profiles) {
  fs.writeFileSync(profilesFile(), JSON.stringify(profiles, null, 2));
}

function profileDir(id) {
  const dir = path.join(userData(), 'profiles', id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function profileUploadsDir(id) {
  const dir = path.join(profileDir(id), 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function profilePrefsFile(id) {
  return path.join(profileDir(id), 'preferences.json');
}

function readProfilePrefs(id) {
  try {
    const f = profilePrefsFile(id);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch (e) {}
  return {};
}

function writeProfilePrefs(id, prefs) {
  fs.writeFileSync(profilePrefsFile(id), JSON.stringify(prefs, null, 2));
}

// ── Global prefs (last used profile) ─────────────────────────
function readGlobalPrefs() {
  try {
    if (fs.existsSync(globalPrefsFile()))
      return JSON.parse(fs.readFileSync(globalPrefsFile(), 'utf-8'));
  } catch (e) {}
  return {};
}

function writeGlobalPrefs(prefs) {
  fs.writeFileSync(globalPrefsFile(), JSON.stringify(prefs, null, 2));
}

// ── Window ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 820, minWidth: 800, minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  const menuTemplate = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open CSV...', accelerator: 'CmdOrCtrl+O', click: () => openFileDialog() },
        { type: 'separator' },
        { label: 'Load Sample Data', click: () => mainWindow.webContents.send('load-demo') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// ── File dialog — copies into active profile's uploads ────────
async function openFileDialog() {
  if (!activeProfileId) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open CGM Export',
    filters: [{ name: 'CSV Files', extensions: ['csv', 'txt'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const src = result.filePaths[0];
    const name = path.basename(src);
    const dest = path.join(profileUploadsDir(activeProfileId), name);
    if (src !== dest) fs.copyFileSync(src, dest);
    const content = fs.readFileSync(dest, 'utf-8');
    mainWindow.webContents.send('file-loaded', { name, content, filePath: dest });
  }
}

// ── IPC: Profiles ─────────────────────────────────────────────
ipcMain.handle('list-profiles', () => readProfiles());

ipcMain.handle('create-profile', (event, { name, color }) => {
  const profiles = readProfiles();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const profile = { id, name, color, createdAt: Date.now() };
  profiles.push(profile);
  writeProfiles(profiles);
  profileDir(id); // create dir
  return profile;
});

ipcMain.handle('update-profile', (event, { id, name, color }) => {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx >= 0) { profiles[idx] = { ...profiles[idx], name, color }; writeProfiles(profiles); }
  return profiles[idx] || null;
});

ipcMain.handle('delete-profile', (event, id) => {
  const profiles = readProfiles().filter(p => p.id !== id);
  writeProfiles(profiles);
  // Remove profile data directory
  const dir = path.join(userData(), 'profiles', id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return true;
});

ipcMain.handle('set-active-profile', (event, id) => {
  activeProfileId = id;
  writeGlobalPrefs({ ...readGlobalPrefs(), lastProfileId: id });
  return true;
});

ipcMain.handle('get-active-profile', () => {
  if (activeProfileId) {
    const profiles = readProfiles();
    return profiles.find(p => p.id === activeProfileId) || null;
  }
  return null;
});

ipcMain.handle('get-last-profile-id', () => {
  return readGlobalPrefs().lastProfileId || null;
});

// ── IPC: Files (profile-scoped) ───────────────────────────────
ipcMain.handle('open-file-dialog', openFileDialog);

ipcMain.handle('list-uploads', () => {
  if (!activeProfileId) return [];
  const dir = profileUploadsDir(activeProfileId);
  return fs.readdirSync(dir)
    .filter(f => /\.(csv|txt)$/i.test(f))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, filePath: full, size: stat.size, modified: stat.mtimeMs };
    })
    .sort((a, b) => b.modified - a.modified);
});

ipcMain.handle('load-upload', (event, filePath) => {
  try {
    return { name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf-8'), filePath };
  } catch (e) { return null; }
});

ipcMain.handle('delete-upload', (event, filePath) => {
  try { fs.unlinkSync(filePath); return true; } catch (e) { return false; }
});

ipcMain.handle('get-uploads-dir', () => activeProfileId ? profileUploadsDir(activeProfileId) : '');

// ── IPC: Prefs (profile-scoped) ───────────────────────────────
ipcMain.handle('save-prefs', (event, updates) => {
  if (!activeProfileId) return false;
  writeProfilePrefs(activeProfileId, { ...readProfilePrefs(activeProfileId), ...updates });
  return true;
});

ipcMain.handle('load-prefs', () => {
  if (!activeProfileId) return {};
  const prefs = readProfilePrefs(activeProfileId);
  if (!prefs.apiKey) prefs.apiKey = process.env.ANTHROPIC_API_KEY || '';
  return prefs;
});

ipcMain.handle('save-api-key', (event, key) => {
  if (!activeProfileId) return false;
  writeProfilePrefs(activeProfileId, { ...readProfilePrefs(activeProfileId), apiKey: key });
  return true;
});

ipcMain.handle('load-api-key', () => {
  if (!activeProfileId) return process.env.ANTHROPIC_API_KEY || '';
  const p = readProfilePrefs(activeProfileId);
  return p.apiKey || process.env.ANTHROPIC_API_KEY || '';
});

// ── IPC: Anthropic ────────────────────────────────────────────
ipcMain.handle('call-anthropic', (event, { messages, model, max_tokens, apiKey }) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, max_tokens, messages });
    const options = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey || ''
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
