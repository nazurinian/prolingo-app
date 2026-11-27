import { resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import { getTextStructuredSpeakerRegistry } from './textStructuredSpeakerIdentityDomain.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { updateBookBodyProfileMetadata } from './bookQaBodyAudioDomain.js';

export const BOOK_MAIN_TITLE_KEY = 'bookMainTitleV1';
export const BOOK_CARD_HEADING_KEY = 'bookHeadingV1';

export class TextBookAuthoringError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TextBookAuthoringError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new TextBookAuthoringError(code, message); };
const clean = value => typeof value === 'string' ? value.trim() : '';
const has = (record, key) => Object.hasOwn(record ?? {}, key);
const fields = (value, allowed) => value && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).every(key => allowed.includes(key));
const translation = (input, previous, code) => {
  if (!has(input, 'id')) return clean(previous?.id);
  if (input.id !== null && typeof input.id !== 'string') fail(code, 'Indonesian content must be text or empty');
  return clean(input.id);
};

export const validateBookMainTitle = (input, workspaceName, previous) => {
  const code = 'BOOK_MAIN_TITLE_INVALID';
  if (!fields(input, ['mode', 'en', 'id']) || !['workspace-name', 'custom'].includes(input.mode)
    || (input.mode === 'workspace-name' && has(input, 'en'))) {
    fail(code, 'Use Workspace Name or provide a custom Main Title');
  }
  const en = input.mode === 'custom' ? clean(input.en) : clean(workspaceName);
  if (!en) fail(code, 'Resolved Main Title EN must be nonblank');
  const id = translation(input, previous, code);
  return { mode: input.mode, ...(input.mode === 'custom' ? { en } : {}), ...(id ? { id } : {}) };
};

export const resolveBookMainTitle = workspace => {
  const metadata = workspace?.metadata;
  const name = clean(workspace?.title);
  const raw = metadata?.[BOOK_MAIN_TITLE_KEY];
  if (!has(metadata, BOOK_MAIN_TITLE_KEY)) {
    return { saved: false, en: name, id: '', mode: 'workspace-name', diagnostic: 'BOOK_MAIN_TITLE_REQUIRED' };
  }
  try {
    const title = validateBookMainTitle(raw, name);
    return { saved: true, en: title.en ?? name, id: title.id ?? '', mode: title.mode, diagnostic: null };
  } catch (error) {
    if (!(error instanceof TextBookAuthoringError)) throw error;
    return { saved: false, en: name, id: clean(raw?.id), mode: 'workspace-name', diagnostic: error.code };
  }
};

export const validateBookCardHeading = (input, previous) => {
  const code = 'BOOK_CARD_HEADING_INVALID';
  if (!fields(input, ['en', 'id']) || (has(input, 'en') && typeof input.en !== 'string')) {
    fail(code, 'Card Heading EN must be text');
  }
  const en = clean(has(input, 'en') ? input.en : previous?.en);
  const id = translation(input, previous, code);
  if (!en && id) fail(code, 'An Indonesian Card Heading requires an English Heading');
  return { en, id };
};

export const resolveBookCardHeading = block => {
  const raw = block?.metadata?.[BOOK_CARD_HEADING_KEY];
  const en = clean(block?.title);
  const id = clean(raw?.id);
  const diagnostic = has(block?.metadata, BOOK_CARD_HEADING_KEY)
    && (!fields(raw, ['id']) || (has(raw, 'id') && typeof raw.id !== 'string') || (!en && id))
    ? 'BOOK_CARD_HEADING_INVALID' : null;
  return { en, id, diagnostic };
};

export const projectBookHeadings = (workspace, visibility) => {
  const title = resolveBookMainTitle(workspace);
  const ordinals = { paragraph: 0, conversation: 0 };
  const cards = {};
  for (const block of workspace?.blocks ?? []) {
    if (!has(ordinals, block.blockType) || resolveTextParagraphCardRole(block) === 'title') continue;
    const label = block.blockType === 'paragraph' ? 'Paragraph' : 'Scene';
    const ordinal = ++ordinals[block.blockType];
    cards[block.id] = { ...resolveBookCardHeading(block), fallback: label + ' ' + ordinal,
      visible: (block.blockType === 'paragraph' ? visibility?.paragraph : visibility?.scene) !== false };
  }
  return { hasSavedMainTitle: title.saved, mainTitle: title.saved && visibility?.mainTitle !== false ? title : null, cards };
};

export const getBookAuthoringField = type => {
  if (['document.create', 'document.update'].includes(type)) return 'mainTitle';
  if (['block.create', 'block.update'].includes(type)) return 'heading';
  return null;
};

const protectedMetadata = (snapshot, type, payload) => {
  if (payload.metadata === undefined) return payload;
  const stores = { collection: 'collections', document: 'documents', block: 'blocks', contentUnit: 'contentUnits', segment: 'segments' };
  const store = stores[type.split('.')[0]];
  const previous = type.endsWith('.update') ? snapshot[store]?.find(record => record.id === payload.id)?.metadata : null;
  const before = Object.keys(previous ?? {}).filter(key => key !== 'note').sort();
  const after = Object.keys(payload.metadata).filter(key => key !== 'note').sort();
  if (before.length !== after.length || before.some((key, i) => key !== after[i])) {
    fail('PROTECTED_METADATA', 'Only metadata.note may change');
  }
  const metadata = { ...previous };
  if (has(payload.metadata, 'note')) metadata.note = payload.metadata.note;
  else delete metadata.note;
  return { ...payload, metadata };
};

/** Runs after the ordinary command's scope and protected-metadata checks. */
export const prepareBookAuthoringCommand = (snapshot, scoped, workspaceId, authoringFields) => {
  const { type } = scoped;
  const payload = protectedMetadata(snapshot, type, scoped.payload);
  const workspace = snapshot.documents.find(record => record.id === workspaceId);
  const makeCommand = changes => ({ type, payload: { ...payload, ...changes } });
  const unchanged = payload === scoped.payload ? scoped : { type, payload };
  if (type === 'document.create' || type === 'document.update') {
    const creating = type === 'document.create';
    if (!creating && has(authoringFields, 'bodyAudioProfile')) {
      return makeCommand({ metadata: updateBookBodyProfileMetadata(workspace, authoringFields.bodyAudioProfile) });
    }
    const title = clean(creating || has(payload, 'title') ? payload.title : workspace.title);
    if (!title) fail('BOOK_WORKSPACE_NAME_REQUIRED', 'Workspace Name must be nonblank');
    if (creating && !['paragraph', 'conversation', 'mixed'].includes(payload.documentType)) {
      fail('BOOK_WORKSPACE_TYPE_REQUIRED', 'Choose Paragraph, Conversation or Mixed');
    }
    const metadata = { ...(payload.metadata ?? (creating ? null : workspace.metadata)) };
    if (creating || has(authoringFields, 'mainTitle')) {
      const input = has(authoringFields, 'mainTitle') ? authoringFields.mainTitle : { mode: 'workspace-name' };
      metadata[BOOK_MAIN_TITLE_KEY] = validateBookMainTitle(input, title, metadata[BOOK_MAIN_TITLE_KEY]);
      return makeCommand({ title, metadata });
    }
    if (has(metadata, BOOK_MAIN_TITLE_KEY)) validateBookMainTitle(metadata[BOOK_MAIN_TITLE_KEY], title);
    return has(payload, 'title') ? makeCommand({ title }) : unchanged;
  }

  const block = snapshot.blocks.find(record => record.id === (type.startsWith('block.') ? payload.id : payload.blockId));
  const registry = getTextStructuredSpeakerRegistry(workspace);
  if (type === 'speaker.register') {
    const label = clean(payload.label);
    if (!label) fail('BOOK_SPEAKER_LABEL_REQUIRED', 'Enter a nonblank Speaker label');
    const sameLabel = registry.find(speaker => normalizeTextStructuredSpeakerKey(speaker.label) === normalizeTextStructuredSpeakerKey(label));
    const sameId = registry.find(speaker => speaker.id === payload.speakerId);
    if ((sameId && sameId !== sameLabel) || (sameLabel && payload.speakerId && sameLabel.id !== payload.speakerId)) {
      fail('BOOK_SPEAKER_IDENTITY_CONFLICT', 'Registration must preserve the existing Speaker identity and label');
    }
    return makeCommand({ label: sameLabel?.label ?? label });
  }
  if (type === 'block.create') {
    const title = resolveBookMainTitle(workspace);
    if (!title.saved) fail(title.diagnostic, 'Save a valid Main Title before creating Body Cards');
    if (payload.blockType === 'conversation' && registry.length < 2) {
      fail('BOOK_SPEAKER_THRESHOLD', 'Register at least two distinct Workspace Speakers before creating a Scene');
    }
  }
  if (type === 'block.create' || (type === 'block.update' && (has(payload, 'title') || has(authoringFields, 'heading')))) {
    if (resolveTextParagraphCardRole(block) === 'title') {
      fail('BOOK_LEGACY_TITLE_PROTECTED', 'Historical Title Cards are preserved for compatibility');
    }
    const metadata = { ...(payload.metadata ?? block?.metadata) };
    const heading = has(authoringFields, 'heading') ? authoringFields.heading : {};
    if (has(payload, 'title') && has(heading, 'en')) fail('BOOK_CARD_HEADING_INVALID', 'Provide one Card Heading EN');
    const previous = { en: has(payload, 'title') ? payload.title : block?.title, id: metadata[BOOK_CARD_HEADING_KEY]?.id };
    if (has(payload, 'title') && typeof payload.title !== 'string') fail('BOOK_CARD_HEADING_INVALID', 'Card Heading EN must be text');
    const { en, id } = validateBookCardHeading(heading, previous);
    if (id) metadata[BOOK_CARD_HEADING_KEY] = { id };
    else delete metadata[BOOK_CARD_HEADING_KEY];
    return makeCommand({ title: en, metadata });
  }

  const unit = ['contentUnit.split', 'contentUnit.update'].includes(type)
    ? snapshot.contentUnits.find(record => record.id === payload.id) : null;
  const requireSpeaker = (type === 'contentUnit.create' && block?.blockType === 'conversation')
    || (unit?.kind === 'turn' && (type === 'contentUnit.split' || ['speaker', 'speakerId', 'resetSpeaker'].some(key => has(payload, key))));
  if (requireSpeaker) {
    const speakerId = type === 'contentUnit.split' ? unit.speakerId : payload.speakerId;
    if (payload.resetSpeaker === true || !registry.some(speaker => speaker.id === speakerId)) {
      fail('BOOK_TURN_SPEAKER_REQUIRED', 'Choose a registered Workspace Speaker for this Turn');
    }
  }
  if (type === 'speaker.remove' && registry.some(speaker => speaker.id === payload.speakerId)
    && registry.length <= 2 && snapshot.blocks.some(record => record.documentId === workspaceId && record.blockType === 'conversation')) {
    fail('BOOK_SPEAKER_THRESHOLD', 'A Workspace with a Scene must retain two distinct Speakers');
  }
  return unchanged;
};
