const SOUND_PREF_KEY = 'haazari_sound_enabled_v1';

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  try {
    // Off by default (Section 47: "Do not autoplay music" - extended here to
    // mean sound starts off until the player explicitly opts in).
    return localStorage.getItem(SOUND_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? 'true' : 'false');
  } catch {
    /* ignore storage failures */
  }
  if (on) {
    // Unlock/resume the audio context on the user gesture that turned sound on.
    getContext();
  }
}

interface Tone {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  delayMs?: number;
  gain?: number;
}

function playTones(tones: Tone[]): void {
  if (!isSoundEnabled()) return;
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.value = t.freq;

    const start = now + (t.delayMs ?? 0) / 1000;
    const duration = t.durationMs / 1000;
    const peakGain = t.gain ?? 0.12;

    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(peakGain, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

/** Card dealt (one soft tick - call once per card, or a few times for a batch). */
export function playDealSound(): void {
  playTones([{ freq: 480, durationMs: 60, type: 'triangle', gain: 0.06 }]);
}

/** Card/set tapped or selected in the arrangement screen. */
export function playSelectSound(): void {
  playTones([{ freq: 620, durationMs: 50, type: 'sine', gain: 0.08 }]);
}

/** A set was played/thrown onto the table. */
export function playCardPlaySound(): void {
  playTones([
    { freq: 300, durationMs: 70, type: 'triangle', gain: 0.1 },
    { freq: 420, durationMs: 90, type: 'triangle', delayMs: 40, gain: 0.08 },
  ]);
}

/** Sub-round reveal - a short rising flourish. */
export function playRevealSound(): void {
  playTones([
    { freq: 392, durationMs: 90, gain: 0.09 },
    { freq: 523, durationMs: 120, delayMs: 90, gain: 0.09 },
  ]);
}

/** Points awarded to the local player. */
export function playPointsSound(): void {
  playTones([
    { freq: 523, durationMs: 80, gain: 0.1 },
    { freq: 659, durationMs: 80, delayMs: 70, gain: 0.1 },
    { freq: 784, durationMs: 140, delayMs: 140, gain: 0.1 },
  ]);
}

/** Round complete. */
export function playRoundCompleteSound(): void {
  playTones([
    { freq: 440, durationMs: 110, gain: 0.1 },
    { freq: 554, durationMs: 110, delayMs: 100, gain: 0.1 },
    { freq: 659, durationMs: 180, delayMs: 200, gain: 0.1 },
  ]);
}

/** Final victory fanfare. */
export function playVictorySound(): void {
  playTones([
    { freq: 523, durationMs: 130, gain: 0.12 },
    { freq: 659, durationMs: 130, delayMs: 120, gain: 0.12 },
    { freq: 784, durationMs: 130, delayMs: 240, gain: 0.12 },
    { freq: 1047, durationMs: 300, delayMs: 360, gain: 0.13 },
  ]);
}

/** A move was invalid / an error occurred. */
export function playErrorSound(): void {
  playTones([{ freq: 180, durationMs: 160, type: 'sawtooth', gain: 0.07 }]);
}

/** New chat message received. */
export function playChatSound(): void {
  playTones([{ freq: 880, durationMs: 40, type: 'sine', gain: 0.05 }]);
}
