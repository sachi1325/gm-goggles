// Aggregation — merge all profile files into a single deduplicated dataset

// ── Agg cache key ─────────────────────────────────────────────
// Key = sorted "filePath:modifiedMs" pairs joined — changes whenever any file
// is added, removed, or updated on disk.
function buildAggCacheKey(files) {
  return files
    .map(f => `${f.filePath}:${f.modified}`)
    .sort()
    .join('|');
}

// ── In-memory agg cache ───────────────────────────────────────
let aggMemCache = null; // { cacheKey, readings }

// ── Load & aggregate all files for the active profile ─────────
async function loadAggregatedReadings() {
  const files = await window.electronAPI.listUploads();
  if (!files.length) return null;

  const cacheKey = buildAggCacheKey(files);

  // 1. Memory cache (instant)
  if (aggMemCache && aggMemCache.cacheKey === cacheKey) {
    return aggMemCache.readings;
  }

  // 2. Disk cache (fast, survives restarts)
  const diskCache = await window.electronAPI.readAggCache();
  if (diskCache && diskCache.cacheKey === cacheKey) {
    const restored = diskCache.readings.map(r => ({ ts: new Date(r.ts), gl: r.gl }));
    aggMemCache = { cacheKey, readings: restored };
    return restored;
  }

  // 3. Build from individual file caches / disk
  const allReadings = [];

  for (const f of files) {
    // Try per-file cache (memory then disk)
    let cached = await resolveFromCache(f.filePath, f.modified);

    if (!cached) {
      // Parse the file fresh and cache it
      const result = await window.electronAPI.loadUpload(f.filePath);
      if (!result) continue;
      // Parse synchronously using a Promise wrapper around parseCSV
      cached = await new Promise(resolve => {
        parseCSVRaw(result.content, f.filePath, f.modified, data => resolve(data));
      });
      if (!cached) continue;
    }

    allReadings.push(...cached.readings);
  }

  if (!allReadings.length) return null;

  // Deduplicate by timestamp (keep first occurrence per exact ms)
  const seen = new Set();
  const deduped = allReadings
    .filter(r => {
      const key = r.ts.getTime();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.ts - b.ts);

  // Write disk agg cache
  const serialized = deduped.map(r => ({ ts: r.ts.toISOString(), gl: r.gl }));
  window.electronAPI.writeAggCache({ cacheKey, readings: serialized });

  // Warm memory cache
  aggMemCache = { cacheKey, readings: deduped };

  return deduped;
}

// Invalidate agg cache when files change (called from fileLibrary after delete)
function invalidateAggCache() {
  aggMemCache = null;
}

// ── Render the aggregated view ────────────────────────────────
async function renderAggregatedView() {
  const statusEl = document.getElementById('aggStatus'); // may be null if page removed
  if (statusEl) statusEl.textContent = 'Loading…';

  const agg = await loadAggregatedReadings();

  if (!agg || agg.length < 2) {
    if (statusEl) statusEl.textContent = 'No data — add CSV files to your library first.';
    return;
  }

  // Swap readings into global state temporarily and render
  const prevReadings = readings;
  readings = agg;

  renderStats('aggStatsGrid', agg);
  renderChart(activeRange, 'aggGlucoseChart', aggChart, c => aggChart = c, activeRes);
  renderPatterns('aggPatternGrid', agg);


  readings = prevReadings;

  const fileCount = (await window.electronAPI.listUploads()).length;
  if (statusEl) {
    statusEl.textContent =
      `${agg.length.toLocaleString()} readings across ${fileCount} file${fileCount !== 1 ? 's' : ''} · ` +
      `${new Date(agg[0].ts).toLocaleDateString()} → ${new Date(agg[agg.length-1].ts).toLocaleDateString()}`;
  }
}

// ── parseCSVRaw — parse without setting global state ─────────
// Variant of parseCSV that calls back with { readings, format } instead of
// mutating global state. Used by aggregation to parse files in the background.
function parseCSVRaw(content, filePath, modifiedMs, callback) {
  const lines = content.split('\n');
  let startLine = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (/Device Timestamp|Time of Glucose|Timestamp|Date,Time/i.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  const trimmed = startLine > 0 ? lines.slice(startLine).join('\n') : content;

  Papa.parse(trimmed, {
    header: true, skipEmptyLines: true, dynamicTyping: false,
    complete: res => {
      const fields = res.meta.fields || [];
      const fmt = detectFormat(fields, res.data[0] || {});
      const data = fmt.parse(res.data, fields);
      if (data.length < 2) { callback(null); return; }
      const sorted = data.sort((a, b) => a.ts - b.ts);
      // Cache per-file result
      setCache(filePath, modifiedMs, { readings: sorted, format: fmt.label });
      const serialized = sorted.map(r => ({ ts: r.ts.toISOString(), gl: r.gl }));
      window.electronAPI.writeDiskCache({ filePath, modifiedMs, format: fmt.label, readings: serialized });
      callback({ readings: sorted, format: fmt.label });
    }
  });
}
