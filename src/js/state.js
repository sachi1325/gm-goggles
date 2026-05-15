// Global application state and data utilities

// ── State ────────────────────────────────────────────────────
let readings = [];
let chart = null, chart2 = null, hourlyChart = null, tirChart = null, aggChart = null;
let activeRange = 1, activeRange2 = 1, activeDailyRange = 0;
let overviewRangeDays = 0; // shared range for stats, TIR, patterns on overview
let tirSeriesVisible = [true, true, true]; // [low, inRange, high]
let activeRes = 5, activeRes2 = 5;
let apiKey = '';
let LOW = 70, HIGH = 140;

// ── Parse cache ───────────────────────────────────────────────
// Keyed by filePath → { readings, format, modifiedMs }
// modifiedMs comes from the file listing so we detect if the file changed on disk.
const parseCache = new Map();

function getCached(filePath, modifiedMs) {
  const entry = parseCache.get(filePath);
  if (!entry) return null;
  // Invalidate if the file has been modified since we cached it
  if (modifiedMs && entry.modifiedMs !== modifiedMs) return null;
  return entry;
}

function setCache(filePath, modifiedMs, data) {
  parseCache.set(filePath, { readings: data.readings, format: data.format, modifiedMs });
}

function clearCacheFor(filePath) {
  parseCache.delete(filePath);
}

function clearAllCache() {
  parseCache.clear();
}

// ── Resampling ────────────────────────────────────────────────
function resampleData(data, intervalMinutes) {
  if (intervalMinutes <= 5) return data; // raw — no bucketing needed
  const bucketMs = intervalMinutes * 60 * 1000;
  const buckets = new Map();
  for (const r of data) {
    const key = Math.floor(r.ts.getTime() / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r.gl);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, vals]) => ({
      ts: new Date(key + bucketMs / 2),
      gl: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }));
}

// ── HTML escaping — always use for user-controlled strings in innerHTML ──
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
