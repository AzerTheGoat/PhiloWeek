// ── Journal ───────────────────────────────────────────────────────────────────
async function loadJournal() {
  if (!state.currentQuestion) return;
  const entries = await GET(`/api/journal/${state.currentQuestion.id}`);
  state.journalEntries = {};
  entries.forEach(e => { state.journalEntries[e.day_number] = e; });
  if (state.activeTab === 'journal') renderJournalDays();
}

function renderJournalDays() {
  const container = el('journal-days');
  container.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const day  = i + 1;
    const entry = state.journalEntries[day];
    const hasContent = entry && entry.content && entry.content.trim();
    const isCurrent  = day === state.activeJournalDay;
    let cls = 'day-circle';
    if (hasContent) cls += ' completed';
    else if (isCurrent) cls += ' current';
    if (isCurrent) cls += ' selected';
    return `<button class="${cls}" data-day="${day}" aria-label="Day ${day}">${day}</button>`;
  }).join('');

  container.querySelectorAll('.day-circle').forEach(btn => {
    const day = parseInt(btn.dataset.day);
    btn.addEventListener('click', () => selectJournalDay(day));
    btn.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      const entry = state.journalEntries[day];
      if (!entry?.content?.trim()) return;
      CtxMenu.show(e.clientX, e.clientY, {
        delete: () => showConfirm({
          icon: '📔',
          title: `Effacer le jour ${day} ?`,
          body: 'Le contenu de ce jour sera supprimé définitivement.',
          onConfirm: async () => {
            await saveJournalDay(day, '');
            state.journalEntries[day] = { ...state.journalEntries[day], content: '' };
            if (state.activeJournalDay === day) el('journal-textarea').value = '';
            renderJournalDays();
          },
        }),
      });
    });
  });

  loadJournalDay(state.activeJournalDay);
}

function selectJournalDay(day) {
  // Autosave current before switching
  saveJournalDay(state.activeJournalDay, el('journal-textarea').value);
  state.activeJournalDay = day;
  renderJournalDays();
}

function loadJournalDay(day) {
  const entry = state.journalEntries[day];
  el('journal-textarea').value = entry ? entry.content : '';
  el('journal-day-label').textContent = `Day ${day}`;
  el('journal-saved-indicator').textContent = '';
}

let journalSaveTimer = null;
async function saveJournalDay(day, content) {
  if (!state.currentQuestion) return;
  const entry = await PUT(`/api/journal/${state.currentQuestion.id}/${day}`, { content });
  state.journalEntries[day] = entry;
  loadStats();
}

function scheduleJournalSave() {
  clearTimeout(journalSaveTimer);
  journalSaveTimer = setTimeout(async () => {
    const content = el('journal-textarea').value;
    await saveJournalDay(state.activeJournalDay, content);
    el('journal-saved-indicator').textContent = 'Saved';
    setTimeout(() => { el('journal-saved-indicator').textContent = ''; }, 1500);
    renderJournalDays();
  }, 800);
}
