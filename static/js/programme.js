// ── Programme ─────────────────────────────────────────────────────────────────
async function loadProgramme() {
  if (!state.currentQuestion) return;
  state.programme = await GET(`/api/programme?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'programme') renderProgramme();
}

function renderProgramme() {
  const list = el('programme-list');
  if (!state.programme.length) {
    list.innerHTML = emptyState('Aucune activité planifiée. Commencez par définir ce que vous allez lire, regarder ou explorer cette semaine.');
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
