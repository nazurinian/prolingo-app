import { getStableAudioIdentity, isIndonesianAudioPart } from '../../utils/audioUtils';

export const resolveLocalAudioUrl = ({ mode, item, part, localAudioMapTable, localAudioMapText }) => {
  if (mode === 'table') {
    const key = `${getStableAudioIdentity(item)}_${part}`;
    return localAudioMapTable[key];
  }
  return localAudioMapText[getStableAudioIdentity(item)];
};

export const resolveAudioFallbackVoice = (part, selectedIndonesianVoice) =>
  isIndonesianAudioPart(part) ? selectedIndonesianVoice : null;
