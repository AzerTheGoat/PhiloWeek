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

  // Load data
  await Promise.all([
    loadStats(), loadNotes(), loadJournal(), loadResources(),
    loadSessions(), loadProgramme(), loadRapport(), loadVoiceNotes(),
  ]);

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
  el('stat-journal').textContent   = `${s.journal_days}/7`;
  el('stat-resources').textContent = `${s.resources_watched}/${s.resources_total}`;
  el('timer-today').textContent    = `Today: ${s.today_time} min`;
  el('timer-alltime').textContent  = `All time: ${s.total_time} min`;
}
