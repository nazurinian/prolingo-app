import { BOOK_AUDIO_MAX_BYTES, bookAudioError } from '../../domain/text/bookQaAudioDomain.js';

const invalid = message => { throw bookAudioError('INVALID_AUDIO_BINARY', message); };
const tag = (view, offset) => view.getUint32(offset, false);
const inspectWav = view => {
  if (view.byteLength < 44 || tag(view, 8) !== 0x57415645 || view.getUint32(4, true) + 8 !== view.byteLength) invalid('WAV container is truncated or invalid');
  let format, dataBytes;
  for (let offset = 12; offset < view.byteLength;) {
    if (offset + 8 > view.byteLength) invalid('Truncated WAV chunk header');
    const kind = tag(view, offset), size = view.getUint32(offset + 4, true), start = offset + 8;
    offset = start + size + (size % 2);
    if (offset > view.byteLength) invalid('Truncated WAV chunk');
    if (kind === 0x666d7420) {
      if (format || size < 16 || view.getUint16(start, true) !== 1) invalid('Only integer PCM WAV is supported');
      const channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true);
      const bitDepth = view.getUint16(start + 14, true), blockAlign = view.getUint16(start + 12, true);
      if (![1, 2].includes(channels) || ![8, 16, 24, 32].includes(bitDepth) || sampleRate < 8000 || sampleRate > 96000
        || blockAlign !== channels * bitDepth / 8 || view.getUint32(start + 8, true) !== blockAlign * sampleRate) invalid('Invalid PCM format');
      format = { sampleRate, channels, blockAlign };
    } else if (kind === 0x64617461) {
      if (dataBytes !== undefined) invalid('WAV contains multiple data chunks');
      dataBytes = size;
    }
  }
  if (!format || !dataBytes || dataBytes % format.blockAlign) invalid('WAV contains no complete PCM frames');
  if (dataBytes / format.blockAlign / format.sampleRate > 600) invalid('Audio exceeds the ten-minute decode limit');
  return { format: 'wav', sampleRate: format.sampleRate, channels: format.channels };
};

const MP3_RATES = [44100, 48000, 32000];
const MP3_BITRATES_1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BITRATES_2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const inspectMp3 = view => {
  let end = view.byteLength, offset = 0, sampleRate, channels, frames = 0;
  if (end >= 10 && tag(view, 0) >>> 8 === 0x494433) {
    const version = view.getUint8(3), flags = view.getUint8(5);
    if (![2, 3, 4].includes(version)) invalid('Unsupported ID3 version');
    offset = 10;
    for (let i = 6; i < 10; i++) {
      if (view.getUint8(i) > 127) invalid('Invalid ID3 size');
      offset += view.getUint8(i) * 128 ** (9 - i);
    }
    if (version === 4 && flags & 16) offset += 10;
  }
  if (end >= 128 && tag(view, end - 128) >>> 8 === 0x544147) end -= 128;
  while (offset + 4 <= end) {
    const header = tag(view, offset);
    const version = (header >>> 19) & 3, layer = (header >>> 17) & 3, rateIndex = (header >>> 10) & 3;
    const bitrate = (version === 3 ? MP3_BITRATES_1 : MP3_BITRATES_2)[(header >>> 12) & 15];
    if ((header >>> 21) !== 0x7ff || version === 1 || layer !== 1 || rateIndex === 3 || !bitrate) invalid('Unsupported or invalid MP3 Layer III frame');
    const rate = MP3_RATES[rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const count = ((header >>> 6) & 3) === 3 ? 1 : 2;
    if (frames && (rate !== sampleRate || count !== channels)) invalid('MP3 changes sample rate or channel count');
    sampleRate = rate;
    channels = count;
    offset += Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((header >>> 9) & 1);
    frames++;
    if (frames * (version === 3 ? 1152 : 576) / sampleRate > 600) invalid('Audio exceeds the ten-minute decode limit');
  }
  if (!frames || offset !== end) invalid('MP3 is empty or truncated');
  return { format: 'mp3', sampleRate, channels };
};

export const digestBookAudioBytes = async buffer => new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  .reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '');

export const validateBookAudioBytes = async (blob, expectedFormat) => {
  if (!(blob instanceof Blob) || blob.size < 4 || blob.size > BOOK_AUDIO_MAX_BYTES) invalid('Audio byte size is outside the supported range');
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const { format, sampleRate, channels } = tag(view, 0) === 0x52494646 ? inspectWav(view) : inspectMp3(view);
  if (format !== expectedFormat) invalid('Audio bytes do not match the render codec');
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw bookAudioError('AUDIO_DECODER_UNAVAILABLE', 'Audio validation requires a browser decoder');
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    if (!decoded.length || decoded.numberOfChannels !== channels) invalid('Audio contains no readable frames');
  } catch (error) {
    if (error.code === 'INVALID_AUDIO_BINARY') throw error;
    invalid('The browser could not decode the audio');
  } finally {
    await context.close();
  }
  return { digest: await digestBookAudioBytes(buffer), format, sampleRate, bytes: blob.size };
};
