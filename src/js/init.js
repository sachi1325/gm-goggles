// App entry point — boot sequence and navigation

async function init() {
  // macOS: hide titlebar on mac since we use hiddenInset
  if (window.electronAPI.platform === 'darwin') {
    document.getElementById('titlebar').style.paddingLeft = '80px';
  }

  // ── Profile boot sequence ────────────────────────────────────
  const profiles = await window.electronAPI.listProfiles();
  const lastId = await window.electronAPI.getLastProfileId();
  const lastProfile = profiles.find(p => p.id === lastId);

  if (profiles.length === 0) {
    // No profiles yet — show picker immediately (user will create first one)
    renderProfileScreen();
  } else if (lastProfile) {
    // Auto-select the last used profile
    await window.electronAPI.setActiveProfile(lastProfile.id);
    activeProfile = lastProfile;
    updateSidebarProfile();
    document.getElementById('profileScreen').classList.add('hidden');
    await reloadForProfile();
  } else {
    // Profiles exist but no last used — show picker
    renderProfileScreen();
  }

  // IPC listeners
  window.electronAPI.onFileLoaded(({ name, content, filePath }) => {
    if (filePath) {
      activeFilePath = filePath;
      window.electronAPI.savePrefs({ lastFile: filePath });
    }
    parseCSV(content);
    loadFileLibrary();
  });
  window.electronAPI.onLoadDemo(() => loadDemo());

  // Upload zone
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) { const r = new FileReader(); r.onload = ev => parseCSV(ev.target.result); r.readAsText(f); }
  });

  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  // Range buttons
  document.getElementById('rangeBtns').addEventListener('click', e => {
    const btn = e.target.closest('.range-btn'); if (!btn) return;
    document.querySelectorAll('#rangeBtns .range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRange = parseInt(btn.dataset.days);
    renderChart(activeRange, 'glucoseChart', chart, c => chart = c, activeRes);
    savePrefs();
  });
  document.getElementById('rangeBtns2').addEventListener('click', e => {
    const btn = e.target.closest('.range-btn'); if (!btn) return;
    document.querySelectorAll('#rangeBtns2 .range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRange2 = parseInt(btn.dataset.days);
    renderChart(activeRange2, 'glucoseChart2', chart2, c => chart2 = c, activeRes2);
    savePrefs();
  });

  // Resolution buttons
  document.getElementById('resBtns').addEventListener('click', e => {
    const btn = e.target.closest('.res-btn'); if (!btn) return;
    document.querySelectorAll('#resBtns .res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRes = parseInt(btn.dataset.mins);
    renderChart(activeRange, 'glucoseChart', chart, c => chart = c, activeRes);
    savePrefs();
  });
  document.getElementById('resBtns2').addEventListener('click', e => {
    const btn = e.target.closest('.res-btn'); if (!btn) return;
    document.querySelectorAll('#resBtns2 .res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRes2 = parseInt(btn.dataset.mins);
    renderChart(activeRange2, 'glucoseChart2', chart2, c => chart2 = c, activeRes2);
    savePrefs();
  });

  // TIR series toggles
  document.getElementById('tirToggles').addEventListener('click', e => {
    const btn = e.target.closest('.tir-toggle'); if (!btn) return;
    const idx = parseInt(btn.dataset.series);
    tirSeriesVisible[idx] = !tirSeriesVisible[idx];
    btn.classList.toggle('active', tirSeriesVisible[idx]);
    if (tirChart) {
      tirChart.data.datasets[idx].hidden = !tirSeriesVisible[idx];
      tirChart.update();
    }
    savePrefs();
  });

  // Daily heatmap range buttons
  document.getElementById('dailyRangeBtns').addEventListener('click', e => {
    const btn = e.target.closest('.range-btn'); if (!btn) return;
    document.querySelectorAll('#dailyRangeBtns .range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeDailyRange = parseInt(btn.dataset.days);
    renderDailyPage(activeDailyRange);
    savePrefs();
  });

  // Load API key into settings field
  document.getElementById('apiKeyInput').value = apiKey ? '••••••••' + apiKey.slice(-4) : '';

  // Smart positioning for chart-info tooltips — place below icon, flip up if near bottom
  document.querySelectorAll('.chart-info').forEach(icon => {
    const tip = icon.querySelector('.chart-tooltip');
    if (!tip) return;
    icon.addEventListener('mouseenter', () => {
      const r = icon.getBoundingClientRect();
      const pad = 8;
      const tw = 260, th = 150; // approx tooltip size
      const vw = window.innerWidth, vh = window.innerHeight;
      let top = r.bottom + pad;
      let left = r.left + r.width / 2 - tw / 2;
      // Flip above if too close to bottom
      if (top + th > vh - pad) top = r.top - th - pad;
      // Clamp horizontally
      if (left < pad) left = pad;
      if (left + tw > vw - pad) left = vw - tw - pad;
      tip.style.top  = top + 'px';
      tip.style.left = left + 'px';
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  requestAnimationFrame(() => {
    if (page === 'trends' && readings.length) { renderChart(activeRange2, 'glucoseChart2', chart2, c => chart2 = c, activeRes2); renderDailyTIR(); }
    if (page === 'daily' && readings.length) renderDailyPage();
    if (page === 'patterns' && readings.length) renderPatterns('patternGrid2');
  });
}

init();
