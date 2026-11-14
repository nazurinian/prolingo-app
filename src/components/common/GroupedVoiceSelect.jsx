import React from 'react';
import { formatVoiceLabel } from '../../utils/audioUtils';
import {
  formatBrowserTtsVoiceLabel,
  getBrowserTtsVoiceValue,
  groupBrowserTtsVoicesByRegion
} from '../../domain/audio/browserTtsVoicePresentationDomain';
import { initialEdgeVoices, isEdgeVoiceUnavailable } from '../../constants/voiceConstants';
import {
  formatEdgeVoiceLabel,
  groupEdgeVoicesByRegion,
  isEdgeVoiceEntry
} from '../../domain/audio/voicePresentationDomain';

const memoComponent = typeof React.memo === 'function' ? React.memo : fn => fn;
const EMPTY_VOICES = Object.freeze([]);

export const EdgeVoiceOptgroups = memoComponent(({
  voices = initialEdgeVoices,
  context = 'general',
  disableUnavailable = true
}) => {
  const voiceList = Array.isArray(voices) ? voices : EMPTY_VOICES;
  return React.useMemo(() => {
    const grouped = groupEdgeVoicesByRegion(voiceList, context);
    return Object.entries(grouped).map(([groupName, groupVoices]) => (
      groupVoices.length > 0 && (
        <optgroup key={groupName} label={groupName}>
          {groupVoices.map(voice => {
            const unavailable = isEdgeVoiceUnavailable(voice, voiceList);
            return (
              <option
                key={voice.id}
                value={voice.id}
                disabled={disableUnavailable && unavailable}
              >
                {formatEdgeVoiceLabel(voice, { edgeVoices: voiceList })}
              </option>
            );
          })}
        </optgroup>
      )
    ));
  }, [voiceList, context, disableUnavailable]);
});

export const BrowserTtsVoiceOptgroups = memoComponent(({
  voices = EMPTY_VOICES,
  context = 'general',
  includeEngineHint = false
}) => {
  const voiceList = Array.isArray(voices) ? voices : EMPTY_VOICES;
  return React.useMemo(() => {
    const grouped = groupBrowserTtsVoicesByRegion(voiceList, context);
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
  }, [voiceList, context, includeEngineHint]);
});

export const GroupedVoiceSelect = memoComponent(({
  voices,
  selectedValue,
  onChange,
  className,
  context = 'general',
  disabled,
  disableUnavailable = true
}) => {
  const voiceList = Array.isArray(voices) ? voices : EMPTY_VOICES;
  const { hasOptions, availableValues, isEdgeVoiceList, optgroupElements } = React.useMemo(() => {
    const detectedEdgeList = voiceList.some(
      item => isEdgeVoiceEntry(item) || Boolean(item && typeof item === 'object' && item.id)
    );
    const grouped = detectedEdgeList
      ? groupEdgeVoicesByRegion(voiceList, context)
      : groupBrowserTtsVoicesByRegion(voiceList, context);
    const groupEntries = Object.entries(grouped);
    const anyOptions = groupEntries.some(([, items]) => items.length > 0);
    const valuesSet = new Set();
    const elements = groupEntries.map(([groupName, items]) => {
      if (items.length === 0) return false;
      return (
        <optgroup key={groupName} label={groupName}>
          {items.map(v => {
            const optionValue = v.id || v.name;
            if (optionValue) valuesSet.add(optionValue);
            const edgeUnavailable = detectedEdgeList && isEdgeVoiceUnavailable(v, voiceList);
            const optionLabel = detectedEdgeList
              ? formatEdgeVoiceLabel(v, { edgeVoices: voiceList })
              : (v.label || formatVoiceLabel(v));
            return (
              <option
                key={optionValue}
                value={optionValue}
                disabled={disableUnavailable && edgeUnavailable}
              >
                {optionLabel}
              </option>
            );
          })}
        </optgroup>
      );
    });
    return {
      hasOptions: anyOptions,
      availableValues: valuesSet,
      isEdgeVoiceList: detectedEdgeList,
      optgroupElements: elements
    };
  }, [voiceList, context, disableUnavailable]);

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
        <option value={missingSavedValue} disabled={isEdgeVoiceList && disableUnavailable}>
          {isEdgeVoiceList
            ? `Unavailable · ${missingSavedValue}`
            : `Unavailable in browser · ${formatVoiceLabel({ name: missingSavedValue }) || missingSavedValue}`}
        </option>
      )}
      {optgroupElements}
    </select>
  );
});

export default GroupedVoiceSelect;
