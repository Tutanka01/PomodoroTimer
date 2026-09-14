// Ambient audio: one persistent Web Audio loop shared across the app.
//
// We used to play this through <audio loop>. Two things broke the continuity
// there: the MP3 was encoded without gapless metadata (encoder delay +
// padding ~50 ms, replayed at every wrap), and the media element re-seeks at
// the loop point. Result: a short dropout every few minutes.
//
// AudioBufferSourceNode loops sample-accurately instead. In addition, we
// crossfade the tail of the decoded buffer over its head once (in place), so
// the seam stays continuous whatever the decoder did with the file edges.
// This way the loop has no gap and no click, and it never re-downloads.

const FADE_SECONDS = 2; // long enough to hide codec delay/padding entirely
const DEFAULT_VOLUME = 0.26;
const RAMP = 0.04; // short fade on start/stop to avoid a click

let ctx = null;
let master = null;
let source = null;
let sourceGain = null;
let currentUrl = '';
let volume = DEFAULT_VOLUME;
let isPlaying = false;

const cache = new Map(); // url -> { buffer, loopEnd }
const pending = new Map(); // url -> in-flight decode, so a double play() decodes once

function ensureCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

// Crossfade the last FADE_SECONDS over the first ones, in place, and return
// the matching loop end (seconds). The head then continues the signal that
// precedes it in the file, so the wrap is seamless. Equal-power fades keep
// the noise level steady through the blend.
function makeSeamless(buffer) {
  const n = buffer.length;
  const fade = Math.min(Math.round(FADE_SECONDS * buffer.sampleRate), Math.floor(n / 4));
  if (fade < 2) return n / buffer.sampleRate;
  const tail = n - fade;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < fade; i++) {
      const angle = (i / fade) * Math.PI / 2;
      data[i] = data[tail + i] * Math.cos(angle) + data[i] * Math.sin(angle);
    }
  }
  return tail / buffer.sampleRate;
}

async function load(url) {
  if (cache.has(url)) return cache.get(url);
  if (!pending.has(url)) {
    const p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Ambient audio: HTTP ${res.status} for ${url}`);
      const buffer = await ensureCtx().decodeAudioData(await res.arrayBuffer());
      const entry = { buffer, loopEnd: makeSeamless(buffer) };
      cache.clear(); // decayed buffers are tens of MB: keep only the latest track
      cache.set(url, entry);
      return entry;
    })().finally(() => pending.delete(url));
    pending.set(url, p);
  }
  return pending.get(url);
}

// Fade out and release the current source (scheduled, so it returns at once).
function stopSource() {
  const src = source;
  const gain = sourceGain;
  source = null;
  sourceGain = null;
  isPlaying = false;
  if (!src) return;
  try {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + RAMP);
    src.stop(t + RAMP + 0.01);
  } catch (e) {
    /* already stopped */
  }
}

export function setTrack(url) {
  if (!url || currentUrl === url) return;
  currentUrl = url;
  stopSource();
}

export async function play() {
  const url = currentUrl;
  if (!url) return;
  try {
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const entry = await load(url);
    if (url !== currentUrl) return; // track switched while decoding
    stopSource();
    const t = ctx.currentTime;
    sourceGain = ctx.createGain();
    sourceGain.gain.setValueAtTime(0, t);
    sourceGain.gain.linearRampToValueAtTime(1, t + RAMP);
    sourceGain.connect(master);
    source = ctx.createBufferSource();
    source.buffer = entry.buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = entry.loopEnd;
    source.connect(sourceGain);
    source.start();
    isPlaying = true;
  } catch (e) {
    console.error('Ambient audio error', e);
  }
}

export function pause() {
  stopSource();
}

export function setVolumeLinear(v01) {
  volume = Math.min(1, Math.max(0, v01));
  if (ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

export function getIsPlaying() { return isPlaying; }
export function getCurrentUrl() { return currentUrl; }
