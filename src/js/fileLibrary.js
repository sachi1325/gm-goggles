// File library — sidebar list with All Data + individual files

// ── State ─────────────────────────────────────────────────────
let activeFilePath = ''; // '' means All Data is active

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

// ── Per-file cache helpers ────────────────────────────────────
async function resolveFromCache(filePath, modifiedMs) {
  const mem = getCached(filePath, modifiedMs);
  if (mem) return mem;
  const disk = await window.electronAPI.readDiskCache(filePath);
  if (disk && disk.modifiedMs === modifiedMs) {
    const restored = disk.readings.map(r => ({ ts: new Date(r.ts), gl: r.gl }));
    setCache(filePath, modifiedMs, { readings: restored, format: disk.format });
    return { readings: restored, format: disk.format };
  }
  return null;
}

// ── Apply data and re-render all views ────────────────────────
function applyReadings(newReadings, label) {
  readings = newReadings;
  updateFormatBadge({ label });
  // Always re-render overview
  renderDashboard();
  // Also re-render whichever non-overview page is currently visible,
  // so the user doesn't have to click a range button to see fresh data
  const active = document.querySelector('.page.active');
  if (!active) return;
  const page = active.id.replace('page-', '');
  requestAnimationFrame(() => {
    if (page === 'trends')   {
      if (chart2) { chart2.destroy(); chart2 = null; }
      if (tirChart) { tirChart.destroy(); tirChart = null; }
      renderChart(activeRange2, 'glucoseChart2', chart2, c => chart2 = c, activeRes2);
      renderDailyTIR();
    }
    if (page === 'patterns') renderPatterns('patternGrid2');
    if (page === 'daily')    {
      if (hourlyChart) { hourlyChart.destroy(); hourlyChart = null; }
      renderDailyPage(activeDailyRange);
    }
  });
}

// ── Render file list ──────────────────────────────────────────
async function loadFileLibrary() {
  const files = await window.electronAPI.listUploads();
  const list  = document.getElementById('fileList');
  if (!list) return;

  if (!files.length) {
    list.innerHTML = '<div class="file-list-empty">No files yet.<br>Open a CSV to get started.</div>';
    return;
  }

  // "All Data" header item
  const allActive = activeFilePath === '';
  const allDataItem = `
    <div class="file-item all-data-item ${allActive ? 'active' : ''}"
         onclick="selectAllData()">
      <span class="file-item-icon">⊕</span>
      <div class="file-item-info">
        <div class="file-item-name">All Data</div>
        <div class="file-item-meta">${files.length} file${files.length !== 1 ? 's' : ''} · merged & deduped</div>
      </div>
    </div>`;

  const fileItems = files.map(f => {
    const cached = getCached(f.filePath, f.modified);
    const dot = cached ? ' <span style="color:var(--teal);font-size:9px" title="Cached">●</span>' : '';
    return `
    <div class="file-item ${f.filePath === activeFilePath ? 'active' : ''}"
         data-path="${f.filePath}"
         data-modified="${f.modified}"
         onclick="selectFile('${f.filePath.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}', ${f.modified})">
      <span class="file-item-icon">▤</span>
      <div class="file-item-info">
        <div class="file-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}${dot}</div>
        <div class="file-item-meta">${formatBytes(f.size)} · ${formatAge(f.modified)}</div>
      </div>
      <button class="file-item-del" title="Remove"
        onclick="deleteFile(event,'${f.filePath.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">×</button>
    </div>`;
  }).join('');

  list.innerHTML = allDataItem + fileItems;
}

// ── Select All Data ───────────────────────────────────────────
async function selectAllData() {
  const agg = await loadAggregatedReadings();
  if (!agg || agg.length < 2) {
    alert('No data to aggregate. Open at least one CSV file first.');
    return;
  }
  activeFilePath = '';
  document.querySelectorAll('.file-item').forEach(el =>
    el.classList.toggle('active', el.classList.contains('all-data-item'))
  );
  applyReadings(agg, 'All Files');
  window.electronAPI.savePrefs({ lastFile: '' });
}

// ── Select individual file ────────────────────────────────────
async function selectFile(filePath, modifiedMs) {
  const cached = await resolveFromCache(filePath, modifiedMs);
  if (cached) {
    activeFilePath = filePath;
    document.querySelectorAll('.file-item').forEach(el =>
      el.classList.toggle('active', el.dataset.path === filePath)
    );
    applyReadings(cached.readings, cached.format);
    window.electronAPI.savePrefs({ lastFile: filePath });
    return;
  }
  // Cache miss — parse from disk
  const result = await window.electronAPI.loadUpload(filePath);
  if (!result) return;
  activeFilePath = filePath;
  document.querySelectorAll('.file-item').forEach(el =>
    el.classList.toggle('active', el.dataset.path === filePath)
  );
  window.electronAPI.savePrefs({ lastFile: filePath });
  parseCSV(result.content, filePath, modifiedMs);
}

// ── Delete file ───────────────────────────────────────────────
async function deleteFile(e, filePath) {
  e.stopPropagation();
  clearCacheFor(filePath);
  invalidateAggCache();
  await window.electronAPI.deleteUpload(filePath);
  if (activeFilePath === filePath) activeFilePath = '';
  loadFileLibrary();
}
