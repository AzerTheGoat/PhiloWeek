// ── Voice Notes ────────────────────────────────────────────────────────────────
async function loadVoiceNotes() {
  if (!state.currentQuestion) return;
  state.voiceNotes = await GET(`/api/voice?question_id=${state.currentQuestion.id}`);
  if (state.activeTab === 'voix') renderVoiceNotes();
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
