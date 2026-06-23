// ── Resources ─────────────────────────────────────────────────────────────────
async function loadResources() {
  if (!state.currentQuestion) return;
  state.resources = await GET(`/api/resources?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'resources') renderResourcesList();
}

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
