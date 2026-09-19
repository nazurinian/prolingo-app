const clean = value => String(value ?? '').trim();

const writeAscii = (view, offset, text) => {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
};

const wavHeader = ({ sampleRate, channels, frames }) => {
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buffer);
};

const bufferToPcm16 = (audioBuffer, channels) => {
  const frames = audioBuffer.length;
  const bytes = new Uint8Array(frames * channels * 2);
  const view = new DataView(bytes.buffer);
  const sourceChannels = Math.max(1, audioBuffer.numberOfChannels || 1);
  let offset = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sourceIndex = Math.min(channel, sourceChannels - 1);
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(sourceIndex)[frame] || 0));
      view.setInt16(offset, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
      offset += 2;
    }
  }
  return bytes;
};

export const buildDerivedTextFullAudioWav = async ({ blobs = [] } = {}) => {
  const source = (Array.isArray(blobs) ? blobs : []).filter(blob => blob instanceof Blob && blob.size > 0);
  if (!source.length) throw new Error('Full derived audio requires at least one readable Segment binary.');
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof AudioContextCtor !== 'function') throw new Error('This browser does not support AudioContext decoding for Full derived audio.');
  const context = new AudioContextCtor();
  try {
    const decoded = [];
    for (const blob of source) {
      const arrayBuffer = await blob.arrayBuffer();
      const audio = await context.decodeAudioData(arrayBuffer.slice(0));
      decoded.push(audio);
    }
    const sampleRate = context.sampleRate || decoded[0]?.sampleRate;
    if (!sampleRate) throw new Error('Unable to resolve Full audio sample rate.');
    const channels = Math.min(2, Math.max(1, ...decoded.map(buffer => Number(buffer?.numberOfChannels || 1))));
    const frames = decoded.reduce((sum, buffer) => sum + Number(buffer?.length || 0), 0);
    if (!frames) throw new Error('Decoded Full audio is empty.');
    const parts = [wavHeader({ sampleRate, channels, frames })];
    decoded.forEach(buffer => parts.push(bufferToPcm16(buffer, channels)));
    return {
      blob: new Blob(parts, { type: 'audio/wav' }),
      segmentCount: decoded.length,
      sampleRate,
      channels,
      duration: decoded.reduce((sum, buffer) => sum + Number(buffer?.duration || 0), 0),
      format: 'wav-pcm16-derived-v1'
    };
  } finally {
    try { await context.close(); } catch { /* noop */ }
  }
};

export const buildDerivedTextFullAudioFilename = ({ documentTitle = 'Text', blockId = 'CARD', channel = 'text' } = {}) => {
  const safe = value => clean(value).normalize('NFKD').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/[-_]{2,}/g, '_').replace(/^[-._]+|[-._]+$/g, '') || 'TEXT';
  return `${safe(documentTitle)}__${safe(String(blockId).toUpperCase())}__FULL_${channel === 'meaning' ? 'ID' : 'EN'}__DERIVED.wav`;
};
