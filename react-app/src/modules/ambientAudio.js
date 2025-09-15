// Simple singleton for a persistent ambient audio element across the app

let audioEl;
let currentUrl = '';
let isPlaying = false;

function ensureEl() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.loop = true;
    audioEl.crossOrigin = 'anonymous';
    audioEl.volume = 0.26; // default soft level
    audioEl.addEventListener('play', () => { isPlaying = true; });
    audioEl.addEventListener('pause', () => { isPlaying = false; });
    audioEl.addEventListener('ended', () => { isPlaying = false; });
    audioEl.addEventListener('error', (e) => { console.error('Ambient audio error', e); });
  }
  return audioEl;
}

export function setTrack(url) {
  const el = ensureEl();
  if (!url || currentUrl === url) return;
  currentUrl = url;
  try {
    el.pause();
    el.src = url;
    el.load();
  } catch (e) {
    console.error(e);
  }
}

export async function play() {
  const el = ensureEl();
  if (!currentUrl) return;
  try {
    await el.play();
    isPlaying = true;
  } catch (e) {
    console.error(e);
  }
}

export function pause() {
  const el = ensureEl();
  try { el.pause(); isPlaying = false; } catch {}
}

export function setVolumeLinear(v01) {
  const el = ensureEl();
  el.volume = Math.min(1, Math.max(0, v01));
}

export function getVolumeLinear() {
  const el = ensureEl();
  return el.volume;
}

export function getIsPlaying() { return isPlaying; }
export function getCurrentUrl() { return currentUrl; }
