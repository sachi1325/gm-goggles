// CSV parser — multi-format detection (Lingo, LibreView, Dexcom, Generic)

// ── File Parsing ─────────────────────────────────────────────
// ── Format Definitions ───────────────────────────────────────
const FORMATS = {

  LingoFormat: {
    name: 'LingoFormat',
    label: 'Lingo (Abbott)',
    // Detection: first field contains "Time of Glucose Reading"
    detect(fields, firstRow) {
      return fields.some(f => /Time of Glucose Reading/i.test(f));
    },
    parse(rows, fields) {
      const tsField = fields.find(f => /Time of Glucose Reading/i.test(f)) || fields[0];
      const glField = fields.find(f => /Measurement\s*\(mg/i.test(f)) || fields[1];
      const isMmol = /mmol/i.test(glField || '');
      return rows.map(row => {
        const rawTs = row[tsField], rawGl = row[glField];
        if (!rawTs || rawGl == null) return null;
        const ts = parseTimestamp(rawTs);
        if (!ts) return null;
        let gl = parseFloat(rawGl);
        if (isNaN(gl)) return null;
        if (isMmol && gl < 35) gl = Math.round(gl * 18.01559);
        if (gl < 20 || gl > 600) return null;
        return { ts, gl };
      }).filter(Boolean);
    }
  },

  LibreViewFormat: {
    name: 'LibreViewFormat',
    label: 'LibreView (FreeStyle Libre)',
    // Detection: has "Device Timestamp" and "Record Type" columns
    detect(fields, firstRow) {
      return fields.some(f => /Device Timestamp/i.test(f)) &&
             fields.some(f => /Record Type/i.test(f));
    },
    parse(rows, fields) {
      const tsField   = fields.find(f => /Device Timestamp/i.test(f));
      const typeField = fields.find(f => /Record Type/i.test(f));
      // Historic glucose (type 0) preferred; scan glucose (type 1) as fallback
      const histField = fields.find(f => /Historic Glucose/i.test(f));
      const scanField = fields.find(f => /Scan Glucose/i.test(f));
      const isMmol    = (histField || scanField || '').toLowerCase().includes('mmol');

      return rows.map(row => {
        const recType = parseInt(row[typeField]);
        // Only use rows with glucose readings (type 0 = historic, type 1 = scan)
        if (recType !== 0 && recType !== 1) return null;
        const rawTs = row[tsField];
        if (!rawTs) return null;
        const ts = parseTimestamp(rawTs);
        if (!ts) return null;
        // Prefer historic glucose; fall back to scan
        const rawGl = (recType === 0 && histField) ? row[histField] : row[scanField];
        if (rawGl == null || rawGl === '') return null;
        let gl = parseFloat(rawGl);
        if (isNaN(gl)) return null;
        if (isMmol && gl < 35) gl = Math.round(gl * 18.01559);
        if (gl < 20 || gl > 600) return null;
        return { ts, gl };
      }).filter(Boolean);
    }
  },

  DexcomFormat: {
    name: 'DexcomFormat',
    label: 'Dexcom',
    detect(fields) {
      return fields.some(f => /Glucose Value \(mg\/dL\)/i.test(f)) ||
             fields.some(f => /^EGV$/i.test(f.trim()));
    },
    parse(rows, fields) {
      const tsField = fields.find(f => /Timestamp|Time/i.test(f)) || fields[0];
      const glField = fields.find(f => /Glucose Value \(mg\/dL\)/i.test(f)) ||
                      fields.find(f => /^EGV$/i.test(f.trim())) || fields[1];
      return rows.map(row => {
        const rawTs = row[tsField], rawGl = row[glField];
        if (!rawTs || rawGl == null) return null;
        const ts = parseTimestamp(rawTs);
        if (!ts) return null;
        const gl = parseInt(rawGl);
        if (isNaN(gl) || gl < 20 || gl > 600) return null;
        return { ts, gl };
      }).filter(Boolean);
    }
  },

  GenericFormat: {
    name: 'GenericFormat',
    label: 'Generic CSV',
    detect() { return true; }, // always matches as fallback
    parse(rows, fields) {
      const tsField = fields.find(f => /time|date|timestamp/i.test(f)) || fields[0];
      const glField = fields.find(f => /glucose|mg.*dl|egv|measurement/i.test(f)) || fields[1];
      const isMmol  = /mmol/i.test(glField || '');
      return rows.map(row => {
        const rawTs = row[tsField], rawGl = row[glField];
        if (!rawTs || rawGl == null) return null;
        const ts = parseTimestamp(rawTs);
        if (!ts) return null;
        let gl = parseFloat(rawGl);
        if (isNaN(gl)) return null;
        if (isMmol && gl < 35) gl = Math.round(gl * 18.01559);
        if (gl < 20 || gl > 600) return null;
        return { ts, gl };
      }).filter(Boolean);
    }
  }
};

// ── Format Detection ──────────────────────────────────────────
function detectFormat(fields, firstRow) {
  for (const fmt of Object.values(FORMATS)) {
    if (fmt.name === 'GenericFormat') continue; // check last
    if (fmt.detect(fields, firstRow)) return fmt;
  }
  return FORMATS.GenericFormat;
}

function updateFormatBadge(fmt) {
  detectedFormat = fmt.name;
  const el = document.getElementById('formatBadge');
  if (el) el.textContent = fmt.label;
}

// ── Timestamp Parser ──────────────────────────────────────────
function parseTimestamp(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Lingo: 2026-03-21T21:43-07:00 (ISO 8601, no seconds)
  const lingoMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})([-+]\d{2}:\d{2})$/);
  if (lingoMatch) return new Date(lingoMatch[1] + ':00' + lingoMatch[2]);
  // LibreView: 2022-09-17 15:40 (space separator, no timezone)
  const libreMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (libreMatch) return new Date(libreMatch[1] + 'T' + libreMatch[2] + ':00');
  const ts = new Date(s);
  return isNaN(ts.getTime()) ? null : ts;
}

// ── Main CSV Entry Point ──────────────────────────────────────
function parseCSV(content) {
  // LibreView has a metadata row before the header — skip lines until we find the real header
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
      const firstRow = res.data[0] || {};
      const fmt = detectFormat(fields, firstRow);
      updateFormatBadge(fmt);
      const data = fmt.parse(res.data, fields);
      if (data.length < 2) {
        alert(`Could not parse glucose data as ${fmt.label}.\nEnsure the file is a valid CGM export.`);
        return;
      }
      readings = data.sort((a, b) => a.ts - b.ts);
      renderDashboard();
    }
  });
}
