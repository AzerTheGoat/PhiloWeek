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
}

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
