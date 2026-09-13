// Native Web Audio sound effects — no dependencies.
// Tone.js was removed: two short chimes don't justify a full audio framework.

let audioCtx = null;

// Lazily create a single AudioContext and resume it if the browser suspended it.
export async function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return; // no Web Audio support: stay silent instead of throwing
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
  } catch (e) {
    console.error('AudioContext unavailable', e);
  }
}

// One-shot oscillator with a soft exponential envelope. Nodes are created per
// call and released to the GC when the sound ends (no persistent graph).
function playTone(freq, delay, duration, peak = 0.12) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  } catch (e) {
    console.error('Sound playback failed', e);
  }
}

const NOTE = { B4: 493.88, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5 };

export function playStartSound(isWork) {
  // Two short ascending notes, slightly higher for a work session.
  const [first, second] = isWork ? [NOTE.E5, NOTE.B5] : [NOTE.D5, NOTE.A5];
  playTone(first, 0, 0.14, 0.12);
  playTone(second, 0.12, 0.14, 0.1);
}

export function playNotificationSound(workFinished) {
  // Small two-note motif, brighter when a pomodoro finishes than for a break.
  const [first, second] = workFinished ? [NOTE.C6, NOTE.G5] : [NOTE.E5, NOTE.B4];
  playTone(first, 0, 0.18, 0.12);
  playTone(second, 0.15, 0.18, 0.1);
}

export function stopAllAudio() {
  // No persistent graph to stop: one-shot nodes end on their own.
}
