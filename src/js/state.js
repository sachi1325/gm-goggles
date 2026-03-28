// Global application state and data utilities

// ── State ────────────────────────────────────────────────────
let readings = [];
let chart = null, chart2 = null, hourlyChart = null, tirChart = null;
let activeRange = 1, activeRange2 = 1, activeDailyRange = 0;
let tirSeriesVisible = [true, true, true]; // [low, inRange, high]
let activeRes = 5, activeRes2 = 5;
let apiKey = '';
let LOW = 70, HIGH = 140;

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
      ts: new Date(key + bucketMs / 2), // centre of bucket
      gl: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }));
}
