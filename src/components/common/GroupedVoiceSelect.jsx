import React from 'react';
import { groupVoicesByRegion, formatVoiceLabel } from '../../utils/audioUtils';
import {
  formatBrowserTtsVoiceLabel,
  getBrowserTtsVoiceValue,
  groupBrowserTtsVoicesByRegion
} from '../../domain/audio/browserTtsVoicePresentationDomain';

export const BrowserTtsVoiceOptgroups = ({
  voices = [],
  context = 'general',
  includeEngineHint = false
}) => {
  const grouped = groupBrowserTtsVoicesByRegion(voices, context);
  return Object.entries(grouped).map(([groupName, groupVoices]) => (
    groupVoices.length > 0 && (
      <optgroup key={groupName} label={groupName}>
        {groupVoices.map(voice => {
          const value = getBrowserTtsVoiceValue(voice);
          return (
            <option key={value} value={value}>
              {formatBrowserTtsVoiceLabel(voice, { includeEngineHint })}
            </option>
          );
        })}
      </optgroup>
    )
  ));
};

export const GroupedVoiceSelect = ({ voices, selectedValue, onChange, className, context = 'general', disabled }) => {
  const voiceList = Array.isArray(voices) ? voices : [];
  const grouped = groupVoicesByRegion(voiceList, context);
  const groupEntries = Object.entries(grouped);
  const hasOptions = groupEntries.some(([, items]) => items.length > 0);
  const availableValues = new Set();
  groupEntries.forEach(([, items]) => {
    items.forEach(item => {
      const value = item?.id || item?.name;
      if (value) availableValues.add(value);
    });
  });
  const isEdgeVoiceList = voiceList.some(item => Boolean(item && typeof item === 'object' && item.id));
  const missingSavedValue = hasOptions && selectedValue && !availableValues.has(selectedValue)
    ? selectedValue
    : '';

  if (!hasOptions) {
    return (
      <div className={`${className} opacity-50 text-slate-500 italic flex items-center px-2`}>
        No voices available
      </div>
    );
  }

  return (
    <select
      className={className}
      onChange={onChange}
      value={selectedValue}
      disabled={disabled}
    >
      {missingSavedValue && (
        <option value={missingSavedValue}>
          {isEdgeVoiceList
            ? `Unavailable · ${missingSavedValue}`
            : `Unavailable in browser · ${formatVoiceLabel({ name: missingSavedValue }) || missingSavedValue}`}
        </option>
      )}
      {groupEntries.map(([groupName, items]) => (
        items.length > 0 && (
          <optgroup key={groupName} label={groupName}>
            {items.map(v => (
              <option key={v.id || v.name} value={v.id || v.name}>
                {v.label || formatVoiceLabel(v)}
              </option>
            ))}
          </optgroup>
        )
      ))}
    </select>
  );
};

export default GroupedVoiceSelect;
