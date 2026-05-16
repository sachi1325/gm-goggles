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
  // Sanitise inputs — strip tags, clamp length
  const safeName  = String(name  || '').replace(/<[^>]*>/g, '').trim().slice(0, 64);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#26d9a8';
  if (!safeName) return null;
  const profiles = readProfiles();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const profile = { id, name: safeName, color: safeColor, createdAt: Date.now() };
  profiles.push(profile);
  writeProfiles(profiles);
  profileDir(id); // create dir
  return profile;
});

ipcMain.handle('update-profile', (event, { id, name, color }) => {
  const safeName  = String(name  || '').replace(/<[^>]*>/g, '').trim().slice(0, 64);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#26d9a8';
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx >= 0) { profiles[idx] = { ...profiles[idx], name: safeName, color: safeColor }; writeProfiles(profiles); }
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
    if (!activeProfileId) return null;
    const allowed = profileUploadsDir(activeProfileId);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(allowed) + path.sep)) return null; // path traversal guard
    return { name: path.basename(resolved), content: fs.readFileSync(resolved, 'utf-8'), filePath: resolved };
  } catch (e) { return null; }
});

ipcMain.handle('delete-upload', (event, filePath) => {
  try {
    if (!activeProfileId) return false;
    const allowed = profileUploadsDir(activeProfileId);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(allowed) + path.sep)) return false; // path traversal guard
    fs.unlinkSync(resolved);
    const cacheFile = resolved + '.cache.json';
    if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
    return true;
  } catch (e) { return false; }
});

ipcMain.handle('get-uploads-dir', () => activeProfileId ? profileUploadsDir(activeProfileId) : '');

// ── IPC: Disk parse cache ─────────────────────────────────────
ipcMain.handle('read-disk-cache', (event, filePath) => {
  try {
    if (!activeProfileId) return null;
    const allowed = profileUploadsDir(activeProfileId);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(allowed) + path.sep)) return null; // path traversal guard
    const cacheFile = resolved + '.cache.json';
    if (!fs.existsSync(cacheFile)) return null;
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  } catch (e) { return null; }
});

ipcMain.handle('write-disk-cache', (event, { filePath, modifiedMs, format, readings }) => {
  try {
    if (!activeProfileId) return false;
    const allowed = profileUploadsDir(activeProfileId);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(allowed) + path.sep)) return false; // path traversal guard
    const cacheFile = resolved + '.cache.json';
    fs.writeFileSync(cacheFile, JSON.stringify({ modifiedMs, format, readings }));
    return true;
  } catch (e) { return false; }
});

// ── IPC: Aggregation cache ───────────────────────────────────
// Stored at profile root as agg-cache.json
function aggCachePath(id) {
  return path.join(profileDir(id), 'agg-cache.json');
}

ipcMain.handle('read-agg-cache', () => {
  if (!activeProfileId) return null;
  try {
    const p = aggCachePath(activeProfileId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { return null; }
});

ipcMain.handle('write-agg-cache', (event, payload) => {
  if (!activeProfileId) return false;
  try {
    fs.writeFileSync(aggCachePath(activeProfileId), JSON.stringify(payload));
    return true;
  } catch (e) { return false; }
});

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
  // Load API key from profile prefs — never trust key sent from renderer
  const prefs = activeProfileId ? readProfilePrefs(activeProfileId) : {};
  const safeKey = prefs.apiKey || process.env.ANTHROPIC_API_KEY || '';
  // Whitelist model and cap tokens
  const allowedModels = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'];
  const safeModel = allowedModels.includes(model) ? model : allowedModels[0];
  const safeTokens = Math.min(Math.max(1, parseInt(max_tokens) || 1000), 4096);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: safeModel, max_tokens: safeTokens, messages });
    const options = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'anthropic-version': '2023-06-01',
        'x-api-key': safeKey
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


// ── Reports ──────────────────────────────────────────────────
function profileReportsDir(id) {
  const dir = path.join(profileDir(id), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('list-reports', () => {
  if (!activeProfileId) return [];
  const dir = profileReportsDir(activeProfileId);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.pdf'))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, filePath: full, size: stat.size, createdAt: stat.birthtimeMs || stat.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
});

ipcMain.handle('open-report', (event, filePath) => {
  // Validate path is within active profile reports dir
  if (!activeProfileId) return false;
  const allowed = path.resolve(profileReportsDir(activeProfileId));
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowed + path.sep)) return false;
  require('electron').shell.openPath(resolved);
  return true;
});

ipcMain.handle('delete-report', (event, filePath) => {
  if (!activeProfileId) return false;
  const allowed = path.resolve(profileReportsDir(activeProfileId));
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowed + path.sep)) return false;
  try { fs.unlinkSync(resolved); return true; } catch (e) { return false; }
});

ipcMain.handle('generate-pdf-report', async (event, { reportHtml, filename }) => {
  if (!activeProfileId) return { error: 'No active profile' };
  const reportsDir = profileReportsDir(activeProfileId);
  const outPath = path.join(reportsDir, filename);

  // Create a hidden window to render the HTML and print to PDF
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,  // needed so report page can use ipcRenderer directly
    }
  });

  try {
    // Wait for the report page to signal charts are ready
    const chartsReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chart render timeout')), 12000);
      ipcMain.once('report-charts-ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Use loadURL with a temp file instead of data: URI to avoid length limits
    // and ensure scripts run correctly in Electron's renderer
    // Resolve absolute paths to local Chart.js builds (works offline, no CDN needed)
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    const chartJsPath = path.join(nodeModulesPath, 'chart.js', 'dist', 'chart.umd.js').replace(/\\/g, '/');
    const adapterPath = path.join(nodeModulesPath, 'chartjs-adapter-date-fns', 'dist', 'chartjs-adapter-date-fns.bundle.min.js').replace(/\\/g, '/');
    const resolvedHtml = reportHtml
      .replace('../node_modules/chart.js/dist/chart.umd.js', 'file:///' + chartJsPath)
      .replace('../node_modules/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js', 'file:///' + adapterPath);

    const tmpHtml = path.join(app.getPath('temp'), 'cgm-report-tmp.html');
    fs.writeFileSync(tmpHtml, resolvedHtml);
    await win.loadFile(tmpHtml);

    // Wait for charts to signal they are done
    await chartsReady;

    // Small buffer for final paint
    await new Promise(resolve => setTimeout(resolve, 200));

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    });

    fs.writeFileSync(outPath, pdfBuffer);
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
    win.close();
    return { success: true, filePath: outPath, name: filename };
  } catch (err) {
    try { win.close(); } catch (_) {}
    return { error: err.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
