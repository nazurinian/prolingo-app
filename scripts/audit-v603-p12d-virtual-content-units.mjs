import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEXT_CONTENT_UNIT_ADAPTER_VERSION,
  TEXT_CONTENT_UNIT_PROJECTION_STATUS,
  TEXT_VIRTUAL_CONTENT_UNIT_KINDS,
  TEXT_VIRTUAL_KEY_PREFIX,
  TextContentUnitAdapterError,
  buildVirtualCardKey,
  buildVirtualParagraphUnitKey,
  buildVirtualTurnUnitKey,
  flattenVirtualContentUnitProjection,
  projectTextDocumentToVirtualContentUnits,
  sliceVirtualContentUnitProjectionFromHere,
  validateTextDocumentTreeForVirtualContentUnits
} from '../src/domain/text/textContentUnitAdapterDomain.js';
import {
  createDefaultTextIdCounters,
  resolveTextLibraryDocumentTree
} from '../src/domain/text/textLibraryDomain.js';
import {
  TEXT_PARAGRAPH_CARD_ROLES,
  TEXT_PARAGRAPH_ROLE_METADATA_KEY
} from '../src/domain/text/textParagraphRoleDomain.js';
import {
  buildTextStructuredAudioRenderDescriptor,
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackList,
  resolveStructuredTextPlaybackScopeList
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import {
  TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY,
  buildTextStructuredFullArtifactIdentity,
  buildTextStructuredFullRepresentation
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  TEXT_WORKSPACE_TYPES,
  resolveTextWorkspaceType
} from '../src/domain/text/textWorkspaceTaxonomyDomain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

let passCount = 0;
let failCount = 0;
const details = [];

const runCheck = (name, fn) => {
  try {
    const note = fn();
    passCount += 1;
    const suffix = note ? ` — ${note}` : '';
    console.log(`[PASS] ${name}${suffix}`);
    details.push({ status: 'PASS', name, note: note || '' });
  } catch (error) {
    failCount += 1;
    console.error(`[FAIL] ${name}: ${error?.stack || error?.message || String(error)}`);
    details.push({ status: 'FAIL', name, note: error?.message || String(error) });
  }
};

const deepFreeze = value => {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    value.forEach(item => deepFreeze(item));
  } else {
    Object.values(value).forEach(child => deepFreeze(child));
  }
  return value;
};

const canonicalJson = value => JSON.stringify(value, (_key, current) => {
  if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
  return Object.keys(current).sort().reduce((acc, k) => {
    acc[k] = current[k];
    return acc;
  }, {});
});

const scanForForbiddenIdAllocations = (value, currentPath = 'projection', hits = []) => {
  if (typeof value === 'string') {
    if (/^(UNIT|UNITUID)_/i.test(value) || /\bUNIT_\d+\b/i.test(value) || /\bUNITUID_[A-Z0-9_-]+/i.test(value)) {
      hits.push({ path: currentPath, value });
    }
    return hits;
  }
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForForbiddenIdAllocations(item, `${currentPath}[${index}]`, hits));
    return hits;
  }
  Object.entries(value).forEach(([key, child]) => {
    scanForForbiddenIdAllocations(child, `${currentPath}.${key}`, hits);
  });
  return hits;
};

const FIXED_TS = 1763200000000;

const createRichSnapshot = () => {
  const counters = {
    ...createDefaultTextIdCounters(),
    collection: 1,
    document: 4,
    text: 10,
    segment: 16,
    audioVariant: 3
  };

  const speakerRegistryMixed = [
    { id: 'SPK_AMELIA01', uid: 'SPKUID_00000000-0000-4000-8000-000000000001', label: 'Amelia' },
    { id: 'SPK_BEN00001', uid: 'SPKUID_00000000-0000-4000-8000-000000000002', label: 'Ben' },
    { id: 'SPK_ALEX_01', uid: 'SPKUID_00000000-0000-4000-8000-000000000003', label: 'Alex' },
    { id: 'SPK_ALEX_02', uid: 'SPKUID_00000000-0000-4000-8000-000000000004', label: 'Alex (Moderator)' }
  ];

  const documents = [
    {
      id: 'DOC_000001',
      uid: 'DOCUID_LEGACY_0001',
      order: 1,
      collectionId: null,
      title: 'Legacy Mixed-Tag Workspace',
      documentType: 'mixed',
      editorModel: 'legacy-line-v1',
      textLanguage: 'en',
      meaningLanguage: 'id',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: { legacyHighWater: 2 }
    },
    {
      id: 'DOC_000002',
      uid: 'DOCUID_PARA_0002',
      order: 2,
      collectionId: null,
      title: 'Paragraph Study Workspace',
      documentType: 'paragraph',
      editorModel: 'structured-v1',
      textLanguage: 'en',
      meaningLanguage: 'id',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'DOC_000003',
      uid: 'DOCUID_CONV_0003',
      order: 3,
      collectionId: null,
      title: 'Conversation Practice Workspace',
      documentType: 'conversation',
      editorModel: 'structured-v1',
      textLanguage: 'en',
      meaningLanguage: 'id',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: speakerRegistryMixed
      }
    },
    {
      id: 'DOC_000004',
      uid: 'DOCUID_MIX_0004',
      order: 4,
      collectionId: null,
      title: 'Structured Mixed Workspace',
      documentType: 'mixed',
      editorModel: 'structured-v1',
      textLanguage: 'en',
      meaningLanguage: 'id',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: speakerRegistryMixed
      }
    }
  ];

  const blocks = [
    // DOC_000001 Legacy
    {
      id: 'TEXT_000001',
      uid: 'BLKUID_LEG_0001',
      documentId: 'DOC_000001',
      order: 1,
      blockType: 'paragraph',
      title: null,
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: { migratedFromLegacyLine: true }
    },
    // DOC_000002 Paragraph: Title Card (1 seg) + N-seg Body Card + Empty Card
    {
      id: 'TEXT_000002',
      uid: 'BLKUID_PARA_0002',
      documentId: 'DOC_000002',
      order: 1,
      blockType: 'paragraph',
      title: 'Card Title Slot (Untouched)',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: TEXT_PARAGRAPH_CARD_ROLES.TITLE,
        [TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY]: {
          text: {
            fullArtifactFingerprint: 'full-sha256-title-en-01',
            channel: 'text',
            filename: 'TEXT_000002_full_text.mp3',
            stagingKey: 'staging/text/TEXT_000002/full_text.mp3'
          }
        }
      }
    },
    {
      id: 'TEXT_000003',
      uid: 'BLKUID_PARA_0003',
      documentId: 'DOC_000002',
      order: 2,
      blockType: 'paragraph',
      title: 'Morning Routine Body',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH,
        [TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY]: {
          text: {
            fullArtifactFingerprint: 'full-sha256-body-en-02',
            channel: 'text',
            filename: 'TEXT_000003_full_text.mp3'
          },
          meaning: {
            fullArtifactFingerprint: 'full-sha256-body-id-02',
            channel: 'meaning',
            filename: 'TEXT_000003_full_meaning.mp3'
          }
        }
      }
    },
    {
      id: 'TEXT_000004',
      uid: 'BLKUID_PARA_0004',
      documentId: 'DOC_000002',
      order: 3,
      blockType: 'paragraph',
      title: 'Empty Draft Paragraph',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH
      }
    },
    // DOC_000003 Conversation: Card 1 (Amelia->Ben->Amelia), Card 2 (Amelia->Amelia + missing ID + duplicate text + same label distinct IDs), Card 3 (Empty Conversation)
    {
      id: 'TEXT_000005',
      uid: 'BLKUID_CONV_0005',
      documentId: 'DOC_000003',
      order: 1,
      blockType: 'conversation',
      title: 'Cafe Dialogue A',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'TEXT_000006',
      uid: 'BLKUID_CONV_0006',
      documentId: 'DOC_000003',
      order: 2,
      blockType: 'conversation',
      title: 'Cafe Dialogue B',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'TEXT_000007',
      uid: 'BLKUID_CONV_0007',
      documentId: 'DOC_000003',
      order: 3,
      blockType: 'conversation',
      title: 'Empty Draft Conversation',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    // DOC_000004 Mixed: Paragraph Card + Conversation Card + Second Paragraph Title Card
    {
      id: 'TEXT_000008',
      uid: 'BLKUID_MIX_0008',
      documentId: 'DOC_000004',
      order: 1,
      blockType: 'paragraph',
      title: 'Scene Intro',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: TEXT_PARAGRAPH_CARD_ROLES.TITLE
      }
    },
    {
      id: 'TEXT_000009',
      uid: 'BLKUID_MIX_0009',
      documentId: 'DOC_000004',
      order: 2,
      blockType: 'conversation',
      title: 'Scene Exchange',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'TEXT_000010',
      uid: 'BLKUID_MIX_0010',
      documentId: 'DOC_000004',
      order: 3,
      blockType: 'paragraph',
      title: 'Scene Summary',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: TEXT_PARAGRAPH_CARD_ROLES.PARAGRAPH
      }
    }
  ];

  const segments = [
    // Legacy segment
    {
      id: 'SEGMENT_000001',
      uid: 'SEGUID_000001',
      documentId: 'DOC_000001',
      blockId: 'TEXT_000001',
      order: 1,
      text: 'Legacy line one',
      meaning: '',
      speaker: null,
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: { createdByLegacyBridge: true }
    },
    // Paragraph Title Card segment
    {
      id: 'SEGMENT_000002',
      uid: 'SEGUID_000002',
      documentId: 'DOC_000002',
      blockId: 'TEXT_000002',
      order: 1,
      text: 'Chapter One: Morning Coffee',
      meaning: 'Bab Satu: Kopi Pagi',
      speaker: null,
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        audioVoiceOverrideV1: { text: { engine: 'edge', voiceId: 'en-US-AriaNeural', rate: 0 } }
      }
    },
    // Paragraph Body Card (3 segments)
    {
      id: 'SEGMENT_000003',
      uid: 'SEGUID_000003',
      documentId: 'DOC_000002',
      blockId: 'TEXT_000003',
      order: 1,
      text: 'She walks into the quiet cafe.',
      meaning: 'Dia masuk ke kafe yang tenang.',
      speaker: null,
      joinAfter: 'space',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'SEGMENT_000004',
      uid: 'SEGUID_000004',
      documentId: 'DOC_000002',
      blockId: 'TEXT_000003',
      order: 2,
      text: 'Sunlight hits the wooden counter.',
      meaning: 'Sinar matahari menyentuh meja kayu.',
      speaker: null,
      joinAfter: 'none',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'SEGMENT_000005',
      uid: 'SEGUID_000005',
      documentId: 'DOC_000002',
      blockId: 'TEXT_000003',
      order: 3,
      text: 'Today feels peaceful.',
      meaning: 'Hari ini terasa damai.',
      speaker: null,
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    // Conversation Card 1: Amelia -> Ben -> Amelia
    {
      id: 'SEGMENT_000006',
      uid: 'SEGUID_000006',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000005',
      order: 1,
      text: 'Good morning, Ben!',
      meaning: 'Selamat pagi, Ben!',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_AMELIA01'
      }
    },
    {
      id: 'SEGMENT_000007',
      uid: 'SEGUID_000007',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000005',
      order: 2,
      text: 'Morning, Amelia! Espresso?',
      meaning: 'Pagi, Amelia! Espresso?',
      speaker: 'Ben',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_BEN00001'
      }
    },
    {
      id: 'SEGMENT_000008',
      uid: 'SEGUID_000008',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000005',
      order: 3,
      text: 'Yes, please.',
      meaning: 'Ya, tolong.',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_AMELIA01'
      }
    },
    // Conversation Card 2: Amelia -> Amelia (no merge), Missing speakerId, Duplicate text, Same label distinct IDs
    {
      id: 'SEGMENT_000009',
      uid: 'SEGUID_000009',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 1,
      text: 'I forgot my wallet.',
      meaning: 'Dompet saya tertinggal.',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_AMELIA01'
      }
    },
    {
      id: 'SEGMENT_000010',
      uid: 'SEGUID_000010',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 2,
      text: 'Oh wait, here it is!',
      meaning: 'Oh tunggu, ini dia!',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_AMELIA01'
      }
    },
    {
      id: 'SEGMENT_000011',
      uid: 'SEGUID_000011',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 3,
      text: 'Thank you!',
      meaning: 'Terima kasih!',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      // Deliberately missing speakerIdentityV1 despite textual speaker matching registry label!
      metadata: {}
    },
    {
      id: 'SEGMENT_000012',
      uid: 'SEGUID_000012',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 4,
      text: 'Thank you!',
      meaning: 'Terima kasih!',
      speaker: 'Alex',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_ALEX_01'
      }
    },
    {
      id: 'SEGMENT_000013',
      uid: 'SEGUID_000013',
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 5,
      text: 'No problem at all.',
      meaning: 'Tidak masalah sama sekali.',
      speaker: 'Alex',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_ALEX_02'
      }
    },
    // Mixed Document Segments
    {
      id: 'SEGMENT_000014',
      uid: 'SEGUID_000014',
      documentId: 'DOC_000004',
      blockId: 'TEXT_000008',
      order: 1,
      text: 'Scene One: Evening Market',
      meaning: 'Adegan Satu: Pasar Malam',
      speaker: null,
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    },
    {
      id: 'SEGMENT_000015',
      uid: 'SEGUID_000015',
      documentId: 'DOC_000004',
      blockId: 'TEXT_000009',
      order: 1,
      text: 'How much are the mangoes?',
      meaning: 'Berapa harga mangganya?',
      speaker: 'Amelia',
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: 'SPK_AMELIA01'
      }
    },
    {
      id: 'SEGMENT_000016',
      uid: 'SEGUID_000016',
      documentId: 'DOC_000004',
      blockId: 'TEXT_000010',
      order: 1,
      text: 'She buys two sweet mangoes.',
      meaning: 'Dia membeli dua mangga manis.',
      speaker: null,
      joinAfter: 'line',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {}
    }
  ];

  const audioVariants = [
    {
      id: 'TXTAUDIO_000001',
      segmentId: 'SEGMENT_000002',
      channel: 'text',
      engine: 'edge',
      source: 'generated',
      voiceId: 'en-US-AriaNeural',
      filename: 'SEGMENT_000002_text_edge.mp3',
      mimeType: 'audio/mpeg',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        stagingKey: 'staging/text/SEGMENT_000002/text_edge.mp3',
        renderFingerprint: 'render-sha256-sample-seg02'
      }
    },
    {
      id: 'TXTAUDIO_000002',
      segmentId: 'SEGMENT_000006',
      channel: 'text',
      engine: 'edge',
      source: 'generated',
      voiceId: 'en-US-JennyNeural',
      filename: 'SEGMENT_000006_text_edge.mp3',
      mimeType: 'audio/mpeg',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        stagingKey: 'staging/text/SEGMENT_000006/text_edge.mp3'
      }
    },
    {
      id: 'TXTAUDIO_000003',
      segmentId: 'SEGMENT_000006',
      channel: 'meaning',
      engine: 'edge',
      source: 'generated',
      voiceId: 'id-ID-GadisNeural',
      filename: 'SEGMENT_000006_meaning_edge.mp3',
      mimeType: 'audio/mpeg',
      createdAt: FIXED_TS,
      updatedAt: FIXED_TS,
      metadata: {
        stagingKey: 'staging/text/SEGMENT_000006/meaning_edge.mp3'
      }
    }
  ];

  return {
    schemaVersion: 1,
    activeDocumentId: 'DOC_000002',
    initialized: true,
    counters,
    collections: [],
    documents,
    blocks,
    segments,
    audioVariants
  };
};

const snapshot = createRichSnapshot();
const legacyTree = resolveTextLibraryDocumentTree(snapshot, 'DOC_000001');
const paragraphTree = resolveTextLibraryDocumentTree(snapshot, 'DOC_000002');
const conversationTree = resolveTextLibraryDocumentTree(snapshot, 'DOC_000003');
const mixedTree = resolveTextLibraryDocumentTree(snapshot, 'DOC_000004');

// Test 01: Legacy exclusion & Structured workspace classification
runCheck('01. Legacy unsupported without unit allocation & Structured classification', () => {
  assert.equal(resolveTextWorkspaceType(legacyTree), TEXT_WORKSPACE_TYPES.LEGACY);
  const legacyProjection = projectTextDocumentToVirtualContentUnits(legacyTree);
  assert.equal(legacyProjection.adapterVersion, TEXT_CONTENT_UNIT_ADAPTER_VERSION);
  assert.equal(legacyProjection.supported, false);
  assert.equal(legacyProjection.status, TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_LEGACY);
  assert.equal(legacyProjection.workspaceType, TEXT_WORKSPACE_TYPES.LEGACY);
  assert.equal(legacyProjection.documentType, 'mixed');
  assert.deepEqual(legacyProjection.cards, []);
  assert.equal(legacyProjection.unitCount, 0);
  assert.equal(legacyProjection.segmentCount, 0);
  assert.deepEqual(legacyProjection.virtualKeys, []);

  const pProj = projectTextDocumentToVirtualContentUnits(paragraphTree);
  const cProj = projectTextDocumentToVirtualContentUnits(conversationTree);
  const mProj = projectTextDocumentToVirtualContentUnits(mixedTree);
  assert.equal(pProj.supported, true);
  assert.equal(pProj.workspaceType, TEXT_WORKSPACE_TYPES.PARAGRAPH);
  assert.equal(cProj.supported, true);
  assert.equal(cProj.workspaceType, TEXT_WORKSPACE_TYPES.CONVERSATION);
  assert.equal(mProj.supported, true);
  assert.equal(mProj.workspaceType, TEXT_WORKSPACE_TYPES.MIXED);
  return 'legacy excluded (0 units); paragraph/conversation/mixed projected';
});

// Test 02: Paragraph 1 segment, N segments, and 2 cards exact ordering & identity
runCheck('02. Paragraph 1-segment, N-segment, and 2+ cards ordering & identity', () => {
  const twoCardSnapshot = structuredClone(snapshot);
  twoCardSnapshot.blocks = twoCardSnapshot.blocks.filter(b => b.id === 'TEXT_000002' || b.id === 'TEXT_000003');
  twoCardSnapshot.segments = twoCardSnapshot.segments.filter(s => s.blockId === 'TEXT_000002' || s.blockId === 'TEXT_000003');
  twoCardSnapshot.audioVariants = twoCardSnapshot.audioVariants.filter(a => a.segmentId === 'SEGMENT_000002');
  const twoCardTree = resolveTextLibraryDocumentTree(twoCardSnapshot, 'DOC_000002');

  const proj = projectTextDocumentToVirtualContentUnits(twoCardTree);
  assert.equal(proj.cards.length, 2);
  assert.equal(proj.unitCount, 2);
  assert.equal(proj.segmentCount, 4);

  const [card1, card2] = proj.cards;
  assert.equal(card1.virtualCardKey, buildVirtualCardKey('TEXT_000002'));
  assert.equal(card1.units.length, 1);
  assert.equal(card1.units[0].virtualUnitKey, buildVirtualParagraphUnitKey('TEXT_000002'));
  assert.deepEqual(card1.units[0].segmentIds, ['SEGMENT_000002']);

  assert.equal(card2.virtualCardKey, buildVirtualCardKey('TEXT_000003'));
  assert.equal(card2.units.length, 1);
  assert.equal(card2.units[0].virtualUnitKey, buildVirtualParagraphUnitKey('TEXT_000003'));
  assert.deepEqual(card2.units[0].segmentIds, ['SEGMENT_000003', 'SEGMENT_000004', 'SEGMENT_000005']);
  assert.equal(card2.units[0].segments[1].joinAfter, 'none');
  return '1-seg + 3-seg across 2 paragraph cards preserve exact order & IDs';
});

// Test 03: Old paragraphRoleV1: 'title' remains playable Paragraph card; metadata survives
runCheck('03. Paragraph TITLE role stays playable content without hijacking titles', () => {
  const proj = projectTextDocumentToVirtualContentUnits(paragraphTree);
  const titleCard = proj.cards[0];
  assert.equal(titleCard.blockId, 'TEXT_000002');
  assert.equal(titleCard.cardType, 'paragraph');
  assert.equal(titleCard.paragraphRole, TEXT_PARAGRAPH_CARD_ROLES.TITLE);
  assert.equal(proj.documentTitle, 'Paragraph Study Workspace');
  assert.equal(titleCard.title, 'Card Title Slot (Untouched)');
  assert.equal(titleCard.units.length, 1);
  assert.equal(titleCard.units[0].paragraphRole, TEXT_PARAGRAPH_CARD_ROLES.TITLE);
  assert.equal(titleCard.units[0].segments[0].text, 'Chapter One: Morning Coffee');
  assert.equal(titleCard.units[0].segments[0].meaning, 'Bab Satu: Kopi Pagi');
  assert.equal(titleCard.units[0].segments[0].audioVariants.length, 1);
  assert.equal(titleCard.units[0].segments[0].metadata.audioVoiceOverrideV1.text.voiceId, 'en-US-AriaNeural');
  assert.equal(
    titleCard.fullAudioArtifacts.text.fullArtifactFingerprint,
    'full-sha256-title-en-01'
  );
  const playable = flattenVirtualContentUnitProjection(proj, { playableOnly: true });
  assert.equal(playable[0].segmentId, 'SEGMENT_000002');
  assert.equal(playable[0].paragraphRole, TEXT_PARAGRAPH_CARD_ROLES.TITLE);
  return 'paragraphRoleV1:title playable + full/segment audio metadata preserved';
});

// Test 04: Conversation Amelia->Ben->Amelia (3 turns / 2 IDs) & Amelia->Amelia (2 turns, no merge)
runCheck('04. Conversation Turns: Amelia->Ben->Amelia (3/2) & Amelia->Amelia (2, no merge)', () => {
  const proj = projectTextDocumentToVirtualContentUnits(conversationTree);
  const card1 = proj.cards[0];
  assert.equal(card1.blockId, 'TEXT_000005');
  assert.equal(card1.units.length, 3);
  assert.deepEqual(
    card1.units.map(u => u.virtualUnitKey),
    [
      buildVirtualTurnUnitKey('TEXT_000005', 'SEGMENT_000006'),
      buildVirtualTurnUnitKey('TEXT_000005', 'SEGMENT_000007'),
      buildVirtualTurnUnitKey('TEXT_000005', 'SEGMENT_000008')
    ]
  );
  assert.equal(new Set(card1.units.map(u => u.virtualUnitKey)).size, 3);
  assert.deepEqual(
    card1.units.map(u => u.speakerId),
    ['SPK_AMELIA01', 'SPK_BEN00001', 'SPK_AMELIA01']
  );

  const card2 = proj.cards[1];
  assert.equal(card2.units[0].speakerId, 'SPK_AMELIA01');
  assert.equal(card2.units[1].speakerId, 'SPK_AMELIA01');
  assert.notEqual(card2.units[0].virtualUnitKey, card2.units[1].virtualUnitKey);
  assert.equal(card2.units[0].segments.length, 1);
  assert.equal(card2.units[1].segments.length, 1);
  return '3 distinct turns (2 SPK IDs); adjacent same-speaker turns not merged';
});

// Test 05: Missing speakerId, duplicate text, repeated speaker label with distinct stable IDs
runCheck('05. Missing speakerId, duplicate text, & distinct IDs for same label', () => {
  const proj = projectTextDocumentToVirtualContentUnits(conversationTree);
  const card2 = proj.cards[1];
  const [, , missingIdUnit, alex1Unit, alex2Unit] = card2.units;

  // SEGMENT_000011 has label "Amelia" (matches registry label) but missing speakerIdentityV1: must stay null
  assert.equal(missingIdUnit.segmentId, 'SEGMENT_000011');
  assert.equal(missingIdUnit.speakerLabel, 'Amelia');
  assert.equal(missingIdUnit.speakerId, null);
  assert.equal(missingIdUnit.speakerRegistryEntry, null);

  // SEGMENT_000011 and SEGMENT_000012 have identical text "Thank you!": must keep distinct turns & keys
  assert.equal(missingIdUnit.segments[0].text, 'Thank you!');
  assert.equal(alex1Unit.segments[0].text, 'Thank you!');
  assert.notEqual(missingIdUnit.virtualUnitKey, alex1Unit.virtualUnitKey);

  // SEGMENT_000012 & SEGMENT_000013 share textual label "Alex" with distinct stable IDs SPK_ALEX_01 / SPK_ALEX_02
  assert.equal(alex1Unit.speakerLabel, 'Alex');
  assert.equal(alex2Unit.speakerLabel, 'Alex');
  assert.equal(alex1Unit.speakerId, 'SPK_ALEX_01');
  assert.equal(alex2Unit.speakerId, 'SPK_ALEX_02');
  assert.equal(alex1Unit.speakerRegistryEntry.uid, 'SPKUID_00000000-0000-4000-8000-000000000003');
  assert.equal(alex2Unit.speakerRegistryEntry.uid, 'SPKUID_00000000-0000-4000-8000-000000000004');
  return 'no label->ID lookup, no identity collapse, no text deduplication';
});

// Test 06: Multiple Conversation cards & Structured Mixed per-Card boundaries
runCheck('06. Multi-Conversation cards & Structured Mixed per-Card boundaries', () => {
  const convProj = projectTextDocumentToVirtualContentUnits(conversationTree);
  assert.equal(convProj.cards.length, 3);
  assert.equal(convProj.cards[0].unitCount, 3);
  assert.equal(convProj.cards[1].unitCount, 5);
  assert.equal(convProj.cards[2].unitCount, 0);

  const mixedProj = projectTextDocumentToVirtualContentUnits(mixedTree);
  assert.equal(mixedProj.workspaceType, TEXT_WORKSPACE_TYPES.MIXED);
  assert.equal(mixedProj.cards.length, 3);
  assert.equal(mixedProj.cards[0].cardType, 'paragraph');
  assert.equal(mixedProj.cards[0].units[0].unitKind, TEXT_VIRTUAL_CONTENT_UNIT_KINDS.PARAGRAPH);
  assert.equal(mixedProj.cards[0].units[0].paragraphRole, TEXT_PARAGRAPH_CARD_ROLES.TITLE);
  assert.equal(mixedProj.cards[1].cardType, 'conversation');
  assert.equal(mixedProj.cards[1].units[0].unitKind, TEXT_VIRTUAL_CONTENT_UNIT_KINDS.TURN);
  assert.equal(mixedProj.cards[1].units[0].speakerId, 'SPK_AMELIA01');
  assert.equal(mixedProj.cards[2].cardType, 'paragraph');
  assert.equal(mixedProj.cards[2].units[0].unitKind, TEXT_VIRTUAL_CONTENT_UNIT_KINDS.PARAGRAPH);

  // Confirm each Card contains homogeneous unitKind (zero intra-Card interleaving)
  mixedProj.cards.forEach(card => {
    const kinds = new Set(card.units.map(u => u.unitKind));
    assert.ok(kinds.size <= 1, `Card ${card.cardId} must have at most one unitKind in D2`);
  });
  return '3 Mixed cards mapped cleanly per Card blockType without intra-Card mixing';
});

// Test 07: Empty Paragraph Card = 1 empty Paragraph; Empty Conversation Card = 0 Turns
runCheck('07. Empty Paragraph Card (1 empty unit) vs Empty Conversation Card (0 units)', () => {
  const pProj = projectTextDocumentToVirtualContentUnits(paragraphTree);
  const emptyParaCard = pProj.cards[2];
  assert.equal(emptyParaCard.blockId, 'TEXT_000004');
  assert.equal(emptyParaCard.segmentCount, 0);
  assert.equal(emptyParaCard.unitCount, 1);
  assert.equal(emptyParaCard.units.length, 1);
  assert.equal(emptyParaCard.units[0].unitKind, TEXT_VIRTUAL_CONTENT_UNIT_KINDS.PARAGRAPH);
  assert.equal(emptyParaCard.units[0].empty, true);
  assert.deepEqual(emptyParaCard.units[0].segments, []);

  const cProj = projectTextDocumentToVirtualContentUnits(conversationTree);
  const emptyConvCard = cProj.cards[2];
  assert.equal(emptyConvCard.blockId, 'TEXT_000007');
  assert.equal(emptyConvCard.segmentCount, 0);
  assert.equal(emptyConvCard.unitCount, 0);
  assert.deepEqual(emptyConvCard.units, []);
  return 'empty paragraph=1 empty unit; empty conversation=0 units; 0 synthetic segments';
});

// Test 08: Flattened sequence & From-Here slices match existing playback traversal for every Segment
runCheck('08. Flattened traversal & From-Here slice exact equivalence across modes', () => {
  const trees = [
    ['paragraph', paragraphTree],
    ['conversation', conversationTree],
    ['mixed', mixedTree]
  ];
  let checkedSlices = 0;

  for (const [label, tree] of trees) {
    const proj = projectTextDocumentToVirtualContentUnits(tree);
    const rawBlocksFlat = tree.blocks.flatMap((block, blockIndex) => block.segments.map((segment, segmentIndex) => ({
      id: segment.id,
      order: segment.order,
      text: segment.text,
      meaning: segment.meaning,
      joinAfter: segment.joinAfter,
      speaker: segment.speaker ?? null,
      speakerId: segment.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY] ?? null,
      blockId: block.id,
      blockIndex,
      segmentIndex
    })));

    const projFlat = flattenVirtualContentUnitProjection(proj);
    assert.equal(projFlat.length, rawBlocksFlat.length, `${label}: flattened count`);
    projFlat.forEach((item, idx) => {
      const expected = rawBlocksFlat[idx];
      assert.equal(item.id, expected.id);
      assert.equal(item.order, expected.order);
      assert.equal(item.text, expected.text);
      assert.equal(item.meaning, expected.meaning);
      assert.equal(item.joinAfter, expected.joinAfter);
      assert.equal(item.speaker, expected.speaker);
      assert.equal(item.speakerId, expected.speakerId);
      assert.equal(item.blockId, expected.blockId);
      assert.equal(item.blockIndex, expected.blockIndex);
      assert.equal(item.segmentIndex, expected.segmentIndex);
    });

    const oldPlayback = resolveStructuredTextPlaybackList(tree);
    const projPlayable = flattenVirtualContentUnitProjection(proj, { playableOnly: true });
    assert.deepEqual(
      projPlayable.map(item => ({
        id: item.id,
        segmentId: item.segmentId,
        blockId: item.blockId,
        blockType: item.blockType,
        paragraphRole: item.paragraphRole,
        speaker: item.speaker,
        text: item.normalizedText,
        meaning: item.normalizedMeaning,
        displayId: item.displayId,
        blockIndex: item.blockIndex,
        segmentIndex: item.segmentIndex,
        blockSegmentCount: item.blockSegmentCount
      })),
      oldPlayback.map(item => ({
        id: item.id,
        segmentId: item.segmentId,
        blockId: item.blockId,
        blockType: item.blockType,
        paragraphRole: item.paragraphRole,
        speaker: item.speaker,
        text: item.text,
        meaning: item.meaning,
        displayId: item.displayId,
        blockIndex: item.blockIndex,
        segmentIndex: item.segmentIndex,
        blockSegmentCount: item.blockSegmentCount
      })),
      `${label}: old vs virtual flat playable list`
    );

    for (const seg of rawBlocksFlat) {
      const oldFromHere = resolveStructuredTextPlaybackScopeList({
        documentTree: tree,
        startSegmentId: seg.id,
        scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE
      });
      const projFromHere = sliceVirtualContentUnitProjectionFromHere(proj, { startSegmentId: seg.id });
      assert.equal(projFromHere.startIndex, oldFromHere.startIndex, `${label} start ${seg.id}`);
      assert.deepEqual(
        projFromHere.playbackList.map(i => `${i.blockId}:${i.segmentId}:${i.speaker}:${i.normalizedText}:${i.normalizedMeaning}:${i.displayId}`),
        oldFromHere.playbackList.map(i => `${i.blockId}:${i.segmentId}:${i.speaker}:${i.text}:${i.meaning}:${i.displayId}`),
        `${label} From-Here sequence from ${seg.id}`
      );
      checkedSlices += 1;
    }
  }
  return `${checkedSlices} From-Here slices + flat traversals identical`;
});

// Test 09: structuredClone snapshot equality, Object.freeze immutability, referential safety, repeatability
runCheck('09. structuredClone equality, deepFreeze immutability & deterministic repeat calls', () => {
  assert.equal(typeof structuredClone, 'function');
  const frozenConv = deepFreeze(structuredClone(conversationTree));
  const frozenPara = deepFreeze(structuredClone(paragraphTree));
  const frozenMixed = deepFreeze(structuredClone(mixedTree));
  const beforeConv = structuredClone(conversationTree);
  const beforePara = structuredClone(paragraphTree);
  const beforeMixed = structuredClone(mixedTree);

  const call1Conv = projectTextDocumentToVirtualContentUnits(frozenConv);
  const call2Conv = projectTextDocumentToVirtualContentUnits(frozenConv);
  const call1Para = projectTextDocumentToVirtualContentUnits(frozenPara);
  const call2Para = projectTextDocumentToVirtualContentUnits(frozenPara);
  const call1Mixed = projectTextDocumentToVirtualContentUnits(frozenMixed);
  const call2Mixed = projectTextDocumentToVirtualContentUnits(frozenMixed);

  assert.notEqual(call1Conv, call2Conv);
  assert.notEqual(call1Conv.cards, call2Conv.cards);
  assert.notEqual(call1Conv.cards[0].units, frozenConv.blocks[0].segments);
  assert.equal(call1Conv.cards[0].units[0].segments[0], frozenConv.blocks[0].segments[0]);

  assert.deepEqual(call1Conv, call2Conv);
  assert.deepEqual(call1Para, call2Para);
  assert.deepEqual(call1Mixed, call2Mixed);
  assert.equal(canonicalJson(call1Conv), canonicalJson(call2Conv));

  // Before/after deep snapshot check on unfrozen originals too
  const mutableConv = structuredClone(beforeConv);
  projectTextDocumentToVirtualContentUnits(mutableConv);
  assert.deepEqual(mutableConv, beforeConv);
  assert.equal(canonicalJson(frozenConv), canonicalJson(beforeConv));
  assert.equal(canonicalJson(frozenPara), canonicalJson(beforePara));
  assert.equal(canonicalJson(frozenMixed), canonicalJson(beforeMixed));
  return 'deepFreeze zero throws; structuredClone + canonicalJson 100% equal across repeats';
});

// Test 10: Counters, UIDs, speakerRegistryV1, audioVariants, fullAudioArtifactsV1 & zero UNIT_/UNITUID_
runCheck('10. Counters, UIDs, speakerRegistry, audioVariants & zero UNIT_/UNITUID_ allocation', () => {
  const beforeSnapshot = structuredClone(snapshot);
  const trees = [legacyTree, paragraphTree, conversationTree, mixedTree];
  trees.forEach(tree => {
    const proj = projectTextDocumentToVirtualContentUnits(tree);
    const unitPrefixHits = scanForForbiddenIdAllocations(proj);
    assert.deepEqual(unitPrefixHits, [], 'Adapter must never emit UNIT_ or UNITUID_ strings');
    proj.virtualKeys.forEach(k => assert.ok(k.startsWith(TEXT_VIRTUAL_KEY_PREFIX)));
    proj.cards.forEach(card => {
      card.units.forEach(unit => {
        assert.equal(unit.unitId, null);
        assert.equal(unit.unitUid, null);
      });
    });
  });

  // Verify snapshot counters and audioVariants untouched
  assert.deepEqual(snapshot.counters, beforeSnapshot.counters);
  assert.deepEqual(snapshot.audioVariants, beforeSnapshot.audioVariants);

  const convProj = projectTextDocumentToVirtualContentUnits(conversationTree);
  assert.equal(convProj.speakerRegistry.length, 4);
  assert.deepEqual(
    convProj.speakerRegistry,
    conversationTree.metadata[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]
  );
  assert.equal(convProj.cards[0].units[0].segments[0].uid, 'SEGUID_000006');
  assert.equal(convProj.cards[0].units[0].segments[0].audioVariants.length, 2);
  assert.equal(
    convProj.cards[0].units[0].segments[0].audioVariants[0].metadata.stagingKey,
    'staging/text/SEGMENT_000006/text_edge.mp3'
  );
  return 'counters, UIDs, registry, audioVariants intact; 0 UNIT_/UNITUID_ allocations';
});

// Test 11: Split render descriptor/fingerprint & Paragraph Full representation/fingerprint equality
runCheck('11. Split render fingerprint & Paragraph Full representation/identity parity (no Staging MP3 claim)', () => {
  // Split render comparison across Paragraph & Conversation segments before/after projection
  const paraBeforeSeg = paragraphTree.blocks[1].segments[0];
  const convBeforeSeg = conversationTree.blocks[0].segments[0];
  const beforeSplitParaEn = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: paraBeforeSeg.text,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });
  const beforeSplitConvId = buildTextStructuredAudioRenderFingerprint({
    channel: 'meaning',
    content: convBeforeSeg.meaning,
    language: 'id',
    engine: 'edge',
    voiceId: 'id-ID-GadisNeural',
    rate: 10,
    pitch: 0
  });

  // Paragraph Full representation & identity before projection
  const origBodyBlock = paragraphTree.blocks[1];
  const beforeFullEnRep = buildTextStructuredFullRepresentation({ block: origBodyBlock, channel: 'text' });
  const beforeFullIdRep = buildTextStructuredFullRepresentation({ block: origBodyBlock, channel: 'meaning' });
  const beforeFullEnIdentity = buildTextStructuredFullArtifactIdentity({
    block: origBodyBlock,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });

  const pProj = projectTextDocumentToVirtualContentUnits(paragraphTree);
  const cProj = projectTextDocumentToVirtualContentUnits(conversationTree);
  const paraAfterSeg = pProj.cards[1].units[0].segments[0];
  const convAfterSeg = cProj.cards[0].units[0].segments[0];

  const afterSplitParaEn = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: paraAfterSeg.text,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });
  const afterSplitConvId = buildTextStructuredAudioRenderFingerprint({
    channel: 'meaning',
    content: convAfterSeg.meaning,
    language: 'id',
    engine: 'edge',
    voiceId: 'id-ID-GadisNeural',
    rate: 10,
    pitch: 0
  });
  assert.deepEqual(afterSplitParaEn, beforeSplitParaEn);
  assert.deepEqual(afterSplitConvId, beforeSplitConvId);
  assert.deepEqual(
    buildTextStructuredAudioRenderDescriptor({
      channel: 'text',
      content: paraAfterSeg.text,
      language: 'en',
      engine: 'edge',
      voiceId: 'en-US-AriaNeural'
    }),
    buildTextStructuredAudioRenderDescriptor({
      channel: 'text',
      content: paraBeforeSeg.text,
      language: 'en',
      engine: 'edge',
      voiceId: 'en-US-AriaNeural'
    })
  );

  // Reconstruct block-like shape from virtual Paragraph unit to confirm Segment refs/order/joinAfter match
  const projectedBodyBlockView = {
    id: pProj.cards[1].blockId,
    segments: pProj.cards[1].units[0].segments
  };
  const afterFullEnRep = buildTextStructuredFullRepresentation({ block: projectedBodyBlockView, channel: 'text' });
  const afterFullIdRep = buildTextStructuredFullRepresentation({ block: projectedBodyBlockView, channel: 'meaning' });
  const afterFullEnIdentity = buildTextStructuredFullArtifactIdentity({
    block: projectedBodyBlockView,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });

  assert.deepEqual(afterFullEnRep, beforeFullEnRep);
  assert.deepEqual(afterFullIdRep, beforeFullIdRep);
  assert.deepEqual(afterFullEnIdentity, beforeFullEnIdentity);
  assert.equal(afterFullEnRep.segmentCount, 3);
  assert.ok(afterFullEnRep.content.includes('wooden counter.Today feels peaceful.')); // verifies joinAfter:'none' preserved on seg 4!
  return 'Split & Full metadata/fingerprints identical (Staging MP3 blobs not verified in D2)';
});

// Test 12: Malformed input handling & strict zero-side-effect purity checks
runCheck('12. Malformed input error policy + static & runtime zero-side-effect purity', () => {
  const expectAdapterError = (input, expectedCode) => {
    const frozenInput = input && typeof input === 'object' ? deepFreeze(structuredClone(input)) : input;
    const before = input && typeof input === 'object' ? structuredClone(input) : input;
    const validation = validateTextDocumentTreeForVirtualContentUnits(frozenInput);
    assert.equal(validation.valid, false, `Expected invalid diagnostic for ${expectedCode}`);
    assert.ok(validation.diagnostics.some(d => d.code === expectedCode), `Expected code ${expectedCode}`);
    assert.throws(
      () => projectTextDocumentToVirtualContentUnits(frozenInput),
      err => err instanceof TextContentUnitAdapterError && err.code === expectedCode,
      `Expected TextContentUnitAdapterError(${expectedCode})`
    );
    if (input && typeof input === 'object') {
      assert.deepEqual(frozenInput, before);
    }
  };

  // Null & missing root properties
  expectAdapterError(null, 'INVALID_DOCUMENT_TREE');
  expectAdapterError({ editorModel: 'structured-v1', documentType: 'paragraph', blocks: [] }, 'MISSING_DOCUMENT_ID');
  expectAdapterError({ id: 'DOC_X', documentType: 'paragraph', blocks: [] }, 'MISSING_EDITOR_MODEL');

  // Unknown non-legacy editorModel returns explicit unsupported state cleanly
  const unknownEditorProj = projectTextDocumentToVirtualContentUnits({
    id: 'DOC_UNK',
    editorModel: 'experimental-v9',
    documentType: 'paragraph',
    blocks: []
  });
  assert.equal(unknownEditorProj.supported, false);
  assert.equal(unknownEditorProj.status, TEXT_CONTENT_UNIT_PROJECTION_STATUS.UNSUPPORTED_EDITOR_MODEL);
  assert.deepEqual(unknownEditorProj.cards, []);
  assert.equal(unknownEditorProj.unitCount, 0);

  // Invalid documentType
  expectAdapterError({ id: 'DOC_X', editorModel: 'structured-v1', documentType: 'poem', blocks: [] }, 'INVALID_DOCUMENT_TYPE');

  // Unknown blockType
  const badBlockType = structuredClone(paragraphTree);
  badBlockType.blocks = [{
    id: 'TEXT_000099',
    documentId: 'DOC_000002',
    blockType: 'table',
    order: 1,
    segments: []
  }];
  expectAdapterError(badBlockType, 'UNKNOWN_BLOCK_TYPE');

  // DocumentType vs BlockType mismatch
  const typeMismatch = structuredClone(paragraphTree);
  typeMismatch.blocks[0].blockType = 'conversation';
  expectAdapterError(typeMismatch, 'BLOCK_TYPE_MISMATCH');

  // Duplicate Block ID
  const dupBlock = structuredClone(paragraphTree);
  dupBlock.blocks[1].id = dupBlock.blocks[0].id;
  dupBlock.blocks[1].segments.forEach(s => { s.blockId = dupBlock.blocks[0].id; });
  expectAdapterError(dupBlock, 'DUPLICATE_BLOCK_ID');

  // Document-wide Duplicate Segment ID
  const dupSeg = structuredClone(conversationTree);
  dupSeg.blocks[1].segments[0].id = dupSeg.blocks[0].segments[0].id;
  expectAdapterError(dupSeg, 'DUPLICATE_SEGMENT_ID');

  // Missing Block/Segment IDs
  const missingBlockId = structuredClone(paragraphTree);
  missingBlockId.blocks[0].id = '';
  expectAdapterError(missingBlockId, 'MISSING_BLOCK_ID');
  const missingSegId = structuredClone(paragraphTree);
  missingSegId.blocks[0].segments[0].id = '   ';
  expectAdapterError(missingSegId, 'MISSING_SEGMENT_ID');

  // Wrong parent documentId / blockId
  const wrongBlockParent = structuredClone(paragraphTree);
  wrongBlockParent.blocks[0].documentId = 'DOC_999999';
  expectAdapterError(wrongBlockParent, 'BLOCK_PARENT_MISMATCH');

  const wrongSegDoc = structuredClone(paragraphTree);
  wrongSegDoc.blocks[0].segments[0].documentId = 'DOC_999999';
  expectAdapterError(wrongSegDoc, 'SEGMENT_DOCUMENT_MISMATCH');

  const wrongSegBlock = structuredClone(paragraphTree);
  wrongSegBlock.blocks[0].segments[0].blockId = 'TEXT_999999';
  expectAdapterError(wrongSegBlock, 'SEGMENT_BLOCK_MISMATCH');

  // Unsorted precondition rejection (must not silently rewrite order!)
  const unsortedBlocks = structuredClone(paragraphTree);
  unsortedBlocks.blocks = [unsortedBlocks.blocks[1], unsortedBlocks.blocks[0]];
  expectAdapterError(unsortedBlocks, 'UNSORTED_BLOCKS');

  const unsortedSegs = structuredClone(paragraphTree);
  unsortedSegs.blocks[1].segments = [unsortedSegs.blocks[1].segments[1], unsortedSegs.blocks[1].segments[0]];
  expectAdapterError(unsortedSegs, 'UNSORTED_SEGMENTS');

  // Runtime determinism spy: ensure adapter makes 0 calls to Date.now or Math.random
  const origDateNow = Date.now;
  const origMathRandom = Math.random;
  let dateNowCalls = 0;
  let mathRandomCalls = 0;
  Date.now = () => { dateNowCalls += 1; return origDateNow(); };
  Math.random = () => { mathRandomCalls += 1; return origMathRandom(); };
  try {
    projectTextDocumentToVirtualContentUnits(legacyTree);
    projectTextDocumentToVirtualContentUnits(paragraphTree);
    const convP = projectTextDocumentToVirtualContentUnits(conversationTree);
    projectTextDocumentToVirtualContentUnits(mixedTree);
    flattenVirtualContentUnitProjection(convP);
    sliceVirtualContentUnitProjectionFromHere(convP, { startSegmentId: 'SEGMENT_000008' });
  } finally {
    Date.now = origDateNow;
    Math.random = origMathRandom;
  }
  assert.equal(dateNowCalls, 0);
  assert.equal(mathRandomCalls, 0);

  // Static purity audit on adapter source code
  const adapterSourcePath = path.join(rootDir, 'src', 'domain', 'text', 'textContentUnitAdapterDomain.js');
  const adapterSource = fs.readFileSync(adapterSourcePath, 'utf8');
  const forbiddenPatterns = [
    /\bindexedDB\b/i,
    /\blocalStorage\b/i,
    /\bsessionStorage\b/i,
    /\bDate\.now\b/,
    /\bMath\.random\b/,
    /\brandomUUID\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bFileReader\b/,
    /\bcreateTextGlobalUid\b/,
    /\bderiveTextStructuredSpeakerId\b/,
    /\bapplyTextLibraryCommand\b/,
    /audioStaging/i,
    /textLibraryIndexedDb/i,
    /jszip/i
  ];
  forbiddenPatterns.forEach(pattern => {
    assert.equal(pattern.test(adapterSource), false, `Forbidden reference ${pattern} found in adapter domain`);
  });

  return '14 malformed error cases + runtime Date.now/Math.random=0 + static IO purity verified';
});

console.log('');
console.log(`P12D_D2_AUDIT_SUMMARY: PASS: ${passCount}, FAIL: ${failCount} (Total: ${passCount + failCount})`);
if (failCount > 0) {
  process.exitCode = 1;
}
