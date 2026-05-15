// Preferences — save, load and restore user settings per profile

// ── Preferences ──────────────────────────────────────────────
function savePrefs() {
  window.electronAPI.savePrefs({
    low: LOW, high: HIGH,
    overviewRangeDays,
    activeRange, activeRange2, activeRes, activeRes2,
    activeDailyRange,
    tirSeriesVisible,
  });
}

function applyPrefsToUI(prefs) {
  // Thresholds
  if (prefs.low) { LOW = prefs.low; document.getElementById('lowThresh').value = LOW; }
  if (prefs.high) { HIGH = prefs.high; document.getElementById('highThresh').value = HIGH; }

  // Overview shared range
  if (prefs.overviewRangeDays !== undefined) {
    overviewRangeDays = prefs.overviewRangeDays;
    document.querySelectorAll('#overviewRangeBtns .range-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days) === overviewRangeDays);
    });
  }

  // Overview range
  if (prefs.activeRange !== undefined) {
    activeRange = prefs.activeRange;
    document.querySelectorAll('#rangeBtns .range-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days) === activeRange);
    });
  }

  // Overview resolution
  if (prefs.activeRes) {
    activeRes = prefs.activeRes;
    document.querySelectorAll('#resBtns .res-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.mins) === activeRes);
    });
  }

  // Glucose Trace range
  if (prefs.activeRange2 !== undefined) {
    activeRange2 = prefs.activeRange2;
    document.querySelectorAll('#rangeBtns2 .range-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days) === activeRange2);
    });
  }

  // Glucose Trace resolution
  if (prefs.activeRes2) {
    activeRes2 = prefs.activeRes2;
    document.querySelectorAll('#resBtns2 .res-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.mins) === activeRes2);
    });
  }

  // Daily heatmap range
  if (prefs.activeDailyRange !== undefined) {
    activeDailyRange = prefs.activeDailyRange;
    document.querySelectorAll('#dailyRangeBtns .range-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days) === activeDailyRange);
    });
  }

  // TIR series toggles
  if (prefs.tirSeriesVisible) {
    tirSeriesVisible = prefs.tirSeriesVisible;
    document.querySelectorAll('#tirToggles .tir-toggle').forEach(b => {
      const idx = parseInt(b.dataset.series);
      b.classList.toggle('active', tirSeriesVisible[idx]);
    });
  }
}
