// ── State ────────────────────────────────────────────────────────────────────
const state = {
  questions:        [],
  currentQuestion:  null,
  notes:            [],
  currentNote:      null,
  journalEntries:   {},
  resources:        [],
  sessions:         [],
  programme:        [],
  rapport:          { content: '' },
  voiceNotes:       [],
  stats:            null,
  activeTab:        'programme',
  activeJournalDay: 1,
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

// ── Constants ─────────────────────────────────────────────────────────────────
const PROG_EMOJI = { article: '📖', video: '🎥', reflection: '💭', writing: '✍️', podcast: '🎧' };
const PROG_ACTIVITY = { article: 'reading', video: 'watching', reflection: 'thinking', writing: 'writing', podcast: 'reading' };
const TYPE_EMOJI = { video: '🎥', link: '🔗', book: '📚', podcast: '🎧' };
const ACTIVITY_EMOJI = { reading: '📖', watching: '🎥', writing: '✍️', thinking: '💭' };
