import * as Tone from 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js';

let notificationSynth, startSynth, fxChorus, fxReverb;

export function initSounds() {
  if (!fxChorus) fxChorus = new Tone.Chorus(4, 2.5, 0.2).start();
  if (!fxReverb) fxReverb = new Tone.Reverb({ decay: 2.2, wet: 0.22 });
  if (!notificationSynth) {
    notificationSynth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 10,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.005, decay: 1.0, sustain: 0.0, release: 1.4 },
      modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.2 }
    }).chain(fxChorus, fxReverb, Tone.Destination);
  }
  if (!startSynth) {
    startSynth = new Tone.AMSynth({
      harmonicity: 2.5,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.15, sustain: 0.0, release: 0.15 },
      modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0.0, release: 0.1 }
    }).chain(fxChorus, fxReverb, Tone.Destination);
  }
}

export function playNotificationSound() {
  const now = Tone.now();
  notificationSynth?.triggerAttackRelease('C6', '8n', now);
  notificationSynth?.triggerAttackRelease('G5', '8n', now + 0.15);
}

export function playStartSound() {
  const now = Tone.now();
  startSynth?.triggerAttackRelease('E5', '16n', now, 0.8);
  startSynth?.triggerAttackRelease('B5', '16n', now + 0.1, 0.7);
}

export async function ensureAudioStarted() {
  await Tone.start();
  if (!notificationSynth) initSounds();
}
