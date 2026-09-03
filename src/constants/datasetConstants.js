// --- DATASET & VIRTUALIZATION CONSTANTS ---

export const DEFAULT_ROW_HEIGHT_PC = 160; 
export const DEFAULT_ROW_HEIGHT_MOBILE = 184; 
export const OVERSCAN = 20;

export const V58_CANONICAL_HEADERS = [
  'VOCAB_ID', 'NO', 'WORDS', 'PART OF SPEECH', 'MEANING', 'INFO', 'EN', 'IDN',
  'EXP1_EN', 'EXP1_IDN', 'EXP2_EN', 'EXP2_IDN', 'EXP3_EN', 'EXP3_IDN',
  'EXP4_EN', 'EXP4_IDN', 'EXP5_EN', 'EXP5_IDN'
];

export const V510_SOURCE_KEYS = ['main', 'sentence', 'exp1', 'exp2', 'exp3', 'exp4', 'exp5'];

export const V510_SOURCE_LABELS = {
  main: 'MAIN',
  sentence: 'SENTENCE',
  exp1: 'EXP1',
  exp2: 'EXP2',
  exp3: 'EXP3',
  exp4: 'EXP4',
  exp5: 'EXP5'
};
