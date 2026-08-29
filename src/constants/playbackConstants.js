// --- PLAYBACK & CONTROL SHELL CONSTANTS ---

export const V511_PLAYBACK_PARTS = [
  { key: 'word_en', label: 'Word EN', shortLabel: 'WORD EN', language: 'EN', defaultEnabled: true },
  { key: 'word_idn', label: 'Word IDN', shortLabel: 'WORD IDN', language: 'IDN', defaultEnabled: false },
  { key: 'sentence_en', label: 'Sentence EN', shortLabel: 'SENT EN', language: 'EN', defaultEnabled: true },
  { key: 'sentence_idn', label: 'Sentence IDN', shortLabel: 'SENT IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp1_en', label: 'EXP1 EN', shortLabel: 'E1 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp1_idn', label: 'EXP1 IDN', shortLabel: 'E1 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp2_en', label: 'EXP2 EN', shortLabel: 'E2 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp2_idn', label: 'EXP2 IDN', shortLabel: 'E2 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp3_en', label: 'EXP3 EN', shortLabel: 'E3 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp3_idn', label: 'EXP3 IDN', shortLabel: 'E3 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp4_en', label: 'EXP4 EN', shortLabel: 'E4 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp4_idn', label: 'EXP4 IDN', shortLabel: 'E4 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp5_en', label: 'EXP5 EN', shortLabel: 'E5 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp5_idn', label: 'EXP5 IDN', shortLabel: 'E5 IDN', language: 'IDN', defaultEnabled: false }
];

export const V511_DELAY_OPTIONS = [0, 150, 300, 500, 750, 1000, 1500, 2000, 3000];
export const V511_DEFAULT_DELAYS = { partDelayMs: 300, repeatDelayMs: 300 };

export const V511_PLAYBACK_PRESETS = {
  vocabulary: {
    label: 'Vocabulary',
    shortLabel: 'VOCAB',
    description: 'Word EN 2x → Word IDN',
    order: ['word_en', 'word_idn'],
    repeats: { word_en: 2, word_idn: 1 },
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  sentence: {
    label: 'Sentence',
    shortLabel: 'SENT',
    description: 'Sentence EN 2x → Sentence IDN',
    order: ['sentence_en', 'sentence_idn'],
    repeats: { sentence_en: 2, sentence_idn: 1 },
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  expression: {
    label: 'Expression',
    shortLabel: 'EXP',
    description: 'EXP1–EXP5 EN → IDN',
    order: [
      'exp1_en', 'exp1_idn', 'exp2_en', 'exp2_idn', 'exp3_en', 'exp3_idn',
      'exp4_en', 'exp4_idn', 'exp5_en', 'exp5_idn'
    ],
    repeats: {},
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  listening: {
    label: 'Listening',
    shortLabel: 'LISTEN',
    description: 'EN only • Word 2x + Sentence/EXP',
    order: ['word_en', 'sentence_en', 'exp1_en', 'exp2_en', 'exp3_en', 'exp4_en', 'exp5_en'],
    repeats: { word_en: 2 },
    delays: { partDelayMs: 750, repeatDelayMs: 300 }
  }
};

export const V5116_CONTROL_SECTIONS = [
  { key: 'player', label: 'Player', shortLabel: 'PLAYER' },
  { key: 'learn', label: 'Learn', shortLabel: 'LEARN' },
  { key: 'data', label: 'Data', shortLabel: 'DATA' },
  { key: 'system', label: 'System', shortLabel: 'SYSTEM' }
];

export const V5116_CONTROL_SECTION_KEYS = new Set(V5116_CONTROL_SECTIONS.map(section => section.key));
