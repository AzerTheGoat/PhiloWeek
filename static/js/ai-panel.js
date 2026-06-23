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
