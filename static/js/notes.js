// ── Notes ─────────────────────────────────────────────────────────────────────
async function loadNotes() {
  if (!state.currentQuestion) return;
  state.notes = await GET(`/api/notes?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'notes') renderNotesList();
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
    preview.textContent = 'Preview will appear here…';
  } else {
    preview.textContent = md;
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

// Markdown toolbar
function applyMdAction(action) {
  const ta = el('note-content');
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(end);

  let insertion = '';
  let cursorOffset = 0;

  switch (action) {
    case 'bold':
      insertion = `**${sel || 'bold text'}**`;
      cursorOffset = sel ? insertion.length : 2;
      break;
    case 'italic':
      insertion = `*${sel || 'italic text'}*`;
      cursorOffset = sel ? insertion.length : 1;
      break;
    case 'h2':
      insertion = `## ${sel || 'Heading'}`;
      cursorOffset = insertion.length;
      break;
    case 'quote':
      insertion = `> ${sel || 'quoted text'}`;
      cursorOffset = insertion.length;
      break;
    case 'link':
      insertion = sel ? `[${sel}](url)` : '[link text](url)';
      cursorOffset = sel ? insertion.length - 1 : 1;
      break;
  }

  ta.value = before + insertion + after;
  const pos = start + cursorOffset;
  ta.setSelectionRange(pos, pos);
  ta.focus();
  updateNotePreview();
}
