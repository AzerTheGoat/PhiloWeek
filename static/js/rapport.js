// ── Rapport ───────────────────────────────────────────────────────────────────
async function loadRapport() {
  if (!state.currentQuestion) return;
  state.rapport = await GET(`/api/rapport/${state.currentQuestion.id}`);
  if (state.activeTab === 'rapport') renderRapport();
}

function renderRapport() {
  el('rapport-textarea').value = state.rapport.content || '';
  updateRapportWordCount();
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
