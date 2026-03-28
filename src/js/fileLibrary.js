// File library — list, select and delete uploaded CSVs

// ── File Library ──────────────────────────────────────────────
let activeFilePath = '';
let detectedFormat = 'Unknown';

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatAge(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

async function loadFileLibrary() {
  const files = await window.electronAPI.listUploads();
  const list = document.getElementById('fileList');
  if (!files.length) {
    list.innerHTML = '<div class="file-list-empty">No files yet.<br>Open a CSV to get started.</div>';
    return;
  }
  list.innerHTML = files.map(f => `
    <div class="file-item ${f.filePath === activeFilePath ? 'active' : ''}"
         data-path="${f.filePath}" onclick="selectFile('${f.filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">
      <span class="file-item-icon">▤</span>
      <div class="file-item-info">
        <div class="file-item-name" title="${f.name}">${f.name}</div>
        <div class="file-item-meta">${formatBytes(f.size)} · ${formatAge(f.modified)}</div>
      </div>
      <button class="file-item-del" title="Remove from library"
        onclick="deleteFile(event, '${f.filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">×</button>
    </div>
  `).join('');
}

async function selectFile(filePath) {
  const result = await window.electronAPI.loadUpload(filePath);
  if (!result) return;
  activeFilePath = filePath;
  document.querySelectorAll('.file-item').forEach(el =>
    el.classList.toggle('active', el.dataset.path === filePath)
  );
  parseCSV(result.content);
  // Save last opened file in prefs
  window.electronAPI.savePrefs({ lastFile: filePath });
}

async function deleteFile(e, filePath) {
  e.stopPropagation();
  await window.electronAPI.deleteUpload(filePath);
  if (activeFilePath === filePath) activeFilePath = '';
  loadFileLibrary();
}
