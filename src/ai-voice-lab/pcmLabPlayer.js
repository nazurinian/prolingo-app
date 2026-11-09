// A tiny Web Audio scheduler for the standalone AI Voice lab, not the P9 player.
export function createPcmLabPlayer({
  audioContextFactory = () => new (window.AudioContext || window.webkitAudioContext)()
} = {}) {
  let context = null;
  let scheduledEnd = 0;
  const sources = new Set();
  const idleWaiters = [];

  const notifyIdle = () => {
    if (sources.size) return;
    while (idleWaiters.length) idleWaiters.shift()();
  };

  const unlock = async () => {
    if (!context) context = audioContextFactory();
    if (context.state !== 'running') await context.resume();
  };

  const enqueue = async ({ samples, sampleRate }) => {
    if (!(samples instanceof Float32Array) || !samples.length) {
      throw new TypeError('Chunk harus berisi PCM Float32Array.');
    }
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
      throw new TypeError('Sample rate audio tidak valid.');
    }
    await unlock();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const now = context.currentTime;
    const start = Math.max(now + 0.045, scheduledEnd);
    scheduledEnd = start + buffer.duration;
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      notifyIdle();
    };
    source.start(start);
    return { start, duration: buffer.duration, scheduledAhead: Math.max(0, scheduledEnd - now) };
  };

  const waitForIdle = () => sources.size === 0
    ? Promise.resolve()
    : new Promise(resolve => idleWaiters.push(resolve));

  const stop = () => {
    for (const source of [...sources]) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    // We only wait for onended to clear the set.
    scheduledEnd = context?.currentTime || 0;
    notifyIdle();
  };

  const dispose = async () => {
    stop();
    if (context && context.state !== 'closed') await context.close();
    context = null;
  };

  return Object.freeze({ unlock, enqueue, waitForIdle, stop, dispose });
}
