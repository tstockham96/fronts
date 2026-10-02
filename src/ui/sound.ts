/** Tiny synthesized sound kit (WebAudio, no assets) + haptics. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'triangle', gain = 0.08, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.12, delay = 0, freq = 900) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export function haptic(ms: number | number[] = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  tick: (up: boolean) => tone(up ? 660 : 520, 0.04, 'square', 0.025),
  deploy: () => {
    noise(0.35, 0.08, 0, 500);
    tone(110, 0.3, 'sawtooth', 0.05, 0, 55);
  },
  clash: (won: number) => {
    noise(0.18, 0.16, 0, 1400);
    if (won > 0) tone(784, 0.16, 'triangle', 0.07, 0.05);
    else if (won < 0) tone(196, 0.2, 'triangle', 0.07, 0.05);
    else tone(440, 0.12, 'triangle', 0.05, 0.05);
  },
  victory: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.09)),
  defeat: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.06, i * 0.12)),
  draw: () => [440, 440].forEach((f, i) => tone(f, 0.18, 'triangle', 0.05, i * 0.15)),
  pop: () => tone(880, 0.06, 'sine', 0.05),
};
