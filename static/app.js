/* ── PhiloWeek app.js ────────────────────────────────────────────────────── */

marked.setOptions({ breaks: true, gfm: true });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  questions:        [],
  currentQuestion:  null,
  notes:            [],
  currentNote:      null,
  journalEntry:     null,
  resources:        [],
  sessions:         [],
  programme:        [],
  rapport:          { content: '' },
  rapportMode:      'edit',
  voiceNotes:       [],
  stats:            null,
  activeTab:        'programme',
  visibleTabs:      new Set(['programme']),
  aiMode:           'socratic',
  resourceFilter:   'all',
  aiPanelCollapsed: false,
  timer: {
    running:   false,
    seconds:   0,
    interval:  null,
    stoppedAt: 0,
  },
  voice: {
    mediaRecorder: null,
    audioChunks:   [],
    blobPreview:   null,
    seconds:       0,
    interval:      null,
  },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

const GET  = (path)       => api('GET',    path);
const POST = (path, body) => api('POST',   path, body);
const PUT  = (path, body) => api('PUT',    path, body);
const DEL  = (path)       => api('DELETE', path);

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, 2000);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function emptyState(msg) {
  return `<div class="empty-inline"><em>${msg}</em></div>`;
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const ICON_MOON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const ICON_SUN  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = el('theme-toggle');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    btn.title = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
  }
}

function initTheme() {
  const saved = localStorage.getItem('pw_theme') || 'light';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('pw_theme', next);
}

// ── Context Menu ──────────────────────────────────────────────────────────────
const CtxMenu = {
  show(x, y, items) {
    const menu    = el('ctx-menu');
    const editBtn = el('ctx-edit');
    const delBtn  = el('ctx-delete');
    const sep     = el('ctx-sep');

    if (items.edit) {
      editBtn.classList.remove('hidden');
      editBtn.onclick = () => { this.hide(); items.edit(); };
    } else {
      editBtn.classList.add('hidden');
    }

    if (items.delete) {
      delBtn.classList.remove('hidden');
      delBtn.onclick = () => { this.hide(); items.delete(); };
    } else {
      delBtn.classList.add('hidden');
    }

    sep.classList.toggle('hidden', !items.edit || !items.delete);

    menu.classList.remove('hidden');
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;

    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right  > window.innerWidth)  menu.style.left = `${x - r.width}px`;
      if (r.bottom > window.innerHeight) menu.style.top  = `${y - r.height}px`;
    });
  },

  hide() { el('ctx-menu').classList.add('hidden'); },
};

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function showConfirm({ icon = '🗑️', title, body, label = 'Supprimer', onConfirm }) {
  el('confirm-icon').textContent  = icon;
  el('confirm-title').textContent = title;
  el('confirm-body').textContent  = body;
  el('confirm-ok').textContent    = label;
  el('confirm-ok').onclick = () => { hideConfirm(); onConfirm(); };
  el('confirm-modal').classList.remove('hidden');
}

function hideConfirm() { el('confirm-modal').classList.add('hidden'); }

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  await loadQuestions();

  // Auto-select the active question
  const active = state.questions.find(q => q.is_active);
  if (active) {
    selectQuestion(active.id);
  } else if (state.questions.length) {
    selectQuestion(state.questions[0].id);
  }

  bindGlobalEvents();
}

// ── Questions ─────────────────────────────────────────────────────────────────
async function loadQuestions() {
  state.questions = await GET('/api/questions');
  renderSidebar();
}

function renderSidebar() {
  const list = el('questions-list');
  if (!state.questions.length) {
    list.innerHTML = emptyState('No questions yet.');
    return;
  }
  list.innerHTML = state.questions.map(q => `
    <button class="sidebar-item${q.id === state.currentQuestion?.id ? ' active' : ''}"
            data-id="${q.id}">
      <span class="sidebar-item-title">${escapeHtml(q.title)}</span>
      ${q.is_active ? '<span class="sidebar-item-badge">Active</span>' : ''}
    </button>
  `).join('');

  list.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => selectQuestion(parseInt(btn.dataset.id)));
    btn.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const q = state.questions.find(x => x.id === parseInt(btn.dataset.id));
      if (!q) return;
      CtxMenu.show(e.clientX, e.clientY, {
        edit: () => { selectQuestion(q.id); setTimeout(openEditQuestion, 50); },
        delete: () => showConfirm({
          icon: '❓',
          title: 'Supprimer cette question ?',
          body: `"${q.title}" et toutes ses données (notes, journal, ressources…) seront supprimées définitivement.`,
          onConfirm: () => deleteQuestionById(q.id),
        }),
      });
    });
  });
}

async function selectQuestion(id) {
  const q = state.questions.find(q => q.id === id);
  if (!q) return;
  state.currentQuestion = q;

  // Activate in DB
  await PUT(`/api/questions/${id}/activate`).catch(() => {});
  state.questions.forEach(q => q.is_active = q.id === id ? 1 : 0);
  renderSidebar();

  // Show question view
  el('root-empty-state').classList.add('hidden');
  el('question-view').classList.remove('hidden');

  // Render header
  el('q-title').textContent = q.title;
  el('q-desc').textContent  = q.description || '';

  // Reset visible tabs for this question
  state.visibleTabs = new Set(['programme']);

  // Load data
  await Promise.all([
    loadStats(), loadNotes(), loadJournal(), loadResources(),
    loadSessions(), loadProgramme(), loadRapport(), loadVoiceNotes(),
  ]);

  updateVisibleTabs();
  switchTab('programme');
}

// ── Question modal ─────────────────────────────────────────────────────────────
function openNewQuestion() {
  el('qm-heading').textContent = 'New Question';
  el('qm-title').value = '';
  el('qm-desc').value  = '';
  el('qm-save').textContent = 'Create Question';
  el('qm-delete').classList.add('hidden');
  el('qm-save').dataset.mode = 'create';
  el('question-modal').classList.remove('hidden');
  el('qm-title').focus();
}

function openEditQuestion() {
  if (!state.currentQuestion) return;
  const q = state.currentQuestion;
  el('qm-heading').textContent = 'Edit Question';
  el('qm-title').value = q.title;
  el('qm-desc').value  = q.description || '';
  el('qm-save').textContent = 'Save Changes';
  el('qm-save').dataset.mode = 'edit';
  el('qm-delete').classList.remove('hidden');
  el('question-modal').classList.remove('hidden');
  el('qm-title').focus();
}

function closeQuestionModal() {
  el('question-modal').classList.add('hidden');
}

async function saveQuestion() {
  const title = el('qm-title').value.trim();
  const desc  = el('qm-desc').value.trim();
  if (!title) { toast('Please enter a question.'); return; }

  const mode = el('qm-save').dataset.mode;
  if (mode === 'create') {
    const q = await POST('/api/questions', { title, description: desc });
    state.questions.unshift(q);
    closeQuestionModal();
    await selectQuestion(q.id);
    switchTab('programme');
    toast('Question créée — définissez votre programme.');
  } else {
    const q = await PUT(`/api/questions/${state.currentQuestion.id}`, { title, description: desc });
    const idx = state.questions.findIndex(x => x.id === q.id);
    if (idx >= 0) state.questions[idx] = q;
    state.currentQuestion = q;
    el('q-title').textContent = q.title;
    el('q-desc').textContent  = q.description || '';
    renderSidebar();
    closeQuestionModal();
    toast('Question updated.');
  }
}

async function deleteQuestion() {
  if (!state.currentQuestion) return;
  showConfirm({
    icon: '❓',
    title: 'Supprimer cette question ?',
    body: `"${state.currentQuestion.title}" et toutes ses données seront supprimées définitivement.`,
    onConfirm: () => deleteQuestionById(state.currentQuestion.id),
  });
}

async function deleteQuestionById(id) {
  const q = state.questions.find(x => x.id === id);
  await DEL(`/api/questions/${id}`);
  state.questions = state.questions.filter(x => x.id !== id);
  if (state.currentQuestion?.id === id) {
    state.currentQuestion = null;
    closeQuestionModal();
    el('question-view').classList.add('hidden');
    el('root-empty-state').classList.remove('hidden');
  }
  renderSidebar();
  toast(`"${q?.title || 'Question'}" supprimée.`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  if (!state.currentQuestion) return;
  const s = await GET(`/api/questions/${state.currentQuestion.id}/stats`);
  state.stats = s;
  el('stat-time').textContent      = s.total_time;
  el('stat-notes').textContent     = s.notes_count;
  el('stat-journal').textContent   = s.journal_days > 0 ? '✓' : '–';
  el('stat-resources').textContent = `${s.resources_watched}/${s.resources_total}`;
  el('timer-today').textContent    = `Today: ${s.today_time} min`;
  el('timer-alltime').textContent  = `All time: ${s.total_time} min`;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TAB_LABELS = {
  notes: 'Notes', journal: 'Journal', rapport: 'Rapport',
  voix: 'Voix', resources: 'Ressources', timer: 'Timer',
};
const ALL_OPTIONAL_TABS = ['notes', 'journal', 'rapport', 'voix', 'resources', 'timer'];

function updateVisibleTabs() {
  if (!el('tab-add-btn')) return;
  if (state.notes.length > 0)              state.visibleTabs.add('notes');
  if (state.journalEntry?.content?.trim()) state.visibleTabs.add('journal');
  if (state.rapport?.content?.trim())      state.visibleTabs.add('rapport');
  if (state.voiceNotes.length > 0)         state.visibleTabs.add('voix');
  if (state.resources.length > 0)          state.visibleTabs.add('resources');
  if (state.sessions.length > 0)           state.visibleTabs.add('timer');

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    if (btn.dataset.tab === 'programme') return;
    btn.classList.toggle('hidden', !state.visibleTabs.has(btn.dataset.tab));
  });

  const hasHidden = ALL_OPTIONAL_TABS.some(t => !state.visibleTabs.has(t));
  el('tab-add-btn').classList.toggle('hidden', !hasHidden);
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== `panel-${tab}`);
  });
  if (tab === 'programme') renderProgramme();
  if (tab === 'notes')     renderNotesList();
  if (tab === 'journal')   loadJournalContent();
  if (tab === 'rapport')   renderRapport();
  if (tab === 'voix')      renderVoiceNotes();
  if (tab === 'resources') renderResourcesList();
  if (tab === 'timer')     renderSessionsList();
}

// ── Notes ─────────────────────────────────────────────────────────────────────
async function loadNotes() {
  if (!state.currentQuestion) return;
  state.notes = await GET(`/api/notes?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'notes') renderNotesList();
  updateVisibleTabs();
}

function renderNotesList() {
  const list = el('notes-list');
  if (!state.notes.length) {
    list.innerHTML = emptyState('No notes yet. Start with a question that troubles you.');
    return;
  }
  list.innerHTML = state.notes.map(n => {
    const tags = (n.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const tagPills = tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');
    const excerpt  = (n.content || '').replace(/#+\s|[*_>`]/g, '').slice(0, 120);
    return `
      <div class="note-card" data-note-id="${n.id}" role="button" tabindex="0">
        <div class="note-card-title">${escapeHtml(n.title)}</div>
        ${excerpt ? `<div class="note-card-excerpt">${escapeHtml(excerpt)}${n.content?.length > 120 ? '…' : ''}</div>` : ''}
        <div class="note-card-footer">
          ${tagPills}
          <span class="note-card-date">${formatDate(n.updated_at)}</span>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.note-card').forEach(card => {
    const noteId = parseInt(card.dataset.noteId);
    card.addEventListener('click', () => openNoteEditor(noteId));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openNoteEditor(noteId); });
    card.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const n = state.notes.find(x => x.id === noteId);
      if (!n) return;
      CtxMenu.show(e.clientX, e.clientY, {
        edit: () => openNoteEditor(noteId),
        delete: () => showConfirm({
          icon: '📝',
          title: 'Supprimer cette note ?',
          body: `"${n.title}" sera supprimée définitivement.`,
          onConfirm: () => deleteNoteById(noteId),
        }),
      });
    });
  });
}

function openNoteEditor(noteId) {
  const note = noteId ? state.notes.find(n => n.id === noteId) : null;
  state.currentNote = noteId || null;

  el('note-editor').classList.remove('hidden');
  el('notes-list').classList.add('hidden');
  el('new-note-btn').classList.add('hidden');

  el('note-title-input').value   = note ? note.title   : '';
  el('note-tags-input').value    = note ? note.tags    : '';
  el('note-content').value       = note ? note.content : '';
  el('delete-note-btn').classList.toggle('hidden', !noteId);

  updateNotePreview();
  el('note-content').focus();
}

function closeNoteEditor() {
  el('note-editor').classList.add('hidden');
  el('notes-list').classList.remove('hidden');
  el('new-note-btn').classList.remove('hidden');
  state.currentNote = null;
}

function updateNotePreview() {
  const md = el('note-content').value;
  const preview = el('note-preview');
  if (!md.trim()) {
    preview.innerHTML = '<p class="preview-placeholder"><em>Preview will appear here…</em></p>';
  } else {
    preview.innerHTML = marked.parse(md);
  }
}

async function saveNote() {
  const title   = el('note-title-input').value.trim();
  const content = el('note-content').value;
  const tags    = el('note-tags-input').value.trim();
  if (!title) { toast('Please enter a note title.'); return; }

  if (state.currentNote) {
    const updated = await PUT(`/api/notes/${state.currentNote}`, { title, content, tags });
    const idx = state.notes.findIndex(n => n.id === state.currentNote);
    if (idx >= 0) state.notes[idx] = updated;
    toast('Note saved.');
  } else {
    const note = await POST('/api/notes', { question_id: state.currentQuestion.id, title, content, tags });
    state.notes.unshift(note);
    toast('Note created.');
  }
  closeNoteEditor();
  renderNotesList();
  loadStats();
}

async function deleteNote() {
  if (!state.currentNote) return;
  const note = state.notes.find(n => n.id === state.currentNote);
  showConfirm({
    icon: '📝',
    title: 'Supprimer cette note ?',
    body: `"${note?.title || 'cette note'}" sera supprimée définitivement.`,
    onConfirm: () => deleteNoteById(state.currentNote),
  });
}

async function deleteNoteById(id) {
  await DEL(`/api/notes/${id}`);
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.currentNote === id) closeNoteEditor();
  renderNotesList();
  loadStats();
  toast('Note supprimée.');
}

// ── Generic image paste ───────────────────────────────────────────────────────
function pasteImage(e) {
  const items = [...(e.clipboardData?.items ?? [])];
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  e.preventDefault();

  const ta = e.currentTarget;
  const previewMap = { 'note-content': 'note-preview', 'journal-textarea': 'journal-preview' };
  const preview = previewMap[ta.id] ? el(previewMap[ta.id]) : null;

  const file = imageItem.getAsFile();
  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const MAX_W = 1200;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(objectUrl);
    const dataUrl = canvas.toDataURL('image/webp', 0.85);
    const pos = ta.selectionStart;
    const insertion = `\n![image](${dataUrl})\n`;
    ta.value = ta.value.slice(0, pos) + insertion + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = pos + insertion.length;
    if (preview) updatePreview(ta, preview);
  };
  img.src = objectUrl;
}

// ── Preview ───────────────────────────────────────────────────────────────────
function updatePreview(ta, previewEl) {
  const md = ta.value;
  previewEl.innerHTML = md.trim()
    ? marked.parse(md)
    : '<p class="preview-placeholder"><em>Preview will appear here…</em></p>';
}
function updateNotePreview()    { updatePreview(el('note-content'),    el('note-preview')); }
function updateJournalPreview() { updatePreview(el('journal-textarea'), el('journal-preview')); }

// ── Color picker (singleton) ──────────────────────────────────────────────────
const TEXT_COLORS = ['#000000','#374151','#6b7280','#ffffff','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
const HL_COLORS   = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#f5d0fe','#fed7aa','#e2e8f0'];

let _cpState = null;
const _cpEl = (() => {
  const d = document.createElement('div');
  d.id = 'cp-popup';
  d.className = 'cp-popup hidden';
  document.body.appendChild(d);
  return d;
})();

function openColorPicker(type, ta, preview, anchorBtn) {
  if (!_cpEl.classList.contains('hidden') && _cpState?.btn === anchorBtn) {
    _cpEl.classList.add('hidden'); _cpState = null; return;
  }
  _cpState = { type, ta, preview, btn: anchorBtn };
  const colors = type === 'color' ? TEXT_COLORS : HL_COLORS;
  _cpEl.innerHTML = `
    <div class="cp-swatches">${colors.map(c =>
      `<button class="cp-swatch" style="background:${c}" data-color="${c}" title="${c}"></button>`
    ).join('')}</div>
    <label class="cp-custom-row">
      <input type="color" class="cp-custom-input" value="${type === 'color' ? '#000000' : '#fef08a'}">
      <span>Personnalisée</span>
    </label>`;
  _cpEl.querySelector('.cp-custom-input').addEventListener('change', e => {
    applyColorInsert(e.target.value);
  });
  const r = anchorBtn.getBoundingClientRect();
  _cpEl.style.top  = (r.bottom + 6) + 'px';
  _cpEl.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
  _cpEl.classList.remove('hidden');
}

function applyColorInsert(color) {
  if (!_cpState) return;
  const { type, ta, preview } = _cpState;
  ta.focus();
  const s = ta.selectionStart, e2 = ta.selectionEnd;
  const sel = ta.value.slice(s, e2) || 'texte';
  const ins = type === 'color'
    ? `<span style="color:${color}">${sel}</span>`
    : `<mark style="background:${color}">${sel}</mark>`;
  ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e2);
  ta.selectionStart = ta.selectionEnd = s + ins.length;
  updatePreview(ta, preview);
  _cpEl.classList.add('hidden'); _cpState = null;
}

// ── Markdown toolbar actions ───────────────────────────────────────────────────
function applyLinePrefix(ta, prefix, preview) {
  const val = ta.value, pos = ta.selectionStart;
  const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd   = val.indexOf('\n', pos);
  const end       = lineEnd === -1 ? val.length : lineEnd;
  const line      = val.slice(lineStart, end);
  if (line.startsWith(prefix)) {
    ta.value = val.slice(0, lineStart) + line.slice(prefix.length) + val.slice(end);
    ta.selectionStart = ta.selectionEnd = Math.max(lineStart, pos - prefix.length);
  } else {
    ta.value = val.slice(0, lineStart) + prefix + line + val.slice(end);
    ta.selectionStart = ta.selectionEnd = pos + prefix.length;
  }
  ta.focus();
  updatePreview(ta, preview);
}

function applyMdAction(action, ta, preview) {
  ta.focus();
  const val = ta.value, start = ta.selectionStart, end = ta.selectionEnd;
  const sel = val.slice(start, end);
  const before = val.slice(0, start), after = val.slice(end);

  const prefixes = { h1: '# ', h2: '## ', h3: '### ', ul: '- ', ol: '1. ', quote: '> ' };
  if (action in prefixes) { applyLinePrefix(ta, prefixes[action], preview); return; }

  let ins = '', cursor = null;
  switch (action) {
    case 'bold':      ins = `**${sel || 'texte'}**`;        cursor = sel ? null : start + 2; break;
    case 'italic':    ins = `*${sel || 'texte'}*`;          cursor = sel ? null : start + 1; break;
    case 'underline': ins = `<u>${sel || 'texte'}</u>`;     cursor = sel ? null : start + 3; break;
    case 'strike':    ins = `~~${sel || 'texte'}~~`;        cursor = sel ? null : start + 2; break;
    case 'code':
      ins = sel.includes('\n') ? `\`\`\`\n${sel}\n\`\`\`` : `\`${sel || 'code'}\``;
      cursor = sel ? null : start + 1; break;
    case 'link': {
      const url = prompt('URL :') || 'https://';
      ins = `[${sel || 'texte'}](${url})`; break;
    }
    case 'table':
      ins = `\n| Colonne 1 | Colonne 2 | Colonne 3 |\n|-----------|-----------|----------|\n| Cellule   | Cellule   | Cellule   |\n`; break;
    case 'hr':
      ins = `\n\n---\n\n`; break;
  }

  ta.value = before + ins + after;
  const p = cursor ?? (start + ins.length);
  ta.setSelectionRange(p, p);
  updatePreview(ta, preview);
}

// ── Journal ───────────────────────────────────────────────────────────────────
async function loadJournal() {
  if (!state.currentQuestion) return;
  const entry = await GET(`/api/journal/${state.currentQuestion.id}/1`);
  state.journalEntry = entry;
  if (state.activeTab === 'journal') loadJournalContent();
  updateVisibleTabs();
}

function loadJournalContent() {
  el('journal-textarea').value = state.journalEntry?.content ?? '';
  el('journal-saved-indicator').textContent = '';
  updateJournalPreview();
}

let journalSaveTimer = null;
async function saveJournal(content) {
  if (!state.currentQuestion) return;
  const entry = await PUT(`/api/journal/${state.currentQuestion.id}/1`, { content });
  state.journalEntry = entry;
  loadStats();
}

function scheduleJournalSave() {
  updateJournalPreview();
  clearTimeout(journalSaveTimer);
  journalSaveTimer = setTimeout(async () => {
    const content = el('journal-textarea').value;
    await saveJournal(content);
    el('journal-saved-indicator').textContent = 'Saved';
    setTimeout(() => { el('journal-saved-indicator').textContent = ''; }, 1500);
  }, 800);
}

// ── Resources ─────────────────────────────────────────────────────────────────
async function loadResources() {
  if (!state.currentQuestion) return;
  state.resources = await GET(`/api/resources?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'resources') renderResourcesList();
  updateVisibleTabs();
}

const TYPE_EMOJI = { video: '🎥', link: '🔗', book: '📚', podcast: '🎧' };

function renderResourcesList() {
  const list = el('resources-list');
  const filtered = state.resourceFilter === 'all'
    ? state.resources
    : state.resources.filter(r => r.type === state.resourceFilter);

  if (!filtered.length) {
    list.innerHTML = emptyState(
      state.resourceFilter === 'all'
        ? 'No resources yet. Add books, articles, videos, or podcasts.'
        : `No ${state.resourceFilter} resources yet.`
    );
    return;
  }

  list.innerHTML = filtered.map(r => {
    const emoji = TYPE_EMOJI[r.type] || '🔗';
    const watched = r.is_watched ? ' watched' : '';
    return `
      <div class="resource-card${watched}" data-resource-id="${r.id}">
        <div class="resource-check${watched}" data-toggle="${r.id}"></div>
        <div class="resource-emoji">${emoji}</div>
        <div class="resource-body">
          <div class="resource-title">${escapeHtml(r.title)}</div>
          ${r.url ? `<a class="resource-url" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>` : ''}
          ${r.notes ? `<div class="resource-notes-text">${escapeHtml(r.notes)}</div>` : ''}
          <div class="resource-type-tag">${r.type}</div>
        </div>
        <button class="resource-delete" data-delete="${r.id}" title="Delete" aria-label="Delete resource">×</button>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleResource(parseInt(btn.dataset.toggle)));
  });

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = state.resources.find(x => x.id === parseInt(btn.dataset.delete));
      showConfirm({
        icon: '🔗',
        title: 'Supprimer cette ressource ?',
        body: r ? `"${r.title}" sera retirée de votre liste.` : 'Cette ressource sera supprimée.',
        onConfirm: () => deleteResource(parseInt(btn.dataset.delete)),
      });
    });
  });

  list.querySelectorAll('.resource-card').forEach(card => {
    card.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const r = state.resources.find(x => x.id === parseInt(card.dataset.resourceId));
      if (!r) return;
      CtxMenu.show(e.clientX, e.clientY, {
        delete: () => showConfirm({
          icon: '🔗',
          title: 'Supprimer cette ressource ?',
          body: `"${r.title}" sera retirée de votre liste.`,
          onConfirm: () => deleteResource(r.id),
        }),
      });
    });
  });
}

async function toggleResource(id) {
  const r = await PUT(`/api/resources/${id}/toggle`);
  const idx = state.resources.findIndex(x => x.id === id);
  if (idx >= 0) state.resources[idx] = r;
  renderResourcesList();
  loadStats();
}

async function deleteResource(id) {
  await DEL(`/api/resources/${id}`);
  state.resources = state.resources.filter(r => r.id !== id);
  renderResourcesList();
  loadStats();
  toast('Ressource supprimée.');
}

async function saveResource() {
  const title = el('res-title').value.trim();
  if (!title) { toast('Please enter a resource title.'); return; }
  const r = await POST('/api/resources', {
    question_id: state.currentQuestion.id,
    type:  el('res-type').value,
    title,
    url:   el('res-url').value.trim(),
    notes: el('res-notes').value.trim(),
  });
  state.resources.unshift(r);
  el('res-title').value = '';
  el('res-url').value   = '';
  el('res-notes').value = '';
  el('resource-form').classList.add('hidden');
  renderResourcesList();
  loadStats();
  toast('Resource added.');
}

// ── Programme ─────────────────────────────────────────────────────────────────
const PROG_EMOJI = { article: '📖', video: '🎥', reflection: '💭', writing: '✍️', podcast: '🎧' };
const PROG_ACTIVITY = { article: 'reading', video: 'watching', reflection: 'thinking', writing: 'writing', podcast: 'reading' };

async function loadProgramme() {
  if (!state.currentQuestion) return;
  state.programme = await GET(`/api/programme?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'programme') renderProgramme();
}

function renderProgramme() {
  const list = el('programme-list');
  if (!state.programme.length) {
    list.innerHTML = emptyState('Aucune activité planifiée. Commencez par définir ce que vous allez lire, regarder ou explorer pour ce sujet.');
    return;
  }
  list.innerHTML = state.programme.map((item, idx) => {
    const emoji = PROG_EMOJI[item.type] || '📖';
    const done  = item.is_done ? 'done' : '';
    return `
      <div class="prog-item ${done}" data-type="${item.type}" data-id="${item.id}">
        <div class="prog-check ${done}" data-toggle-prog="${item.id}"></div>
        <div class="prog-emoji">${emoji}</div>
        <div class="prog-body">
          <div class="prog-title">${escapeHtml(item.title)}</div>
          ${item.url    ? `<a class="prog-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>` : ''}
          ${item.aspect ? `<div class="prog-aspect">→ ${escapeHtml(item.aspect)}</div>` : ''}
          ${item.planned_minutes ? `<span class="prog-duration">⏱ ${item.planned_minutes} min</span>` : ''}
          <button class="prog-timer-btn" data-prog-timer="${item.id}" data-prog-type="${item.type}">▶ Démarrer le timer</button>
        </div>
        <div class="prog-actions">
          <button class="prog-act-btn" data-prog-up="${item.id}" title="Monter">↑</button>
          <button class="prog-act-btn" data-prog-down="${item.id}" title="Descendre">↓</button>
          <button class="prog-act-btn del" data-prog-del="${item.id}" title="Supprimer">×</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-toggle-prog]').forEach(b =>
    b.addEventListener('click', () => toggleProgItem(parseInt(b.dataset.toggleProg))));

  list.querySelectorAll('[data-prog-del]').forEach(b => {
    b.addEventListener('click', () => {
      const item = state.programme.find(p => p.id === parseInt(b.dataset.progDel));
      showConfirm({
        icon: '📋',
        title: 'Supprimer cette activité ?',
        body: item ? `"${item.title}" sera retirée du programme.` : 'Cette activité sera supprimée.',
        onConfirm: () => deleteProgItem(parseInt(b.dataset.progDel)),
      });
    });
  });

  list.querySelectorAll('[data-prog-up]').forEach(b =>
    b.addEventListener('click', () => moveProgItem(parseInt(b.dataset.progUp), -1)));
  list.querySelectorAll('[data-prog-down]').forEach(b =>
    b.addEventListener('click', () => moveProgItem(parseInt(b.dataset.progDown), 1)));
  list.querySelectorAll('[data-prog-timer]').forEach(b =>
    b.addEventListener('click', () => startTimerFromProg(b.dataset.progType)));

  list.querySelectorAll('.prog-item').forEach(itemEl => {
    itemEl.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const item = state.programme.find(p => p.id === parseInt(itemEl.dataset.id));
      if (!item) return;
      CtxMenu.show(e.clientX, e.clientY, {
        edit: () => openEditProgItem(item),
        delete: () => showConfirm({
          icon: '📋',
          title: 'Supprimer cette activité ?',
          body: `"${item.title}" sera retirée du programme.`,
          onConfirm: () => deleteProgItem(item.id),
        }),
      });
    });
  });
}

function openEditProgItem(item) {
  el('prog-type').value    = item.type;
  el('prog-title').value   = item.title;
  el('prog-url').value     = item.url || '';
  el('prog-aspect').value  = item.aspect || '';
  el('prog-minutes').value = item.planned_minutes || '';
  el('programme-form').dataset.editId = item.id;
  el('save-prog-btn').textContent = 'Modifier';
  el('programme-form').classList.remove('hidden');
  el('prog-title').focus();
}

async function saveProgItem() {
  const title = el('prog-title').value.trim();
  if (!title) { toast('Veuillez entrer un titre.'); return; }

  const form   = el('programme-form');
  const editId = form.dataset.editId;
  const payload = {
    type:            el('prog-type').value,
    title,
    url:             el('prog-url').value.trim(),
    aspect:          el('prog-aspect').value.trim(),
    planned_minutes: parseInt(el('prog-minutes').value) || 0,
  };

  if (editId) {
    const updated = await PUT(`/api/programme/${editId}`, payload);
    const idx = state.programme.findIndex(p => p.id === parseInt(editId));
    if (idx >= 0) state.programme[idx] = updated;
    delete form.dataset.editId;
    el('save-prog-btn').textContent = 'Ajouter';
    toast('Activité modifiée.');
  } else {
    const item = await POST('/api/programme', { question_id: state.currentQuestion.id, ...payload });
    state.programme.push(item);
    toast('Activité ajoutée au programme.');
  }

  el('prog-title').value = el('prog-url').value = el('prog-aspect').value = el('prog-minutes').value = '';
  form.classList.add('hidden');
  renderProgramme();
}

async function toggleProgItem(id) {
  const item = state.programme.find(p => p.id === id);
  if (!item) return;
  const updated = await PUT(`/api/programme/${id}`, { is_done: item.is_done ? 0 : 1 });
  const idx = state.programme.findIndex(p => p.id === id);
  if (idx >= 0) state.programme[idx] = updated;
  renderProgramme();
}

async function deleteProgItem(id) {
  await DEL(`/api/programme/${id}`);
  state.programme = state.programme.filter(p => p.id !== id);
  renderProgramme();
  toast('Activité supprimée.');
}

async function moveProgItem(id, dir) {
  const idx = state.programme.findIndex(p => p.id === id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.programme.length) return;
  // Swap order_num
  const a = state.programme[idx];
  const b = state.programme[newIdx];
  await Promise.all([
    PUT(`/api/programme/${a.id}`, { order_num: b.order_num }),
    PUT(`/api/programme/${b.id}`, { order_num: a.order_num }),
  ]);
  [state.programme[idx], state.programme[newIdx]] = [b, a];
  renderProgramme();
}

function startTimerFromProg(type) {
  const activity = PROG_ACTIVITY[type] || 'thinking';
  const radio = document.querySelector(`input[name="activity"][value="${activity}"]`);
  if (radio) radio.checked = true;
  switchTab('timer');
  startTimer();
  toast(`Timer démarré — ${activity}`);
}

// ── Rapport ───────────────────────────────────────────────────────────────────
async function loadRapport() {
  if (!state.currentQuestion) return;
  state.rapport = await GET(`/api/rapport/${state.currentQuestion.id}`);
  if (state.activeTab === 'rapport') renderRapport();
  updateVisibleTabs();
}

function renderRapport() {
  el('rapport-textarea').value = state.rapport.content || '';
  updateRapportWordCount();
  switchRapportMode(state.rapportMode);
}

function switchRapportMode(mode) {
  state.rapportMode = mode;
  const isPreview = mode === 'preview';
  el('rapport-textarea').classList.toggle('hidden', isPreview);
  el('rapport-preview').classList.toggle('hidden', !isPreview);
  el('rapport-edit-btn').classList.toggle('active', !isPreview);
  el('rapport-preview-btn').classList.toggle('active', isPreview);
  if (isPreview) {
    const md = el('rapport-textarea').value;
    el('rapport-preview').innerHTML = md.trim()
      ? marked.parse(md)
      : '<p style="color:var(--placeholder);font-style:italic">Rien à prévisualiser encore…</p>';
  }
}

function updateRapportWordCount() {
  const words = el('rapport-textarea').value.trim().split(/\s+/).filter(Boolean).length;
  el('rapport-wordcount').textContent = `${words} mot${words !== 1 ? 's' : ''}`;
}

let rapportSaveTimer = null;
function scheduleRapportSave() {
  updateRapportWordCount();
  clearTimeout(rapportSaveTimer);
  rapportSaveTimer = setTimeout(async () => {
    const content = el('rapport-textarea').value;
    state.rapport = await PUT(`/api/rapport/${state.currentQuestion.id}`, { content });
    el('rapport-saved-indicator').textContent = 'Sauvegardé';
    setTimeout(() => { el('rapport-saved-indicator').textContent = ''; }, 1500);
  }, 800);
}

// ── Voice Notes ────────────────────────────────────────────────────────────────
async function loadVoiceNotes() {
  if (!state.currentQuestion) return;
  state.voiceNotes = await GET(`/api/voice?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'voix') renderVoiceNotes();
  updateVisibleTabs();
}

function renderVoiceNotes() {
  const list = el('voice-notes-list');
  if (!state.voiceNotes.length) {
    list.innerHTML = emptyState('Aucune note vocale. Cliquez sur le microphone pour commencer.');
    return;
  }
  list.innerHTML = state.voiceNotes.map(v => {
    const dur = formatVoiceDuration(v.duration_seconds);
    return `
      <div class="voice-note-card" data-voice-id="${v.id}">
        <div class="voice-note-info">
          <div class="voice-note-title">🎤 ${v.title ? escapeHtml(v.title) : 'Note vocale'}</div>
          <div class="voice-note-meta">${dur} · ${formatDate(v.created_at)}</div>
        </div>
        <audio class="voice-note-audio" src="/recordings/${encodeURIComponent(v.filename)}" controls preload="none"></audio>
        <button class="voice-note-delete" data-del-voice="${v.id}" title="Supprimer">×</button>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-del-voice]').forEach(b => {
    b.addEventListener('click', () => {
      const v = state.voiceNotes.find(x => x.id === parseInt(b.dataset.delVoice));
      showConfirm({
        icon: '🎤',
        title: 'Supprimer cette note vocale ?',
        body: v?.title ? `"${v.title}" sera supprimée définitivement.` : 'Cette note vocale sera supprimée définitivement.',
        onConfirm: () => deleteVoiceNote(parseInt(b.dataset.delVoice)),
      });
    });
  });

  list.querySelectorAll('.voice-note-card').forEach(card => {
    card.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const id = parseInt(card.dataset.voiceId);
      const v  = state.voiceNotes.find(x => x.id === id);
      if (!v) return;
      CtxMenu.show(e.clientX, e.clientY, {
        delete: () => showConfirm({
          icon: '🎤',
          title: 'Supprimer cette note vocale ?',
          body: v.title ? `"${v.title}" sera supprimée définitivement.` : 'Cette note vocale sera supprimée définitivement.',
          onConfirm: () => deleteVoiceNote(v.id),
        }),
      });
    });
  });
}

async function deleteVoiceNote(id) {
  await DEL(`/api/voice/${id}`);
  state.voiceNotes = state.voiceNotes.filter(v => v.id !== id);
  renderVoiceNotes();
  toast('Note vocale supprimée.');
}

function formatVoiceDuration(secs) {
  const s = Math.round(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    state.voice.mediaRecorder = new MediaRecorder(stream, { mimeType });
    state.voice.audioChunks   = [];
    state.voice.seconds       = 0;

    state.voice.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.voice.audioChunks.push(e.data);
    };

    state.voice.mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(state.voice.audioChunks, { type: mimeType });
      state.voice.blobPreview = blob;
      const url = URL.createObjectURL(blob);
      el('voice-preview-audio').src = url;
      el('voice-title-input').value = '';
      showVoiceState('preview');
    };

    state.voice.mediaRecorder.start(100);
    state.voice.interval = setInterval(() => {
      state.voice.seconds++;
      const m = Math.floor(state.voice.seconds / 60);
      const s = state.voice.seconds % 60;
      el('voice-rec-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);

    showVoiceState('recording');
  } catch (err) {
    toast(`Microphone inaccessible : ${err.message}`);
  }
}

function stopVoiceRecording() {
  clearInterval(state.voice.interval);
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== 'inactive') {
    state.voice.mediaRecorder.stop();
  }
}

async function saveVoiceNote() {
  if (!state.voice.blobPreview) return;
  const blob  = state.voice.blobPreview;
  const ext   = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const title = el('voice-title-input').value.trim();

  const formData = new FormData();
  formData.append('file', blob, `recording.${ext}`);
  formData.append('duration', state.voice.seconds.toString());
  formData.append('title', title);

  const res = await fetch(`/api/voice/${state.currentQuestion.id}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) { toast('Erreur lors de la sauvegarde.'); return; }
  const note = await res.json();
  state.voiceNotes.unshift(note);
  discardVoiceNote();
  renderVoiceNotes();
  toast('Note vocale sauvegardée.');
}

function discardVoiceNote() {
  state.voice.blobPreview = null;
  const audio = el('voice-preview-audio');
  URL.revokeObjectURL(audio.src);
  audio.src = '';
  showVoiceState('idle');
}

function showVoiceState(name) {
  ['idle', 'recording', 'preview'].forEach(s => {
    el(`voice-${s}`).classList.toggle('hidden', s !== name);
  });
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  el('timer-start').disabled = true;
  el('timer-stop').disabled  = false;
  el('timer-pulse').classList.add('running');

  state.timer.interval = setInterval(() => {
    state.timer.seconds++;
    el('timer-display').textContent = formatSeconds(state.timer.seconds);
  }, 1000);
}

function stopTimer() {
  if (!state.timer.running) return;
  clearInterval(state.timer.interval);
  state.timer.running  = false;
  state.timer.stoppedAt = state.timer.seconds;
  el('timer-start').disabled = false;
  el('timer-stop').disabled  = true;
  el('timer-pulse').classList.remove('running');

  const mins = Math.round(state.timer.stoppedAt / 60 * 10) / 10;
  el('session-duration-label').textContent =
    `Session duration: ${formatSeconds(state.timer.stoppedAt)} (${mins.toFixed(1)} min)`;
  el('session-save-form').classList.remove('hidden');
  el('session-notes-input').value = '';
}

function resetTimer() {
  clearInterval(state.timer.interval);
  state.timer.running   = false;
  state.timer.seconds   = 0;
  state.timer.stoppedAt = 0;
  el('timer-display').textContent = '00:00:00';
  el('timer-start').disabled = false;
  el('timer-stop').disabled  = true;
  el('timer-pulse').classList.remove('running');
  el('session-save-form').classList.add('hidden');
}

async function confirmSaveSession() {
  if (!state.currentQuestion) return;
  const mins     = state.timer.stoppedAt / 60;
  const activity = document.querySelector('input[name="activity"]:checked')?.value || 'thinking';
  const notes    = el('session-notes-input').value.trim();

  await POST('/api/sessions', {
    question_id:     state.currentQuestion.id,
    duration_minutes: parseFloat(mins.toFixed(2)),
    activity_type:   activity,
    notes,
  });

  state.timer.seconds   = 0;
  state.timer.stoppedAt = 0;
  el('timer-display').textContent = '00:00:00';
  el('session-save-form').classList.add('hidden');
  await loadSessions();
  await loadStats();
  toast('Session saved.');
}

async function loadSessions() {
  if (!state.currentQuestion) return;
  state.sessions = await GET(`/api/sessions?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'timer') renderSessionsList();
  updateVisibleTabs();
}

const ACTIVITY_EMOJI = { reading: '📖', watching: '🎥', writing: '✍️', thinking: '💭' };

function renderSessionsList() {
  const container = el('sessions-items');
  if (!state.sessions.length) {
    container.innerHTML = emptyState('No sessions yet. Start the timer to track your study time.');
    return;
  }
  container.innerHTML = state.sessions.map(s => {
    const emoji = ACTIVITY_EMOJI[s.activity_type] || '📖';
    const mins  = Math.round(s.duration_minutes);
    return `
      <div class="session-item" data-session-id="${s.id}">
        <span class="session-item-activity">${emoji} ${capitalize(s.activity_type)}</span>
        <span>${mins} min</span>
        ${s.notes ? `<span class="session-item-note">${escapeHtml(s.notes)}</span>` : ''}
        <span class="session-item-meta">${formatDate(s.created_at)}</span>
      </div>`;
  }).join('');

  container.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const id = parseInt(item.dataset.sessionId);
      const s  = state.sessions.find(x => x.id === id);
      if (!s) return;
      const mins = Math.round(s.duration_minutes);
      CtxMenu.show(e.clientX, e.clientY, {
        delete: () => showConfirm({
          icon: '⏱️',
          title: 'Supprimer cette session ?',
          body: `Session de ${mins} min (${s.activity_type}) du ${formatDate(s.created_at)} sera supprimée.`,
          onConfirm: () => deleteSession(id),
        }),
      });
    });
  });
}

async function deleteSession(id) {
  await DEL(`/api/sessions/${id}`);
  state.sessions = state.sessions.filter(s => s.id !== id);
  renderSessionsList();
  loadStats();
  toast('Session supprimée.');
}

// ── AI Panel ──────────────────────────────────────────────────────────────────
function toggleAiPanel() {
  state.aiPanelCollapsed = !state.aiPanelCollapsed;
  el('ai-panel').classList.toggle('collapsed', state.aiPanelCollapsed);
  el('toggle-ai-panel').textContent = state.aiPanelCollapsed ? '‹' : '›';
}

async function generateAI() {
  if (!state.currentQuestion) { toast('Select a question first.'); return; }

  const area = el('ai-response-area');
  area.innerHTML = '<p class="ai-thinking">Thinking<span id="ai-dots">...</span></p>';
  el('ai-regenerate-btn').classList.add('hidden');
  el('ai-generate-btn').disabled = true;

  // Animate dots
  let dotCount = 0;
  const dotsInterval = setInterval(() => {
    const dots = el('ai-dots');
    if (dots) dots.textContent = '.'.repeat((dotCount++ % 3) + 1);
  }, 400);

  try {
    const data = await POST(`/api/ai/${state.currentQuestion.id}`, { mode: state.aiMode });
    clearInterval(dotsInterval);
    area.innerHTML = `<div class="ai-response-text">${escapeHtml(data.response)}</div>`;
    el('ai-regenerate-btn').classList.remove('hidden');
  } catch (err) {
    clearInterval(dotsInterval);
    area.innerHTML = `<div class="ai-error">Error: ${escapeHtml(err.message)}</div>`;
  } finally {
    el('ai-generate-btn').disabled = false;
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportMarkdown() {
  if (!state.currentQuestion) return;
  window.location.href = `/export/${state.currentQuestion.id}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Global event bindings ─────────────────────────────────────────────────────
function bindGlobalEvents() {
  // Theme toggle
  el('theme-toggle').addEventListener('click', toggleTheme);

  // Sidebar new question
  el('new-question-btn').addEventListener('click', openNewQuestion);

  // Question modal
  el('qm-save').addEventListener('click', saveQuestion);
  el('qm-cancel').addEventListener('click', closeQuestionModal);
  el('qm-delete').addEventListener('click', deleteQuestion);
  el('question-modal').addEventListener('click', e => {
    if (e.target === el('question-modal')) closeQuestionModal();
  });

  // Question header
  el('export-btn').addEventListener('click', exportMarkdown);
  el('edit-question-btn').addEventListener('click', openEditQuestion);

  // Tabs
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // "+" add-tab button
  el('tab-add-btn').addEventListener('click', e => {
    e.stopPropagation();
    const menu = el('tab-add-menu');
    const hidden = ALL_OPTIONAL_TABS.filter(t => !state.visibleTabs.has(t));
    menu.innerHTML = hidden.map(t =>
      `<button class="tab-add-item" data-tab="${t}">${TAB_LABELS[t]}</button>`
    ).join('');
    menu.classList.toggle('hidden');
  });

  el('tab-add-menu').addEventListener('click', e => {
    const btn = e.target.closest('.tab-add-item');
    if (!btn) return;
    const tab = btn.dataset.tab;
    state.visibleTabs.add(tab);
    el('tab-add-menu').classList.add('hidden');
    updateVisibleTabs();
    switchTab(tab);
  });

  document.addEventListener('click', e => {
    el('tab-add-menu').classList.add('hidden');
    if (!_cpEl.contains(e.target) && !e.target.closest('.md-color-btn')) {
      _cpEl.classList.add('hidden'); _cpState = null;
    }
  });

  // Toolbar delegation (notes + journal)
  document.querySelectorAll('.md-toolbar').forEach(toolbar => {
    toolbar.addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.target.closest('[data-action], .md-color-btn');
      if (!btn) return;
      const ta      = el(toolbar.dataset.target);
      const preview = toolbar.dataset.preview ? el(toolbar.dataset.preview) : null;
      if (!ta) return;
      if (btn.dataset.action)    applyMdAction(btn.dataset.action, ta, preview);
      else if (btn.dataset.colorType) openColorPicker(btn.dataset.colorType, ta, preview, btn);
    });
  });

  // Color picker swatches
  _cpEl.addEventListener('click', e => {
    e.stopPropagation();
    const swatch = e.target.closest('.cp-swatch');
    if (swatch) applyColorInsert(swatch.dataset.color);
  });

  // Notes
  el('new-note-btn').addEventListener('click', () => openNoteEditor(null));
  el('save-note-btn').addEventListener('click', saveNote);
  el('cancel-note-btn').addEventListener('click', closeNoteEditor);
  el('delete-note-btn').addEventListener('click', deleteNote);
  el('note-content').addEventListener('input', updateNotePreview);
  el('note-content').addEventListener('paste', pasteImage);

  // Journal
  el('journal-textarea').addEventListener('input', scheduleJournalSave);
  el('journal-textarea').addEventListener('paste', pasteImage);

  // Resources
  el('new-resource-btn').addEventListener('click', () => {
    el('resource-form').classList.toggle('hidden');
    if (!el('resource-form').classList.contains('hidden')) el('res-title').focus();
  });
  el('save-resource-btn').addEventListener('click', saveResource);
  el('cancel-resource-btn').addEventListener('click', () => {
    el('resource-form').classList.add('hidden');
  });
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.resourceFilter = btn.dataset.type;
      renderResourcesList();
    });
  });

  // Programme
  el('new-prog-btn').addEventListener('click', () => {
    el('programme-form').classList.toggle('hidden');
    if (!el('programme-form').classList.contains('hidden')) el('prog-title').focus();
  });
  el('save-prog-btn').addEventListener('click', saveProgItem);
  el('cancel-prog-btn').addEventListener('click', () => {
    const form = el('programme-form');
    delete form.dataset.editId;
    el('save-prog-btn').textContent = 'Ajouter';
    form.classList.add('hidden');
  });

  // Rapport
  el('rapport-textarea').addEventListener('input', scheduleRapportSave);
  el('rapport-edit-btn').addEventListener('click', () => switchRapportMode('edit'));
  el('rapport-preview-btn').addEventListener('click', () => switchRapportMode('preview'));

  // Voix
  el('voice-start-btn').addEventListener('click', startVoiceRecording);
  el('voice-stop-btn').addEventListener('click', stopVoiceRecording);
  el('voice-save-btn').addEventListener('click', saveVoiceNote);
  el('voice-discard-btn').addEventListener('click', discardVoiceNote);

  // Timer
  el('timer-start').addEventListener('click', startTimer);
  el('timer-stop').addEventListener('click', stopTimer);
  el('timer-reset').addEventListener('click', resetTimer);
  el('confirm-save-session').addEventListener('click', confirmSaveSession);
  el('discard-session').addEventListener('click', () => {
    el('session-save-form').classList.add('hidden');
    resetTimer();
  });

  // AI panel
  el('toggle-ai-panel').addEventListener('click', toggleAiPanel);
  el('ai-generate-btn').addEventListener('click', generateAI);
  el('ai-regenerate-btn').addEventListener('click', generateAI);
  document.querySelectorAll('.ai-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.aiMode = btn.dataset.mode;
    });
  });

  // Tour controls
  el('tour-launch').addEventListener('click', () => Tour.start());
  el('tour-skip').addEventListener('click', () => Tour.end());
  el('tour-next').addEventListener('click', () => Tour.next());
  el('tour-prev').addEventListener('click', () => Tour.prev());

  // Confirm modal
  el('confirm-cancel').addEventListener('click', hideConfirm);
  el('confirm-modal').addEventListener('click', e => {
    if (e.target === el('confirm-modal')) hideConfirm();
  });

  // Close context menu when clicking anywhere outside it
  document.addEventListener('click', e => {
    if (!el('ctx-menu').contains(e.target)) CtxMenu.hide();
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      CtxMenu.hide();
      if (!el('confirm-modal').classList.contains('hidden')) { hideConfirm(); return; }
      if (Tour.active) { Tour.end(); return; }
      if (!el('question-modal').classList.contains('hidden')) closeQuestionModal();
      if (!el('note-editor').classList.contains('hidden')) closeNoteEditor();
    }
    if (e.key === 'ArrowRight' && Tour.active) Tour.next();
    if (e.key === 'ArrowLeft'  && Tour.active) Tour.prev();
  });
}

// ── Tour ─────────────────────────────────────────────────────────────────────
const Tour = {
  active:  false,
  step:    0,
  _resizeHandler: null,

  steps: [
    // 0 ── Welcome (no spotlight)
    {
      target: null,
      position: 'center',
      emoji: '🧠',
      title: 'Bienvenue dans PhiloWeek',
      titleReturn: 'Visite guidée de PhiloWeek',
      body: 'Un espace focalisé pour l\'enquête philosophique. Une question à la fois — explorée à travers des notes, un journal, des ressources et un assistant IA.',
      bodyReturn: 'Rappel rapide de tout ce que vous pouvez faire dans PhiloWeek. Prenez 2 minutes ou cliquez sur Skip.',
    },
    // 1 ── Sidebar
    {
      target: '.sidebar',
      position: 'right',
      emoji: '📋',
      title: 'Vos questions',
      body: 'Toutes vos questions philosophiques apparaissent ici dans la barre latérale. La question active est marquée d\'une bordure indigo. Cliquez pour sélectionner, clic droit pour modifier ou supprimer.',
    },
    // 2 ── Right-click menu
    {
      target: '.sidebar-item',
      position: 'right',
      emoji: '🖱️',
      title: 'Clic droit — Modifier & Supprimer',
      body: 'Sur n\'importe quel élément créé (question, note, ressource, activité, session, note vocale), faites un clic droit pour accéder aux options Modifier et Supprimer. Une confirmation s\'affiche avant chaque suppression.',
    },
    // 3 ── New question button
    {
      target: '#new-question-btn',
      position: 'right',
      emoji: '✨',
      title: 'Créer une nouvelle question',
      body: 'Cliquez sur + pour formuler votre question de la semaine. Donnez-lui un titre précis et un contexte : qu\'est-ce qui vous attire vers cette question ? Pourquoi maintenant ?',
    },
    // 3 ── Question header
    {
      target: '.question-header',
      position: 'bottom',
      emoji: '📖',
      title: 'En-tête de la question',
      body: 'Votre question active et sa description s\'affichent ici. Utilisez le bouton Modifier pour affiner votre question au fil de votre réflexion — une bonne question évolue.',
    },
    // 4 ── Stats row
    {
      target: '.stats-row',
      position: 'bottom',
      emoji: '📊',
      title: 'Progression en un coup d\'œil',
      body: 'Quatre indicateurs clés : minutes d\'étude, notes rédigées, journal rédigé et ressources consultées. Ils se mettent à jour en temps réel.',
    },
    // 5 ── Notes tab
    {
      target: '[data-tab="notes"]',
      position: 'bottom',
      emoji: '📝',
      title: 'Notes structurées',
      body: 'L\'éditeur Markdown en vue fractionnée vous permet d\'écrire à gauche et de prévisualiser à droite. Une barre d\'outils gère le gras, l\'italique, les titres et les citations. Ajoutez des tags pour retrouver vos idées.',
    },
    // 6 ── Journal tab
    {
      target: '[data-tab="journal"]',
      position: 'bottom',
      emoji: '🗓️',
      title: 'Journal de réflexion',
      body: 'Un espace libre pour noter vos pensées et réflexions sur la question. Le journal se sauvegarde automatiquement.',
    },
    // 7 ── Programme tab
    {
      target: '[data-tab="programme"]',
      position: 'bottom',
      emoji: '🗺️',
      title: 'Programme de la semaine',
      body: 'Planifiez vos activités avant de commencer : articles à lire (avec lien), vidéos, sessions de réflexion sur un aspect précis, rapports à écrire. Réordonnez, cochez au fur et à mesure, lancez le timer directement depuis chaque activité.',
    },
    // 8 ── Rapport tab
    {
      target: '[data-tab="rapport"]',
      position: 'bottom',
      emoji: '✍️',
      title: 'Rapport personnel',
      body: 'Une page d\'écriture personnelle, sans IA. Rédigez votre synthèse, vos conclusions, votre essai de la semaine. Sauvegarde automatique, compteur de mots. Votre pensée, vos mots uniquement.',
    },
    // 8b ── Rapport preview
    {
      target: '#rapport-preview-btn',
      position: 'bottom',
      emoji: '👁️',
      title: 'Aperçu Markdown',
      body: 'Écrivez en Markdown dans le rapport, puis cliquez sur "Aperçu" pour voir le rendu mis en forme. Cliquez sur "Éditer" pour reprendre l\'écriture.',
    },
    // 9 ── Voix tab
    {
      target: '[data-tab="voix"]',
      position: 'bottom',
      emoji: '🎤',
      title: 'Notes vocales',
      body: 'Enregistrez votre voix à la place d\'écrire. Un clic sur le microphone démarre l\'enregistrement, un second l\'arrête. Prévisualisation avant sauvegarde. Toutes vos notes vocales sont listées avec lecture intégrée.',
    },
    // 10 ── Resources tab
    {
      target: '[data-tab="resources"]',
      position: 'bottom',
      emoji: '📚',
      title: 'Suivi des ressources',
      body: 'Ajoutez des livres, articles, vidéos et podcasts liés à votre question. Filtrez par type, cochez ceux que vous avez lus ou regardés. Un tracker de lecture intégré.',
    },
    // 11 ── Timer tab
    {
      target: '[data-tab="timer"]',
      position: 'bottom',
      emoji: '⏱️',
      title: 'Chronomètre de sessions',
      body: 'Mesurez le temps passé sur votre question et catégorisez chaque session : lecture, visionnage, écriture ou réflexion. L\'historique complet s\'affiche sous le timer.',
    },
    // 12 ── AI panel
    {
      target: '#ai-panel',
      position: 'left',
      emoji: '🤖',
      title: 'Assistant IA — 4 modes',
      body: 'Socratique : 3 questions qui percent vos hypothèses. Résumé : synthèse de votre pensée du jour. Explorateur : auteurs et livres à lire. Avocat du diable : l\'argument opposé le plus solide possible.',
    },
    // 10 ── Export
    {
      target: '#export-btn',
      position: 'bottom',
      emoji: '📥',
      title: 'Exporter en Markdown',
      body: 'Exportez tout en un clic : votre question, les stats, toutes vos notes, votre journal, vos ressources et l\'historique des sessions. Un fichier .md propre et structuré.',
    },
    // 11 ── Theme toggle
    {
      target: '#theme-toggle',
      position: 'right',
      emoji: '🌙',
      title: 'Mode sombre / clair',
      body: 'Basculez entre le mode clair et le mode sombre à tout moment. Votre préférence est sauvegardée automatiquement.',
    },
    // 12 ── Add-tab button
    {
      target: '#tab-add-btn',
      position: 'bottom',
      emoji: '➕',
      title: 'Sections à la demande',
      body: 'Les onglets n\'apparaissent que quand vous avez du contenu. Cliquez sur "+" pour ouvrir une section vide — Journal, Notes, Timer, etc.',
    },
    // 13 ── Finish (no spotlight)
    {
      target: null,
      position: 'center',
      emoji: '🚀',
      title: 'Vous êtes prêt',
      body: 'Commencez par une question qui vous trouble vraiment. La qualité de l\'enquête dépend entièrement de la qualité de la question — soyez précis, soyez honnête.',
    },
  ],

  isFirstVisit() { return !localStorage.getItem('pw_ever_seen_tour'); },
  markSeen()     { localStorage.setItem('pw_ever_seen_tour', '1'); },

  start() {
    this.active = true;
    this.step   = 0;
    el('tour-overlay').style.display = 'block';
    this.render();
    // Reposition on resize
    this._resizeHandler = () => { if (this.active) this.render(); };
    window.addEventListener('resize', this._resizeHandler);
  },

  end() {
    this.active = false;
    el('tour-overlay').style.display        = 'none';
    el('tour-spotlight-ring').style.display = 'none';
    el('tour-card').classList.add('hidden');
    el('tour-card').classList.remove('tour-center', 'tour-card-anim');
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this.markSeen();
  },

  next() { this.step < this.steps.length - 1 ? (this.step++, this.render()) : this.end(); },
  prev() { this.step > 0 && (this.step--, this.render()); },

  render() {
    const s       = this.steps[this.step];
    const isFirst = this.isFirstVisit();
    const isLast  = this.step === this.steps.length - 1;
    const isEdge  = this.step === 0 || isLast;
    const ring    = el('tour-spotlight-ring');
    const card    = el('tour-card');
    const overlay = el('tour-overlay');

    // Content
    const title = (this.step === 0 && !isFirst && s.titleReturn) ? s.titleReturn : s.title;
    const body  = (this.step === 0 && !isFirst && s.bodyReturn)  ? s.bodyReturn  : s.body;
    el('tour-emoji').textContent = s.emoji;
    el('tour-title').textContent = title;
    el('tour-body').textContent  = body;

    // Step counter (hide on first/last)
    el('tour-step-count').textContent = isEdge ? '' : `${this.step} / ${this.steps.length - 2}`;

    // Progress bar
    const pct = isLast ? 100 : isEdge ? 0 : (this.step / (this.steps.length - 2)) * 100;
    el('tour-progress-fill').style.width = `${pct}%`;

    // Skip button prominence: on returning welcome step
    const skipBtn = el('tour-skip');
    if (this.step === 0 && !isFirst) {
      skipBtn.classList.add('prominent');
      skipBtn.textContent = 'Passer le tutoriel';
    } else {
      skipBtn.classList.remove('prominent');
      skipBtn.textContent = 'Skip';
    }

    // Nav
    el('tour-prev').style.visibility = this.step === 0 ? 'hidden' : 'visible';
    el('tour-next').textContent = isLast ? 'C\'est parti →' : 'Suivant →';

    // Animation
    card.classList.remove('tour-card-anim');
    void card.offsetWidth; // force reflow
    card.classList.add('tour-card-anim');

    // Spotlight + card position
    if (s.target && s.position !== 'center') {
      const target = document.querySelector(s.target);
      if (target) {
        overlay.style.background = 'transparent';
        ring.style.display = 'block';
        this._placeRing(target);
        card.classList.remove('tour-center');
        card.style.transform = 'none';
        this._placeCard(target, s.position);
        return;
      }
    }
    // Fallback / center steps
    overlay.style.background = 'rgba(28,25,23,0.68)';
    ring.style.display = 'none';
    card.classList.add('tour-center');
    card.style.top = card.style.left = '';
  },

  _placeRing(target) {
    const r   = target.getBoundingClientRect();
    const p   = 6;
    const ring = el('tour-spotlight-ring');
    ring.style.top    = `${r.top  - p}px`;
    ring.style.left   = `${r.left - p}px`;
    ring.style.width  = `${r.width  + p * 2}px`;
    ring.style.height = `${r.height + p * 2}px`;
  },

  _placeCard(target, position) {
    const card = el('tour-card');
    const r    = target.getBoundingClientRect();
    const W    = 390;
    const gap  = 18;
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    // Measure card height after content is set
    card.style.visibility = 'hidden';
    card.classList.remove('hidden');
    const H = card.offsetHeight || 270;
    card.style.visibility = '';

    let top, left;
    switch (position) {
      case 'right':
        left = r.right + gap;
        top  = r.top + r.height / 2 - H / 2;
        break;
      case 'left':
        left = r.left - W - gap;
        top  = r.top + r.height / 2 - H / 2;
        break;
      case 'bottom':
        left = r.left + r.width / 2 - W / 2;
        top  = r.bottom + gap;
        break;
      default:
        left = r.left + r.width / 2 - W / 2;
        top  = r.top - H - gap;
    }

    // Clamp within viewport
    left = Math.max(gap, Math.min(left, vw - W - gap));
    top  = Math.max(gap, Math.min(top,  vh - H - gap));

    card.style.left  = `${left}px`;
    card.style.top   = `${top}px`;
    card.style.width = `${W}px`;
    card.classList.remove('hidden');
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
init().then(async () => {
  try {
    const { id } = await GET('/api/app-session');
    const stored = localStorage.getItem('pw_app_session_id');
    if (id !== stored) {
      localStorage.setItem('pw_app_session_id', id);
    }
  } catch {
    // If endpoint unavailable, don't block startup
  }
}).catch(console.error);
