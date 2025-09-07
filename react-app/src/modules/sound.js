// Legacy-inspired, softened audio layer
import * as Tone from 'tone';

let initialized = false;
let notificationSynth; // FMSynth (legacy end sound)
let startSynth;        // AMSynth (legacy start sound)
let fxChorus, fxReverb;

export async function ensureAudio() {
  if (initialized) return;
  await Tone.start();
  if (!fxChorus) fxChorus = new Tone.Chorus(4, 2.5, 0.15).start();
  if (!fxReverb) fxReverb = new Tone.Reverb({ decay: 2.0, wet: 0.18 });
  if (!notificationSynth) {
    notificationSynth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 10,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.9, sustain: 0.0, release: 1.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.0, release: 0.2 }
    }).chain(fxChorus, fxReverb, new Tone.Volume(-4), Tone.Destination);
  }
  if (!startSynth) {
    startSynth = new Tone.AMSynth({
      harmonicity: 2.5,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.14, sustain: 0.0, release: 0.14 },
      modulationEnvelope: { attack: 0.002, decay: 0.09, sustain: 0.0, release: 0.09 }
    }).chain(fxChorus, fxReverb, new Tone.Volume(-6), Tone.Destination);
  }
  initialized = true;
}

export function playStartSound(isWork) {
  if (!initialized) return;
  const now = Tone.now();
  // Deux petites notes ascendantes, un peu plus élevées si session travail
  startSynth.triggerAttackRelease(isWork ? 'E5' : 'D5', '16n', now, 0.7);
  startSynth.triggerAttackRelease(isWork ? 'B5' : 'A5', '16n', now + 0.12, 0.6);
}

export function playNotificationSound(workFinished) {
  if (!initialized) return;
  const now = Tone.now();
  // Motif simple, plus brillant si on termine un pomodoro
  if (workFinished) {
    notificationSynth.triggerAttackRelease('C6', '8n', now, 0.9);
    notificationSynth.triggerAttackRelease('G5', '8n', now + 0.15, 0.75);
  } else {
    notificationSynth.triggerAttackRelease('E5', '8n', now, 0.6);
    notificationSynth.triggerAttackRelease('B4', '8n', now + 0.14, 0.5);
  }
}

export function stopAllAudio() {
  // simple guard to allow future cleanup if needed
}
