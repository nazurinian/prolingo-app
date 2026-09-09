import { sanitizeFilename, triggerBrowserDownload } from '../../utils/audioUtils.js';

const encoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = bytes => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
  };
};

const concat = chunks => {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.length; });
  return out;
};

const makeHeader = (size, writer) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  writer(view);
  return bytes;
};

export const buildStoredZipBlob = async entries => {
  const files = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.blob || !entry?.filename) continue;
    const nameBytes = encoder.encode(sanitizeFilename(entry.filename));
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    files.push({ nameBytes, data, crc: crc32(data), stamp: dosDateTime(new Date()) });
  }
  if (!files.length) throw new Error('ZIP package has no audio files.');

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  files.forEach(file => {
    const local = makeHeader(30, view => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
      view.setUint16(10, file.stamp.time, true); view.setUint16(12, file.stamp.date, true); view.setUint32(14, file.crc, true);
      view.setUint32(18, file.data.length, true); view.setUint32(22, file.data.length, true); view.setUint16(26, file.nameBytes.length, true); view.setUint16(28, 0, true);
    });
    localChunks.push(local, file.nameBytes, file.data);

    const central = makeHeader(46, view => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true);
      view.setUint16(12, file.stamp.time, true); view.setUint16(14, file.stamp.date, true); view.setUint32(16, file.crc, true);
      view.setUint32(20, file.data.length, true); view.setUint32(24, file.data.length, true); view.setUint16(28, file.nameBytes.length, true);
      view.setUint16(30, 0, true); view.setUint16(32, 0, true); view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, offset, true);
    });
    centralChunks.push(central, file.nameBytes);
    offset += local.length + file.nameBytes.length + file.data.length;
  });

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = makeHeader(22, view => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
    view.setUint32(12, centralSize, true); view.setUint32(16, offset, true); view.setUint16(20, 0, true);
  });
  return new Blob([concat([...localChunks, ...centralChunks, end])], { type: 'application/zip' });
};

export const triggerBrowserZipDownload = async ({ entries, filename }) => {
  const blob = await buildStoredZipBlob(entries);
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, sanitizeFilename(filename || 'ProLingo_Audio_Batch.zip'));
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { status: 'download-triggered', filename, fileCount: entries.length, size: blob.size };
};
