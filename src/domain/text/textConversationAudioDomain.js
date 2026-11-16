import { validateTextContentUnitsState } from './textContentUnitDomain.js';
import { resolveTextStructuredRuntimeAudio } from './textStructuredAudioRuntimeDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from './textStructuredAudioRenderFingerprintDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { resolveTextStructuredEffectiveCustomLocalVoice } from './textStructuredLocalAudioProfileDomain.js';
import { resolveTextStructuredEffectivePlaybackOrder } from './textStructuredAudioPlaybackOrderDomain.js';
import { resolveTextStructuredConversationSyncedVoiceProfile } from './textStructuredVoiceAssignmentDomain.js';
import { resolveTextStructuredEffectivePlaybackRate } from './textStructuredPlaybackRateProfileDomain.js';
import { buildTextStructuredFullRepresentation, resolveTextStructuredFullArtifactReadiness } from './textStructuredSplitFullDomain.js';

const clean = value => String(value ?? '').trim();
const byOrder = (a, b) => a.order - b.order || a.id.localeCompare(b.id);
export const isPersistentConversationAudioBlock = block => block?.blockType === 'conversation'
  && (Array.isArray(block.units) || (Array.isArray(block.segments) && block.segments.some(segment => segment.unitId)));

/** Persistent-only coordination for the existing resolver, step executor and Full artifact store. */
export const buildTextConversationAudioPlaybackPlan = ({
  documentTree, block, channel = 'text', segmentIds = null, representationMode = 'split',
  audioVariants = [], runtimeAudioUrls = {}, runtimeFullAudio = {}, preferences = null,
  fallbackVoiceId = null, fallbackEngine = 'edge', fallbackRate = 0, fallbackPitch = 0,
  globalPlaybackRate = 1, globalPlaybackOrder = null, audioSourceMode = 'local-first',
  customLocalVoiceId = null, globalTtsOnly = false, allowFullArtifact = true,
  language = null, rendererVersion, codecProfile
} = {}) => {
  if (documentTree?.editorModel !== 'structured-v1' || block?.blockType !== 'conversation' || !Array.isArray(block.units) || !Array.isArray(block.segments)
    || block.documentId !== documentTree.id) throw new Error('Conversation audio requires a hydrated persistent Scene and structured Workspace');
  const validation = validateTextContentUnitsState({ documents: [documentTree], blocks: [block], contentUnits: block.units, segments: block.segments }, { requireMigrated: true });
  if (!validation.valid) throw new Error(`Invalid Conversation audio graph: ${validation.errors.join('; ')}`);
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const mode = representationMode === 'full' ? 'full' : 'split';
  const prefs = { edgeRate: fallbackRate, edgePitch: fallbackPitch,
    ...(fallbackVoiceId ? { [normalizedChannel === 'text' ? 'edgeTextVoiceId' : 'edgeMeaningVoiceId']: fallbackVoiceId } : {}), ...(preferences || {}) };
  const ordered = [...block.units].sort(byOrder).flatMap(unit => (block.segments || []).filter(s => s.unitId === unit.id).sort(byOrder).map(segment => ({ unit, segment })));
  const allowed = segmentIds instanceof Set ? segmentIds : Array.isArray(segmentIds) ? new Set(segmentIds) : null;
  const scoped = ordered.filter(({ segment }) => !allowed || allowed.has(segment.id));
  const partial = scoped.length !== ordered.length;
  const ttsOnly = globalTtsOnly || audioSourceMode === 'tts-only';
  const entries = scoped.filter(({ segment }) => clean(segment[normalizedChannel])).map(({ unit, segment }) => {
    const content = clean(segment[normalizedChannel]);
    const download = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel: normalizedChannel, preferences: prefs });
    const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block, channel: normalizedChannel,
      globalProfiles: globalPlaybackOrder?.channels?.[normalizedChannel], fallbackProfiles: [{ voiceId: download.voiceId, engine: fallbackEngine, rate: prefs.edgeRate, pitch: prefs.edgePitch }] });
    const pin = clean(resolveTextStructuredEffectiveCustomLocalVoice({ documentTree, block, segment, channel: normalizedChannel })) || customLocalVoiceId;
    const profiles = audioSourceMode === 'custom-local' ? (pin ? [{ voiceId: pin, engine: fallbackEngine, rate: prefs.edgeRate, pitch: prefs.edgePitch }] : []) : order.profiles;
    const renders = profiles.map(profile => ({ profile, ...buildTextStructuredAudioRenderFingerprint({ channel: normalizedChannel, content,
      language: language || (normalizedChannel === 'text' ? documentTree.textLanguage : documentTree.meaningLanguage),
      voiceId: profile.voiceId, engine: profile.engine, rate: profile.rate ?? prefs.edgeRate, pitch: profile.pitch ?? prefs.edgePitch, rendererVersion, codecProfile }) }));
    const voiceProfile = resolveTextStructuredConversationSyncedVoiceProfile({ documentTree, block, segment, channel: normalizedChannel,
      defaultVoiceName: normalizedChannel === 'text' ? prefs.playbackTextVoiceName : prefs.playbackMeaningVoiceName });
    const playbackRate = resolveTextStructuredEffectivePlaybackRate({ documentTree, block, segment, channel: normalizedChannel, globalRate: globalPlaybackRate, respectConversationSync: true });
    let runtimeAudio = null;
    let selectedRender = null;
    for (const render of renders) {
      runtimeAudio = resolveTextStructuredRuntimeAudio({ audioVariants, runtimeAudioUrls, segmentId: segment.id, channel: normalizedChannel,
        preferredGeneratedProfiles: [render.profile], strictProfileOrder: true, expectedRenderFingerprint: render.renderFingerprint, content });
      if (runtimeAudio) { runtimeAudio = { ...runtimeAudio, playbackProfileRank: renders.indexOf(render) + 1 }; selectedRender = render; break; }
    }
    const variants = audioVariants.filter(v => v.segmentId === segment.id && v.channel === normalizedChannel);
    const exact = variants.find(v => renders.some(render => render.renderFingerprint === v.metadata?.audioRenderFingerprintV1));
    const status = runtimeAudio ? 'ready' : exact ? 'metadata-only' : variants.some(v => !v.metadata?.audioRenderFingerprintV1) ? 'legacy-unverified'
      : variants.some(v => profiles.some(p => p.voiceId === v.voiceId)) ? 'stale' : variants.length ? 'other-profile' : 'missing';
    return { segment, unitId: unit.id, unitUid: unit.uid, segmentId: segment.id, segmentUid: segment.uid, speakerId: unit.speakerId,
      speaker: unit.speaker, channel: normalizedChannel, content, voiceProfile, ttsVoiceName: voiceProfile.voiceName,
      playbackRate, renders, expectedRenderFingerprint: renders[0]?.renderFingerprint || null,
      renderFingerprint: selectedRender?.renderFingerprint || renders[0]?.renderFingerprint || null,
      profileRank: runtimeAudio?.playbackProfileRank || null, runtimeAudio, status };
  });
  const scopedBlock = { ...block, segments: scoped.map(item => item.segment) };
  const fullRepresentation = buildTextStructuredFullRepresentation({ block: scopedBlock, channel: normalizedChannel });
  const composition = entries.length && entries.every(e => e.expectedRenderFingerprint)
    ? entries.map(e => ({ renderFingerprint: e.expectedRenderFingerprint, playbackRate: e.playbackRate })) : null;
  const full = composition ? resolveTextStructuredFullArtifactReadiness({ block: scopedBlock, channel: normalizedChannel, composition, runtimeFullAudio }) : { status: 'missing', ready: false, expected: null };
  const fullArtifactRequirement = !partial && full.expected ? { blockId: block.id, documentId: documentTree.id,
    fullArtifactFingerprint: full.expected.fullArtifactFingerprint, descriptor: full.expected.descriptor } : null;
  const steps = entries.map(entry => ({ ...entry, type: !ttsOnly && entry.runtimeAudio ? 'split-local' : 'split-tts', representation: mode,
    runtimeAudio: ttsOnly ? null : entry.runtimeAudio,
    blockId: block.id, highlight: mode === 'split', voiceId: !ttsOnly && entry.runtimeAudio ? entry.runtimeAudio.variant.voiceId : entry.ttsVoiceName,
    ignoreSegmentVoiceOverride: false, ttsVoicePolicy: 'split-segment' }));
  const useFull = mode === 'full' && !ttsOnly && allowFullArtifact && !partial && full.ready;
  const localCount = steps.filter(step => step.type === 'split-local').length;
  const compositionInputsReady = Boolean(composition) && entries.every(e => e.runtimeAudio && e.renderFingerprint === e.expectedRenderFingerprint);
  const unitRates = Boolean(composition) && composition.every(input => input.playbackRate === 1);
  return { mode, representation: mode, channel: normalizedChannel, route: !entries.length ? 'empty' : useFull ? 'full-local' : mode === 'full' ? 'conversation-composition' : 'split',
    ttsFallbackPolicy: 'split-segment', ttsOnly: { enabled: Boolean(ttsOnly), source: 'global' }, entries,
    fullRepresentation, composition, fullReadiness: full, fullArtifactRequirement,
    compositionInputsReady, readyToCompose: !partial && compositionInputsReady && unitRates,
    compositionBlockReason: partial ? 'partial-scope' : !unitRates && composition ? 'rate-aware-assembly-required' : !compositionInputsReady ? 'inputs-not-ready' : null,
    steps: useFull ? [{ type: 'full-local', representation: 'full', blockId: block.id, channel: normalizedChannel,
      segmentId: null, content: fullRepresentation.content, highlight: false, runtimeFull: full, playbackRate: 1, ignoreSegmentVoiceOverride: false }] : steps,
    total: useFull ? 1 : steps.length, localCount: useFull ? 1 : localCount, ttsCount: useFull ? 0 : steps.length - localCount,
    completeLocal: Boolean(entries.length) && (useFull || localCount === steps.length), partialLocal: localCount > 0 && localCount < steps.length };
};
