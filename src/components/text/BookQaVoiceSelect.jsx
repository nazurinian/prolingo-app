import { useState } from 'react';
import { isEdgeVoiceUnavailable } from '../../constants/voiceConstants.js';

export function BookQaVoiceSelect({ name, label, saved, catalog = [], className, edge = false, inheritLabel = 'Inherit session voice' }) {
  const [value, setValue] = useState(saved ?? '');
  const choices = edge
    ? catalog.filter(voice => !isEdgeVoiceUnavailable(voice, catalog)).map(voice => [voice.id, voice.label])
    : catalog.map(voice => [voice.name, voice.name]);
  const names = new Map(choices);
  const unavailable = value && !names.has(value);
  return <label className="min-w-0">{label}
    <select className={className} name={name} value={value} onChange={event => setValue(event.target.value)}>
      <option value="">{inheritLabel}</option>
      {unavailable && <option value={value}>{value} ({value === saved ? 'saved, ' : ''}unavailable in catalog)</option>}
      {[...names].map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  </label>;
}
