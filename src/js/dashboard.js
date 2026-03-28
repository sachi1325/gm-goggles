// Dashboard rendering — stats, glucose chart, patterns, TIR, heatmap

// ── Demo Data ────────────────────────────────────────────────
function loadDemo() {
  const base = Date.now() - 14 * 86400000;
  const data = []; let gl = 110;
  for (let i = 0; i < 14 * 24 * 4; i++) {
    const t = new Date(base + i * 15 * 60000);
    const h = t.getHours();
    if (h === 7 && t.getMinutes() === 30) gl += 60;
    if (h === 12 && t.getMinutes() === 0) gl += 75;
    if (h === 18 && t.getMinutes() === 30) gl += 65;
    if (h === 2 && t.getMinutes() === 0) gl -= 30;
    gl += (Math.random() - 0.5) * 10 - (gl - 100) * 0.04;
    gl = Math.max(55, Math.min(280, gl));
    data.push({ ts: t, gl: Math.round(gl) });
  }
  readings = data;
  renderDashboard();
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('noData').classList.add('hidden');
  document.getElementById('overviewData').classList.remove('hidden');
  renderStats();
  renderChart(activeRange, 'glucoseChart', chart, c => chart = c, activeRes);
  renderPatterns('patternGrid');
  document.getElementById('aiOutput').classList.add('hidden');
}

function computeStats(data) {
  const vals = data.map(r => r.gl);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const inRange = vals.filter(v => v >= LOW && v <= HIGH).length;
  const below = vals.filter(v => v < LOW).length;
  const above = vals.filter(v => v > HIGH).length;
  const std = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length);
  const cv = std / avg * 100;
  const a1c = (3.31 + 0.02392 * avg).toFixed(1); // GMI formula: Bergenstal et al. 2018
  return {
    avg: Math.round(avg), std: Math.round(std), cv: cv.toFixed(1),
    tir: (inRange / vals.length * 100).toFixed(1),
    tirBelow: (below / vals.length * 100).toFixed(1),
    tirAbove: (above / vals.length * 100).toFixed(1),
    min: Math.min(...vals), max: Math.max(...vals), a1c, count: vals.length
  };
}

function renderStats() {
  const s = computeStats(readings);
  const tirColor = parseFloat(s.tir) >= 70 ? 'teal' : parseFloat(s.tir) >= 50 ? 'amber' : 'red';
  const avgColor = s.avg >= LOW && s.avg <= HIGH ? 'teal' : s.avg > HIGH ? 'amber' : 'red';
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat">
      <div class="stat-label">Average Glucose</div>
      <div class="stat-val ${avgColor}">${s.avg}<span class="stat-unit">mg/dL</span></div>
      <div class="stat-sub">GMI: ${s.a1c}%</div>
    </div>
    <div class="stat">
      <div class="stat-label">Time in Range</div>
      <div class="stat-val ${tirColor}">${s.tir}<span class="stat-unit">%</span></div>
      <div class="tir-bar">
        <div class="tir-seg" style="background:var(--red);width:${s.tirBelow}%"></div>
        <div class="tir-seg" style="background:var(--teal);width:${s.tir}%"></div>
        <div class="tir-seg" style="background:var(--amber);width:${s.tirAbove}%"></div>
      </div>
    </div>
    <div class="stat">
      <div class="stat-label">Variability CV</div>
      <div class="stat-val ${parseFloat(s.cv) < 36 ? 'teal' : 'amber'}">${s.cv}<span class="stat-unit">%</span></div>
      <div class="stat-sub">SD: ${s.std} mg/dL</div>
    </div>
    <div class="stat">
      <div class="stat-label">Range</div>
      <div class="stat-val">${s.min}–${s.max}</div>
      <div class="stat-sub">${s.count.toLocaleString()} readings</div>
    </div>
  `;
}

function getFilteredData(days) {
  if (!days) return readings;
  const cutoff = readings[readings.length - 1].ts.getTime() - days * 86400000;
  return readings.filter(r => r.ts.getTime() >= cutoff);
}

function renderChart(days, canvasId, existingChart, setChart, intervalMinutes) {
  const raw = getFilteredData(days);
  const data = resampleData(raw, intervalMinutes || 5);
  const vals = data.map(r => r.gl);
  if (existingChart) existingChart.destroy();

  const ctx = document.getElementById(canvasId).getContext('2d');
  const newChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => r.ts),
      datasets: [{
        data: vals,
        borderWidth: 1.5,
        pointRadius: vals.length > 400 ? 0 : 2,
        tension: 0.3,
        fill: false,
        segment: {
          borderColor: ctx2 => {
            const v = ctx2.p0.parsed.y;
            return v < LOW || v > HIGH ? '#f85149' : '#26d9a8';
          }
        },
        pointBackgroundColor: vals.map(v => v < LOW || v > HIGH ? '#f85149' : '#26d9a8')
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#8b949e',
          bodyColor: '#e6edf3',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            title: items => new Date(items[0].label).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            label: (item, ctx2) => { const res = intervalMinutes || 5; return res > 5 ? ` ${item.parsed.y} mg/dL (${res >= 1440 ? '1d' : res >= 60 ? res/60+'h' : res+'m'} avg)` : ` ${item.parsed.y} mg/dL`; }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: (days === 1) ? 'hour' : (days > 0 && days <= 14) ? 'day' : 'month',
            displayFormats: {
              hour: 'MMM d, h:mm a',
              day: 'MMM d',
              month: 'MMM yyyy'
            },
            tooltipFormat: 'MMM d yyyy, h:mm a'
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6e7681', font: { family: "'SF Mono', Consolas, monospace", size: 9 }, maxTicksLimit: 8 }
        },
        y: {
          min: Math.max(40, Math.min(...vals) - 15),
          max: Math.min(400, Math.max(...vals) + 15),
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6e7681', font: { family: "'SF Mono', Consolas, monospace", size: 9 } }
        }
      }
    },
    plugins: [{
      id: 'ranges',
      beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
        if (!y) return;
        const lowY = y.getPixelForValue(LOW);
        const highY = y.getPixelForValue(HIGH);
        ctx.save();
        ctx.fillStyle = 'rgba(38,217,168,0.05)';
        ctx.fillRect(left, highY, right - left, lowY - highY);
        ctx.strokeStyle = 'rgba(248,81,73,0.35)';
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, lowY); ctx.lineTo(right, lowY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(left, highY); ctx.lineTo(right, highY); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
    }]
  });
  setChart(newChart);
}

// ── Patterns ─────────────────────────────────────────────────
function detectPatterns() {
  const s = computeStats(readings);
  const patterns = [];
  const tir = parseFloat(s.tir), tirBelow = parseFloat(s.tirBelow), tirAbove = parseFloat(s.tirAbove), cv = parseFloat(s.cv);

  if (tir >= 70) patterns.push({ level: 'ok', icon: '✓', name: 'Time-in-range goal met', desc: `${s.tir}% of readings in target range (${LOW}–${HIGH} mg/dL). International consensus target is ≥70%.` });
  else if (tir >= 50) patterns.push({ level: 'warn', icon: '△', name: 'Time-in-range below goal', desc: `${s.tir}% in range. Room for improvement — target is ≥70%.` });
  else patterns.push({ level: 'crit', icon: '!', name: 'Low time-in-range', desc: `Only ${s.tir}% in range. Consider discussing adjustments with your care team.` });

  if (tirBelow > 4) patterns.push({ level: 'crit', icon: '↓', name: 'Frequent hypoglycemia', desc: `${s.tirBelow}% below ${LOW} mg/dL. Clinical target is <4%. Discuss with your provider.` });
  else patterns.push({ level: 'ok', icon: '✓', name: 'Minimal hypoglycemia', desc: `${s.tirBelow}% below range — within the ≤4% guideline.` });

  if (tirAbove > 25) patterns.push({ level: 'warn', icon: '↑', name: 'Elevated hyperglycemia', desc: `${s.tirAbove}% above ${HIGH} mg/dL. Target is <25%.` });
  else patterns.push({ level: 'ok', icon: '✓', name: 'Hyperglycemia controlled', desc: `${s.tirAbove}% above range — within the <25% target.` });

  if (cv > 36) patterns.push({ level: 'warn', icon: '~', name: 'High glucose variability', desc: `CV of ${s.cv}% exceeds the ≤36% clinical target for glycemic stability.` });
  else patterns.push({ level: 'ok', icon: '✓', name: 'Stable glycemic variability', desc: `CV of ${s.cv}% is within the stable range (≤36%).` });

  const dawn = readings.filter(r => { const h = r.ts.getHours(); return h >= 4 && h <= 8; });
  const dawnAvg = dawn.length ? Math.round(dawn.reduce((a, r) => a + r.gl, 0) / dawn.length) : 0;
  if (dawnAvg > 130) patterns.push({ level: 'warn', icon: '↗', name: 'Dawn phenomenon likely', desc: `Average glucose 4–8 AM is ${dawnAvg} mg/dL, suggesting early-morning blood sugar rise.` });

  return patterns;
}

function renderPatterns(gridId) {
  const patterns = detectPatterns();
  document.getElementById(gridId).innerHTML = patterns.map(p => `
    <div class="pattern-card">
      <div class="pattern-badge ${p.level}">${p.icon}</div>
      <div><div class="pattern-name">${p.name}</div><div class="pattern-desc">${p.desc}</div></div>
    </div>
  `).join('');
}

// ── Daily TIR Chart ──────────────────────────────────────────
function renderDailyTIR() {
  const wrap = document.getElementById('tirChartWrap');
  if (!wrap) return;

  // Bucket readings by calendar day
  const dayMap = new Map();
  for (const r of readings) {
    const key = r.ts.toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key).push(r.gl);
  }

  const days = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const labels = days.map(([k]) => new Date(k + 'T12:00:00'));
  const inPct  = days.map(([, vals]) => Math.round(vals.filter(v => v >= LOW && v <= HIGH).length / vals.length * 100));
  const loPct  = days.map(([, vals]) => Math.round(vals.filter(v => v < LOW).length / vals.length * 100));
  const hiPct  = days.map(([, vals]) => Math.round(vals.filter(v => v > HIGH).length / vals.length * 100));

  // Size canvas dynamically — min 40px per bar, max fill container
  const canvasH = 280;
  wrap.innerHTML = `<div style="position:relative;width:100%;height:${canvasH}px"><canvas id="tirChart"></canvas></div>`;

  if (tirChart) { tirChart.destroy(); tirChart = null; }

  const ctx = document.getElementById('tirChart').getContext('2d');
  tirChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Low',
          data: loPct,
          borderColor: '#f85149',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
          borderDash: [4, 3],
          hidden: !tirSeriesVisible[0],
        },
        {
          label: 'In range',
          data: inPct,
          borderColor: '#26d9a8',
          backgroundColor: 'rgba(38,217,168,0.08)',
          borderWidth: 2,
          pointRadius: days.length > 30 ? 2 : 4,
          pointBackgroundColor: inPct.map(v => v >= 70 ? '#26d9a8' : '#f0a832'),
          pointBorderColor: 'transparent',
          tension: 0.3,
          fill: true,
          hidden: !tirSeriesVisible[1],
        },
        {
          label: 'High',
          data: hiPct,
          borderColor: '#f0a832',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
          borderDash: [4, 3],
          hidden: !tirSeriesVisible[2],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#8b949e',
          bodyColor: '#e6edf3',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            title: items => new Date(items[0].label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            label: item => ` ${item.dataset.label}: ${item.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: days.length <= 14 ? 'day' : days.length <= 60 ? 'week' : 'month',
            displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' },
            tooltipFormat: 'MMM d, yyyy'
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6e7681', font: { family: "'SF Mono', Consolas, monospace", size: 9 }, maxTicksLimit: 12 }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6e7681',
            font: { family: "'SF Mono', Consolas, monospace", size: 9 },
            callback: v => v + '%'
          }
        }
      }
    },
    plugins: [{
      id: 'tirGoalLine',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        if (!y) return;
        const goalY = y.getPixelForValue(70);
        ctx.save();
        ctx.strokeStyle = 'rgba(38,217,168,0.5)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(left, goalY); ctx.lineTo(right, goalY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(38,217,168,0.7)';
        ctx.font = "9px 'SF Mono', Consolas, monospace";
        ctx.fillText('TIR 70% goal', right - 72, goalY - 4);
        ctx.restore();
      }
    }]
  });
}

// ── Daily Heatmap ─────────────────────────────────────────────
function renderDailyPage(days) {
  if (days === undefined) days = activeDailyRange;
  activeDailyRange = days;

  const filtered = getFilteredData(days);

  // Update date range label
  const label = document.getElementById('dailyRangeLabel');
  if (label && filtered.length) {
    const from = filtered[0].ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const to = filtered[filtered.length-1].ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    label.textContent = `${from} → ${to}  (${filtered.length.toLocaleString()} readings)`;
  }

  const hourlyAvg = Array.from({ length: 24 }, (_, h) => {
    const hrs = filtered.filter(r => r.ts.getHours() === h);
    return hrs.length ? Math.round(hrs.reduce((a, r) => a + r.gl, 0) / hrs.length) : null;
  });

  // Heatmap cells
  const grid = document.getElementById('heatmapGrid');
  const labels = document.getElementById('heatmapLabels');
  grid.innerHTML = '';
  labels.innerHTML = '';

  hourlyAvg.forEach((avg, h) => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    if (avg !== null) {
      const color = avg < LOW ? '#f85149' : avg > HIGH ? '#f0a832' : '#26d9a8';
      const intensity = Math.min(1, Math.abs(avg - (LOW + HIGH) / 2) / 80);
      cell.style.background = color;
      cell.style.opacity = 0.3 + intensity * 0.7;
      cell.dataset.tip = `${String(h).padStart(2,'0')}:00  •  ${avg} mg/dL`;
      cell.textContent = avg;
    } else {
      cell.style.background = 'rgba(255,255,255,0.05)';
    }
    grid.appendChild(cell);

    const lbl = document.createElement('div');
    lbl.className = 'heatmap-label';
    lbl.textContent = h % 3 === 0 ? String(h).padStart(2,'0') : '';
    labels.appendChild(lbl);
  });

  // Wire floating tooltip on heatmap cells
  const ftEl = document.getElementById('floatTooltip');
  grid.querySelectorAll('.heatmap-cell[data-tip]').forEach(cell => {
    cell.addEventListener('mouseenter', e => {
      ftEl.textContent = cell.dataset.tip;
      ftEl.classList.add('visible');
    });
    cell.addEventListener('mousemove', e => {
      const pad = 12;
      const tw = ftEl.offsetWidth, th = ftEl.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      if (x + tw > vw - pad) x = e.clientX - tw - pad;
      if (y + th > vh - pad) y = e.clientY - th - pad;
      ftEl.style.left = x + 'px';
      ftEl.style.top  = y + 'px';
    });
    cell.addEventListener('mouseleave', () => ftEl.classList.remove('visible'));
  });

  // Hourly trend chart
  if (hourlyChart) hourlyChart.destroy();
  const ctx = document.getElementById('hourlyChart').getContext('2d');
  const validHours = hourlyAvg.map((v, i) => ({ x: i, y: v })).filter(p => p.y !== null);
  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`),
      datasets: [{
        data: hourlyAvg,
        backgroundColor: hourlyAvg.map(v => v == null ? 'transparent' : v < LOW ? '#f85149' : v > HIGH ? '#f0a832' : '#26d9a8'),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#1f2937', titleColor: '#8b949e', bodyColor: '#e6edf3',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        callbacks: { label: item => ` ${item.parsed.y} mg/dL avg` }
      }},
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6e7681', font: { family: "'SF Mono', Consolas, monospace", size: 9 }, autoSkip: true, maxTicksLimit: 12 } },
        y: { min: 40, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6e7681', font: { family: "'SF Mono', Consolas, monospace", size: 9 } } }
      }
    },
    plugins: [{
      id: 'ranges',
      beforeDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        if (!y) return;
        ctx.save();
        [LOW, HIGH].forEach(val => {
          const py = y.getPixelForValue(val);
          ctx.strokeStyle = 'rgba(248,81,73,0.35)';
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
        });
        ctx.setLineDash([]); ctx.restore();
      }
    }]
  });
}
