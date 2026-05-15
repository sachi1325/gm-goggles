// AI analysis and API key management

// ── AI Analysis ──────────────────────────────────────────────
async function runAIAnalysis() {
  if (!apiKey) { showApiModal(); return; }
  const btn = document.getElementById('aiBtn');
  const output = document.getElementById('aiOutput');
  const spinnerWrap = document.getElementById('aiSpinnerWrap');
  btn.disabled = true;
  spinnerWrap.innerHTML = '<div class="spinner"></div>';
  output.classList.add('hidden');

  const s = computeStats(readings);
  const patterns = detectPatterns().map(p => `- ${p.name}: ${p.desc}`).join('\n');
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const hrs = readings.filter(r => r.ts.getHours() === h);
    if (!hrs.length) return null;
    return `${String(h).padStart(2,'0')}:00 avg ${Math.round(hrs.reduce((a, r) => a + r.gl, 0) / hrs.length)} mg/dL`;
  }).filter(Boolean).join(', ');

  try {
    const res = await window.electronAPI.callAnthropic({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a diabetes care specialist reviewing CGM data. Provide a clear, empathetic analysis. Do NOT give specific medication advice. Use plain language.

PATIENT DATA SUMMARY:
- Date range: ${readings[0].ts.toLocaleDateString()} to ${readings[readings.length-1].ts.toLocaleDateString()}
- Total readings: ${s.count}
- Average glucose: ${s.avg} mg/dL (GMI ${s.a1c}%)
- Time in range (${LOW}-${HIGH}): ${s.tir}%
- Time below range (<${LOW}): ${s.tirBelow}%
- Time above range (>${HIGH}): ${s.tirAbove}%
- Glucose variability CV: ${s.cv}%
- SD: ${s.std} mg/dL | Min/Max: ${s.min}/${s.max} mg/dL

HOURLY AVERAGES: ${hourly}

DETECTED PATTERNS:
${patterns}

Please provide:
1. A brief overall assessment (2-3 sentences)
2. Key strengths in glycemic control
3. Top 2-3 areas to discuss with their care team
4. Practical lifestyle observations based on time-of-day patterns

Keep tone supportive and constructive. Use clear section headers.`
      }]
    });

    const text = res.content?.map(c => c.text || '').join('\n') || (res.error?.message || 'No response received.');
    output.textContent = text;
    output.classList.remove('hidden');
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
    output.classList.remove('hidden');
  }

  spinnerWrap.innerHTML = '';
  btn.disabled = false;
}

// ── API Key ───────────────────────────────────────────────────
function updateApiKeyUI() {
  const dot = document.getElementById('apiDot');
  const status = document.getElementById('apiKeyStatus');
  if (apiKey) { dot.classList.add('set'); status.textContent = 'API key set'; }
  else { dot.classList.remove('set'); status.textContent = 'API key not set'; }
}

function showApiModal() {
  document.getElementById('apiModal').classList.remove('hidden');
  document.getElementById('modalApiInput').focus();
}
function hideApiModal() { document.getElementById('apiModal').classList.add('hidden'); }
async function saveApiKeyFromModal() {
  apiKey = document.getElementById('modalApiInput').value.trim();
  await window.electronAPI.saveApiKey(apiKey);
  updateApiKeyUI();
  hideApiModal();
}

async function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val || val.includes('•')) return;
  apiKey = val;
  await window.electronAPI.saveApiKey(apiKey);
  updateApiKeyUI();
  const fb = document.getElementById('apiSaveFeedback');
  fb.textContent = 'API key saved ✓';
  setTimeout(() => fb.textContent = '', 2000);
}

function applyThresholds() {
  LOW = parseInt(document.getElementById('lowThresh').value) || 70;
  HIGH = parseInt(document.getElementById('highThresh').value) || 140;
  if (readings.length) { renderDashboard(); renderTirBreakdown(); }
  savePrefs();
  const fb = document.getElementById('threshFeedback');
  fb.textContent = `Thresholds updated: ${LOW}–${HIGH} mg/dL ✓`;
  setTimeout(() => fb.textContent = '', 2000);
}
