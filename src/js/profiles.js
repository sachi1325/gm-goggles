// Profile management — picker, create, switch, delete

// ── Profile System ────────────────────────────────────────────
const PROFILE_COLORS = [
  '#26d9a8','#58a6ff','#f0a832','#f85149',
  '#d97bef','#f97583','#79b8ff','#56d364'
];
let selectedColor = PROFILE_COLORS[0];
let activeProfile = null;

function avatarInitials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function avatarStyle(color) {
  return `background:${color}`;
}

async function renderProfileScreen() {
  const profiles = await window.electronAPI.listProfiles();
  const grid = document.getElementById('profileGrid');

  const cards = profiles.map(p => `
    <div class="ps-card" onclick="selectProfile('${p.id}')">
      <button class="ps-card-del" onclick="deleteProfileCard(event,'${p.id}')" title="Delete profile">×</button>
      <div class="ps-avatar" style="${avatarStyle(p.color)}">${avatarInitials(p.name)}</div>
      <div class="ps-card-name">${p.name}</div>
      <div class="ps-card-meta">${p.color}</div>
    </div>
  `).join('');

  grid.innerHTML = cards + `
    <div class="ps-add" onclick="showNewProfileModal()">
      +
      <div class="ps-add-label">New profile</div>
    </div>
  `;
}

async function selectProfile(id) {
  await window.electronAPI.setActiveProfile(id);
  const profiles = await window.electronAPI.listProfiles();
  activeProfile = profiles.find(p => p.id === id);
  updateSidebarProfile();
  document.getElementById('profileScreen').classList.add('hidden');
  // Reload prefs and file library for this profile
  await reloadForProfile();
}

async function reloadForProfile() {
  readings = [];
  activeFilePath = '';
  detectedFormat = 'Unknown';
  document.getElementById('formatBadge').textContent = '—';
  document.getElementById('noData').classList.remove('hidden');
  document.getElementById('overviewData').classList.add('hidden');
  document.getElementById('aiOutput').classList.add('hidden');

  const prefs = await window.electronAPI.loadPrefs();
  apiKey = prefs.apiKey || '';
  applyPrefsToUI(prefs);
  updateApiKeyUI();

  await loadFileLibrary();

  const uploadsDir = await window.electronAPI.getUploadsDir();
  const dirLabel = document.getElementById('uploadsDirLabel');
  if (dirLabel) dirLabel.textContent = '📁 ' + uploadsDir;

  if (prefs.lastFile) {
    const result = await window.electronAPI.loadUpload(prefs.lastFile);
    if (result) {
      activeFilePath = prefs.lastFile;
      parseCSV(result.content);
      loadFileLibrary();
    }
  }
}

function updateSidebarProfile() {
  if (!activeProfile) return;
  document.getElementById('sidebarAvatar').style.background = activeProfile.color;
  document.getElementById('sidebarAvatar').textContent = avatarInitials(activeProfile.name);
  document.getElementById('sidebarProfileName').textContent = activeProfile.name;
}

function showProfileScreen() {
  document.getElementById('profileScreen').classList.remove('hidden');
  renderProfileScreen();
}

async function deleteProfileCard(e, id) {
  e.stopPropagation();
  const profiles = await window.electronAPI.listProfiles();
  const profile = profiles.find(p => p.id === id);
  if (!profile) return;
  if (!confirm(`Delete profile "${profile.name}"? This will permanently delete all their data files and preferences.`)) return;
  await window.electronAPI.deleteProfile(id);
  renderProfileScreen();
}

// ── New Profile Modal ─────────────────────────────────────────
function showNewProfileModal() {
  selectedColor = PROFILE_COLORS[0];
  document.getElementById('npmName').value = '';
  const colorsEl = document.getElementById('npmColors');
  colorsEl.innerHTML = PROFILE_COLORS.map(c => `
    <div class="npm-color ${c === selectedColor ? 'selected' : ''}"
         style="background:${c}" onclick="pickColor('${c}',this)"></div>
  `).join('');
  document.getElementById('newProfileModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('npmName').focus(), 50);
}

function hideNewProfileModal() {
  document.getElementById('newProfileModal').classList.add('hidden');
}

function pickColor(color, el) {
  selectedColor = color;
  document.querySelectorAll('.npm-color').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

async function createProfile() {
  const name = document.getElementById('npmName').value.trim();
  if (!name) { document.getElementById('npmName').focus(); return; }
  await window.electronAPI.createProfile({ name, color: selectedColor });
  hideNewProfileModal();
  renderProfileScreen();
}

// Enter key submits new profile form
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('newProfileModal').classList.contains('hidden')) {
    createProfile();
  }
  if (e.key === 'Escape' && !document.getElementById('newProfileModal').classList.contains('hidden')) {
    hideNewProfileModal();
  }
});
