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

const updateCrc32 = (crc, bytes) => {
  let value = crc;
  for (let i = 0; i < bytes.length; i += 1) value = crcTable[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
  return value;
};

// R2: CRC is calculated as a stream, one Blob at a time. The old implementation
// converted every audio Blob to a Uint8Array and then concatenated the entire ZIP
// into a second giant Uint8Array, which multiplied peak JS-heap pressure.
const crc32Blob = async blob => {
  let crc = 0xffffffff;
  if (blob?.stream) {
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.length) crc = updateCrc32(crc, value);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  } else {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    crc = updateCrc32(crc, bytes);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
  };
};

const makeHeader = (size, writer) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  writer(view);
  return bytes;
};

export const buildStoredZipBlob = async (entries, { onProgress = null } = {}) => {
  const files = [];
  const sourceEntries = (Array.isArray(entries) ? entries : []).filter(entry => entry?.blob && entry?.filename);
  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    const nameBytes = encoder.encode(sanitizeFilename(entry.filename));
    const blob = entry.blob;
    const crc = await crc32Blob(blob);
    files.push({ nameBytes, blob, size: Number(blob.size || 0), crc, stamp: dosDateTime(new Date()) });
    onProgress?.({ phase: 'crc', index: index + 1, total: sourceEntries.length, filename: entry.filename });
  }
  if (!files.length) throw new Error('ZIP package has no audio files.');

  // Blob parts reference the original audio Blobs directly. No giant JS byte array
  // is created, so packaging remains bounded by small headers + browser Blob backing.
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(file => {
    const local = makeHeader(30, view => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
      view.setUint16(10, file.stamp.time, true); view.setUint16(12, file.stamp.date, true); view.setUint32(14, file.crc, true);
      view.setUint32(18, file.size, true); view.setUint32(22, file.size, true); view.setUint16(26, file.nameBytes.length, true); view.setUint16(28, 0, true);
    });
    localParts.push(local, file.nameBytes, file.blob);

    const central = makeHeader(46, view => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true);
      view.setUint16(12, file.stamp.time, true); view.setUint16(14, file.stamp.date, true); view.setUint32(16, file.crc, true);
      view.setUint32(20, file.size, true); view.setUint32(24, file.size, true); view.setUint16(28, file.nameBytes.length, true);
      view.setUint16(30, 0, true); view.setUint16(32, 0, true); view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, offset, true);
    });
    centralParts.push(central, file.nameBytes);
    offset += local.length + file.nameBytes.length + file.size;
  });

  const centralSize = centralParts.reduce((sum, chunk) => sum + Number(chunk.length || 0), 0);
  const end = makeHeader(22, view => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
    view.setUint32(12, centralSize, true); view.setUint32(16, offset, true); view.setUint16(20, 0, true);
  });
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
};

export const triggerBrowserZipDownload = async ({ entries, filename, onProgress = null }) => {
  const blob = await buildStoredZipBlob(entries, { onProgress });
  const url = URL.createObjectURL(blob);
  const safeFilename = sanitizeFilename(filename || 'ProLingo_Audio_Batch.zip');
  triggerBrowserDownload(url, safeFilename);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { status: 'download-triggered', filename: safeFilename, fileCount: entries.length, size: blob.size };
};
