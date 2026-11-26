/**
 * Shared Presentation Design Tokens & UI Terminology Registry (UAT-4 Packet I / 4G-A).
 *
 * View-only presentation constants used across the Reading Shell, Reading Settings,
 * Playback Settings, Audio & Voices, and Card Audio Settings surfaces.
 *
 * Never binds to persistence keys, database schemas, or playback engine state.
 */

export const SHARED_SEMANTIC_COLORS = Object.freeze({
  en: Object.freeze({
    hex: '#2563EB',
    text: 'text-blue-700 dark:text-blue-300',
    bgSoft: 'bg-blue-50/85 dark:bg-blue-950/45',
    border: 'border-blue-200/90 dark:border-blue-800/80',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200',
    solid: 'bg-blue-600 text-white',
    ring: 'ring-blue-500/25'
  }),
  id: Object.freeze({
    hex: '#8B5CF6',
    text: 'text-violet-700 dark:text-violet-300',
    bgSoft: 'bg-violet-50/85 dark:bg-violet-950/45',
    border: 'border-violet-200/90 dark:border-violet-800/80',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-200',
    solid: 'bg-violet-600 text-white',
    ring: 'ring-violet-500/25'
  }),
  paused: Object.freeze({
    hex: '#D97706',
    text: 'text-amber-800 dark:text-amber-200',
    bgSoft: 'bg-amber-50/85 dark:bg-amber-950/45',
    border: 'border-amber-200/90 dark:border-amber-800/80',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200',
    solid: 'bg-amber-600 text-white',
    ring: 'ring-amber-500/25'
  }),
  paragraph: Object.freeze({
    hex: '#0D9488',
    text: 'text-teal-700 dark:text-teal-300',
    bgSoft: 'bg-teal-50/85 dark:bg-teal-950/40',
    border: 'border-teal-200/90 dark:border-teal-800/80',
    badge: 'bg-teal-100/90 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200'
  }),
  conversation: Object.freeze({
    hex: '#4F46E5',
    text: 'text-indigo-700 dark:text-indigo-300',
    bgSoft: 'bg-indigo-50/85 dark:bg-indigo-950/40',
    border: 'border-indigo-200/90 dark:border-indigo-800/80',
    badge: 'bg-indigo-100/90 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200'
  }),
  manual: Object.freeze({
    hex: '#475569',
    text: 'text-slate-700 dark:text-slate-200',
    bgSoft: 'bg-slate-100/90 dark:bg-slate-800/75',
    border: 'border-slate-200/90 dark:border-slate-700/80',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  })
});

export const SHARED_SURFACE_TOKENS = Object.freeze({
  shellCard: 'rounded-2xl border border-slate-200/85 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-xs',
  panelInset: 'rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40',
  segmentedTrack: 'rounded-xl bg-slate-100/90 dark:bg-slate-800/85 p-0.5',
  segmentedTrackCompact: 'rounded-lg bg-slate-100/90 dark:bg-slate-800/85 p-0.5',
  dividerHairline: 'border-slate-200/75 dark:border-slate-800',
  mobileSheet: 'rounded-2xl border border-slate-200/95 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl'
});

export const SHARED_CONTROL_TOKENS = Object.freeze({
  focusRing: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
  segmentActivePrimary: 'bg-indigo-600 text-white shadow-xs',
  segmentActiveNeutral: 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs ring-1 ring-slate-200/80 dark:ring-slate-600/80',
  segmentInactive: 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/50',
  secondaryButton: 'rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors motion-reduce:transition-none',
  primaryButton: 'rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors motion-reduce:transition-none'
});

export const SHARED_SPACING_TOKENS = Object.freeze({
  // Ensures programmatic scrollIntoView never hides Card or Book headings behind the fixed 64px mobile header.
  mobileScrollMargin: 'scroll-mt-[72px] md:scroll-mt-4',
  // Reserves clearance for the fixed mobile Global Player bar below docked mobile drawers.
  mobileSheetBottomOffset: 'calc(76px + env(safe-area-inset-bottom, 0px))'
});

/**
 * Canonical English UI labels (Packet I §A4).
 * Always use these labels in visible UI copy; never rename internal keys or persisted values.
 */
export const SHARED_UI_TERMINOLOGY = Object.freeze({
  readerMode: 'Reader Mode',
  readingStyle: 'Reading Style',
  audioRepresentation: 'Audio Representation',
  playbackScope: 'Playback Scope',
  audioSource: 'Audio Source',
  readingSettings: 'Reading Settings',
  playbackSettings: 'Playback Settings',
  audioAndVoices: 'Audio & Voices',
  cardAudioSettings: 'Card Audio Settings'
});
