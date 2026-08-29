import React from 'react';
import { groupVoicesByRegion, formatVoiceLabel } from '../../utils/audioUtils';

export const GroupedVoiceSelect = ({ voices, selectedValue, onChange, className, context = 'general', disabled }) => {
  const grouped = groupVoicesByRegion(voices, context);
  const hasOptions = Object.values(grouped).some(g => g.length > 0);

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
      {Object.keys(grouped).map(groupName => (
        grouped[groupName].length > 0 && (
          <optgroup key={groupName} label={groupName}>
            {grouped[groupName].map(v => (
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
