/**
 * BRIDGES TERMINAL — terminal.js
 * Death Stranding-inspired order management overlay
 *
 * Storage: JSONBin.io (primary) with localStorage fallback.
 * Set JSONBIN_BIN_ID and JSONBIN_KEY in config below,
 * or leave as null to use localStorage only.
 */

'use strict';

/* ── Config ─────────────────────────────────────────────────── */
const CONFIG = {
  // JSONBin.io config — create a free bin at https://jsonbin.io
  // Set these to persist data across devices/browsers
  JSONBIN_BIN_ID: null,   // e.g. '6650f1abc123456789'
  JSONBIN_KEY: null,   // e.g. '$2a$10$...'

  LS_KEY_TASKS: 'bt_tasks_v4',
  LS_KEY_GAMES: 'bt_games_v4',
  NOTES_CLAMP: 80,      // chars before "show more" kicks in
  HOVER_DELAY: 200,     // ms before hovered style applies
};

/* ── Default seed data ──────────────────────────────────────── */
const DEFAULT_GAMES = ['Death Stranding 2', 'Resident Evil 2'];

const SEED_TASKS = [
  { id: 1, name: 'Gather ceramics ×200', game: 'Death Stranding 2', pri: 'high', cat: 'Resources', notes: 'Needed for zipline upgrade in central region.', done: false, order: 0 },
  { id: 2, name: 'Raise order rating on Episode 3 deliveries', game: 'Death Stranding 2', pri: 'med', cat: 'Side mission', notes: '5-star rating unlocks the power skeleton.', done: false, order: 1 },
  { id: 3, name: 'Complete Mama relocation order', game: 'Death Stranding 2', pri: 'high', cat: 'Story', notes: '', done: false, order: 2 },
  { id: 4, name: 'Upgrade speed skeleton to Lv.2', game: 'Death Stranding 2', pri: 'low', cat: 'Upgrade/Items/Weapons', notes: 'Requires special alloys.', done: false, order: 3 },
  { id: 5, name: 'Reach Mountaintop area — memory stone', game: 'Resident Evil 2', pri: 'med', cat: 'Exploration', notes: 'Use waygate at consecrated snowfield.', done: true, order: 4 },
];

/* ── State ──────────────────────────────────────────────────── */
let tasks = [];
let games = [];
let nextId = 1;
let currentTab = 'all';
let currentFilter = 'all';
let editingId = null;
let confirmCb = null;
let inlineEditEl = null;
let dragSrcId = null;
let dragSrcGroup = null;
const hoverTimers = {};

/* ── Persistence: JSONBin ───────────────────────────────────── */
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

async function jsonbinLoad() {
  if (!CONFIG.JSONBIN_BIN_ID || !CONFIG.JSONBIN_KEY) return null;
  try {
    const res = await fetch(`${JSONBIN_BASE}/${CONFIG.JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record || null;
  } catch { return null; }
}

async function jsonbinSave(payload) {
  if (!CONFIG.JSONBIN_BIN_ID || !CONFIG.JSONBIN_KEY) return;
  try {
    await fetch(`${JSONBIN_BASE}/${CONFIG.JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': CONFIG.JSONBIN_KEY
      },
      body: JSON.stringify(payload)
    });
  } catch { /* silently fall back to localStorage */ }
}

/* ── Persistence: localStorage ──────────────────────────────── */
function lsLoad() {
  try {
    const t = localStorage.getItem(CONFIG.LS_KEY_TASKS);
    const g = localStorage.getItem(CONFIG.LS_KEY_GAMES);
    return {
      tasks: t ? JSON.parse(t) : null,
      games: g ? JSON.parse(g) : null,
    };
  } catch { return { tasks: null, games: null }; }
}

function lsSave() {
  try {
    localStorage.setItem(CONFIG.LS_KEY_TASKS, JSON.stringify(tasks));
    localStorage.setItem(CONFIG.LS_KEY_GAMES, JSON.stringify(games));
  } catch { /* quota exceeded — silently ignore */ }
}

/* ── Save (both stores) ─────────────────────────────────────── */
function save() {
  lsSave();
  jsonbinSave({ tasks, games });
}

/* ── Init ───────────────────────────────────────────────────── */
async function init() {
  // Try remote first, then localStorage, then seed
  let data = await jsonbinLoad();

  if (!data) {
    const ls = lsLoad();
    data = (ls.tasks || ls.games) ? { tasks: ls.tasks, games: ls.games } : null;
  }

  if (data) {
    tasks = data.tasks || SEED_TASKS;
    games = data.games || [...DEFAULT_GAMES];
  } else {
    tasks = SEED_TASKS;
    games = [...DEFAULT_GAMES];
  }

  nextId = tasks.length ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  renderFilterBar();
  render();
}

/* ── Utilities ──────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(id) { return document.getElementById(id); }

/* ── Tab / Filter ───────────────────────────────────────────── */
function setTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function setFilter(f) {
  currentFilter = f;
  renderFilterBar();
  render();
}

/* ── Filter Bar ─────────────────────────────────────────────── */
function renderFilterBar() {
  const bar = el('filter-bar');
  const chip = (label, filter, removable = false) => {
    const active = currentFilter === filter ? ' active' : '';
    const rem = removable ? ' removable' : '';
    const delBtn = removable
      ? `<span class="chip-del" onclick="event.stopPropagation();tryRemoveGame('${esc(filter)}')">×</span>`
      : '';
    return `<button class="filter-chip${active}${rem}" onclick="setFilter('${esc(filter)}')">
              <span class="chip-text">${esc(label)}</span>${delBtn}
            </button>`;
  };

  bar.innerHTML =
    chip('All', 'all') +
    games.map(g => chip(g, g, true)).join('') +
    chip('Other', 'Other') +
    `<button class="add-game-btn" onclick="openGameModal()">+ Game</button>`;
}

/* ── Game Management ────────────────────────────────────────── */
function openGameModal() {
  el('g-name').value = '';
  el('g-name').style.borderColor = '';
  el('game-modal').classList.add('open');
  setTimeout(() => el('g-name').focus(), 50);
}

function closeGameModal() { el('game-modal').classList.remove('open'); }

function confirmAddGame() {
  const name = el('g-name').value.trim();
  const invalid = !name || games.includes(name) || name === 'Other' || name === 'All';
  if (invalid) { el('g-name').style.borderColor = '#c84040'; return; }

  games.push(name);
  save();
  closeGameModal();
  renderFilterBar();
  refreshGameSelect();
}

function tryRemoveGame(g) {
  const count = tasks.filter(t => t.game === g).length;
  const msg = count > 0
    ? `Remove "${g}"? ${count} task(s) will be reassigned to "Other".`
    : `Remove "${g}" from the game list?`;

  openConfirm(msg, () => {
    tasks = tasks.map(t => t.game === g ? { ...t, game: 'Other' } : t);
    games = games.filter(x => x !== g);
    if (currentFilter === g) currentFilter = 'all';
    save();
    renderFilterBar();
    refreshGameSelect();
    render();
  });
}

function refreshGameSelect() {
  const sel = el('f-game');
  const cur = sel.value;
  sel.innerHTML = games.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')
    + '<option value="Other">Other</option>';
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

/* ── Task Modal ─────────────────────────────────────────────── */
function openModal(taskId) {
  editingId = taskId;
  const isEdit = taskId !== null;

  el('modal-title').textContent = isEdit ? '// Edit Order' : '// Register New Order';
  el('modal-confirm-btn').textContent = isEdit ? 'Save Changes' : 'Confirm Order';

  refreshGameSelect();

  if (isEdit) {
    const t = tasks.find(x => x.id === taskId);
    el('f-name').value = t.name;
    el('f-game').value = t.game;
    el('f-pri').value = t.pri;
    el('f-cat').value = t.cat;
    el('f-notes').value = t.notes;
  } else {
    el('f-name').value = '';
    el('f-notes').value = '';
    el('f-pri').value = 'med';
  }

  el('f-name').style.borderColor = '';
  removeInlineEdit();
  el('modal').classList.add('open');
  setTimeout(() => el('f-name').focus(), 50);
}

function closeModal() {
  el('modal').classList.remove('open');
  editingId = null;
}

function submitTask() {
  const name = el('f-name').value.trim();
  if (!name) { el('f-name').style.borderColor = '#c84040'; return; }
  el('f-name').style.borderColor = '';

  if (editingId !== null) {
    const t = tasks.find(x => x.id === editingId);
    if (t) Object.assign(t, {
      name,
      game: el('f-game').value,
      pri: el('f-pri').value,
      cat: el('f-cat').value,
      notes: el('f-notes').value.trim(),
    });
  } else {
    const maxOrder = tasks.length ? Math.max(...tasks.map(t => t.order || 0)) + 1 : 0;
    tasks.unshift({
      id: nextId++,
      name,
      game: el('f-game').value,
      pri: el('f-pri').value,
      cat: el('f-cat').value,
      notes: el('f-notes').value.trim(),
      done: false,
      order: maxOrder,
    });
  }
  save();
  render();
  closeModal();
}

/* ── Task Actions ───────────────────────────────────────────── */
function toggleDone(id, e) {
  e.stopPropagation();
  const t = tasks.find(t => t.id === id);
  if (t) { t.done = !t.done; save(); render(); }
}

function deleteTask(id, e) {
  e.stopPropagation();
  openConfirm('Delete this order permanently?', () => {
    tasks = tasks.filter(t => t.id !== id);
    save();
    render();
  });
}

function toggleNotes(id) {
  const noteEl = el('notes-' + id);
  const btnEl = el('notebtn-' + id);
  if (!noteEl) return;
  const clamped = noteEl.classList.toggle('clamped');
  btnEl.textContent = clamped ? '[ show more ]' : '[ show less ]';
}

/* ── Inline Edit Button ─────────────────────────────────────── */
function removeInlineEdit() {
  if (inlineEditEl) { inlineEditEl.remove(); inlineEditEl = null; }
}

function showInlineEdit(id, rowEl, e) {
  e.stopPropagation();
  removeInlineEdit();

  const btn = document.createElement('button');
  btn.className = 'inline-edit-btn';
  btn.textContent = '// EDIT ORDER';
  btn.onclick = ev => { ev.stopPropagation(); openModal(id); };

  const rowRect = rowEl.getBoundingClientRect();
  const appRect = el('app').getBoundingClientRect();
  btn.style.top = (rowRect.bottom - appRect.top - 1) + 'px';
  btn.style.left = Math.max(4, e.clientX - appRect.left - 60) + 'px';

  el('app').appendChild(btn);
  inlineEditEl = btn;

  const dismiss = ev => {
    if (!rowEl.contains(ev.target) && !btn.contains(ev.target)) {
      removeInlineEdit();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
}

/* ── Drag & Drop (within group only) ───────────────────────── */
function startDrag(id, group, e) {
  dragSrcId = id;
  dragSrcGroup = group;
  setTimeout(() => el('row-' + id)?.classList.add('dragging'), 0);
}

function onDragOver(id, group, e) {
  if (group !== dragSrcGroup) return;
  e.preventDefault();
  document.querySelectorAll('.task-row').forEach(r => r.classList.remove('drag-over'));
  if (id !== dragSrcId) el('row-' + id)?.classList.add('drag-over');
}

function onDrop(id, group, e) {
  e.preventDefault();
  document.querySelectorAll('.task-row').forEach(r => {
    r.classList.remove('drag-over', 'dragging');
  });
  if (!dragSrcId || id === dragSrcId || group !== dragSrcGroup) { dragSrcId = null; return; }

  const si = tasks.findIndex(t => t.id === dragSrcId);
  const di = tasks.findIndex(t => t.id === id);
  if (si < 0 || di < 0) { dragSrcId = null; return; }

  const [moved] = tasks.splice(si, 1);
  tasks.splice(di, 0, moved);
  tasks.forEach((t, i) => { t.order = i; });

  dragSrcId = dragSrcGroup = null;
  save();
  render();
}

function onDragEnd() {
  document.querySelectorAll('.task-row').forEach(r => {
    r.classList.remove('drag-over', 'dragging');
  });
  dragSrcId = dragSrcGroup = null;
}

/* ── Hover Effect ───────────────────────────────────────────── */
function attachHover(id) {
  const row = el('row-' + id);
  if (!row) return;
  row.addEventListener('mouseenter', () => {
    hoverTimers[id] = setTimeout(() => row.classList.add('hovered'), CONFIG.HOVER_DELAY);
  });
  row.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimers[id]);
    row.classList.remove('hovered');
  });
}

/* ── HUD Toggle ─────────────────────────────────────────────── */
function toggleHud() {
  document.body.classList.toggle('hud-mode');
  el('hud-toggle').textContent = document.body.classList.contains('hud-mode')
    ? '[ exit hud ]'
    : '[ hud mode ]';
}

/* ── Confirm Dialog ─────────────────────────────────────────── */
function openConfirm(msg, cb) {
  el('confirm-msg').textContent = msg;
  confirmCb = cb;
  el('confirm-overlay').classList.add('open');
  el('confirm-yes-btn').onclick = () => { confirmCb?.(); closeConfirm(); };
}
function closeConfirm() {
  el('confirm-overlay').classList.remove('open');
  confirmCb = null;
}

/* ── Render ─────────────────────────────────────────────────── */
const GROUP_NAMES = {
  high: 'HIGH PRIORITY',
  med: 'STANDARD',
  low: 'LOW PRIORITY',
  done: 'COMPLETED',
};

function render() {
  // Apply tab + game filter
  let visible = tasks;
  if (currentFilter !== 'all') visible = visible.filter(t => t.game === currentFilter);
  if (currentTab === 'high') visible = visible.filter(t => t.pri === 'high' && !t.done);
  else if (currentTab === 'active') visible = visible.filter(t => !t.done);
  else if (currentTab === 'done') visible = visible.filter(t => t.done);

  // Update header stats
  const totalAll = tasks.length;
  const doneAll = tasks.filter(t => t.done).length;
  const activeAll = totalAll - doneAll;
  const pct = totalAll ? Math.round((doneAll / totalAll) * 100) : 0;

  el('active-count').textContent = activeAll;
  el('done-count').textContent = doneAll;
  el('prog-fill').style.width = pct + '%';
  el('prog-label').textContent = pct + '%';
  el('footer-text').textContent = totalAll
    ? `${doneAll}/${totalAll} ORDERS RESOLVED`
    : 'NO ACTIVE ORDERS';

  const list = el('task-list');
  removeInlineEdit();

  if (!visible.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">[ ]</div><div class="empty-text">No orders registered</div></div>';
    return;
  }

  // Group tasks
  const groups = { 'HIGH PRIORITY': [], 'STANDARD': [], 'LOW PRIORITY': [], 'COMPLETED': [] };
  visible.forEach(t => {
    const g = t.done ? 'COMPLETED'
      : t.pri === 'high' ? 'HIGH PRIORITY'
        : t.pri === 'med' ? 'STANDARD'
          : 'LOW PRIORITY';
    groups[g].push(t);
  });

  // Build HTML
  let html = '';
  Object.entries(groups).forEach(([groupName, items]) => {
    if (!items.length) return;
    html += `<div class="section-label">${groupName}</div>`;
    items.forEach(t => {
      const longNote = t.notes && t.notes.length > CONFIG.NOTES_CLAMP;
      const noteHtml = t.notes
        ? `<div id="notes-${t.id}" class="task-notes${longNote ? ' clamped' : ''}">${esc(t.notes)}</div>
           ${longNote ? `<button class="show-more-btn" id="notebtn-${t.id}" onclick="event.stopPropagation();toggleNotes(${t.id})">[ show more ]</button>` : ''}`
        : '';

      html += `
<div class="task-row pri-${t.pri}${t.done ? ' done' : ''}" id="row-${t.id}"
     draggable="true"
     ondragstart="startDrag(${t.id},'${groupName}',event)"
     ondragover="onDragOver(${t.id},'${groupName}',event)"
     ondrop="onDrop(${t.id},'${groupName}',event)"
     ondragend="onDragEnd(event)"
     onclick="showInlineEdit(${t.id},this,event)">
  <div class="silver-sheen"></div>
  <div class="task-check${t.done ? ' checked' : ''}" onclick="toggleDone(${t.id},event)">
    <div class="check-mark"></div>
  </div>
  <div class="task-content">
    <div class="task-name">${esc(t.name)}</div>
    <div class="task-game-label">${esc(t.game)} // ${esc(t.cat)}</div>
    ${noteHtml}
  </div>
  <div class="cat-badge">${esc(t.cat)}</div>
  <div class="pri-badge ${t.pri}">${t.pri.toUpperCase()}</div>
  <button class="del-btn" onclick="deleteTask(${t.id},event)">×</button>
</div>`;
    });
  });

  list.innerHTML = html;
  visible.forEach(t => attachHover(t.id));
}

/* ── Event Listeners ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Close modals on backdrop click
  el('modal').addEventListener('click', e => { if (e.target === el('modal')) closeModal(); });
  el('game-modal').addEventListener('click', e => { if (e.target === el('game-modal')) closeGameModal(); });
  el('confirm-overlay').addEventListener('click', e => { if (e.target === el('confirm-overlay')) closeConfirm(); });

  // Dismiss inline edit on outside click
  document.addEventListener('click', e => {
    if (inlineEditEl && !inlineEditEl.contains(e.target) && !e.target.closest('.task-row'))
      removeInlineEdit();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal(); closeGameModal(); closeConfirm(); removeInlineEdit();
    }
    // Ctrl+N — new order
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openModal(null);
    }
    // Ctrl+H — HUD toggle
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault();
      toggleHud();
    }
  });

  init();
});
