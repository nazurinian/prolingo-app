import React from 'react';

const SOURCE_STYLES = {
  edge: 'bg-teal-400 ring-teal-100 dark:ring-teal-900/60',
  gemini: 'bg-violet-500 ring-violet-100 dark:ring-violet-900/60',
  local: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-900/60'
};

const SOURCE_LABELS = {
  edge: 'Edge TTS audio loaded',
  gemini: 'Gemini audio loaded',
  local: 'Local / Audio Folder audio loaded'
};

export default function AudioSourceDot({ source, className = '' }) {
  if (!source || !SOURCE_STYLES[source]) return null;
  return (
    <span
      aria-label={SOURCE_LABELS[source]}
      title={SOURCE_LABELS[source]}
      className={`pointer-events-none absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ${SOURCE_STYLES[source]} ${className}`}
    />
  );
}
