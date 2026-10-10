import { mixer } from './mixer';

/** Các hiệu ứng âm thanh theo sự kiện trong game (tổng hợp bằng WebAudio, không dùng file). */
export type Sfx = 'money' | 'lose' | 'message' | 'phoneOpen' | 'phoneClose' | 'start' | 'complete' | 'fail' | 'alert' | 'escaped' | 'crash';

type Wave = OscillatorType;

/** Một nốt có đường bao âm lượng nhanh (bấm – tắt). */
function note(ctx: AudioContext, freq: number, at: number, dur: number, wave: Wave, peak: number, glideTo?: number): void {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(mixer.bus());
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Tiếng "bịch" / va chạm: nhiễu trắng ngắn lọc thấp. */
function thud(ctx: AudioContext, at: number, dur: number, cutoff: number, peak: number): void {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = peak;
  src.connect(f).connect(g).connect(mixer.bus());
  src.start(at);
}

/**
 * Mức ưu tiên: nhiều sự kiện cùng lúc (xong nhiệm vụ ⇒ tiền vào ⇒ tin nhắn tổng đài) thì chỉ phát tiếng quan trọng nhất,
 * khỏi chồng ba bốn tiếng lên nhau.
 */
const PRIORITY: Record<Sfx, number> = {
  complete: 3,
  fail: 3,
  crash: 3,
  alert: 3,
  escaped: 3,
  money: 2,
  lose: 2,
  start: 2,
  message: 1,
  phoneOpen: 0,
  phoneClose: 0,
};
/** Trong khoảng này (giây) sau một tiếng, tiếng ưu tiên thấp hơn bị bỏ. */
const OVERLAP = 0.4;
let lastAt = -Infinity;
let lastPriority = -1;

/** Phát một hiệu ứng (im lặng nếu người chơi chưa tương tác / trình duyệt chặn). */
export function playSfx(name: Sfx): void {
  const ctx = mixer.context();
  if (!ctx) return;
  const p = PRIORITY[name];
  if (ctx.currentTime - lastAt < OVERLAP && p < lastPriority) return;
  lastAt = ctx.currentTime;
  lastPriority = p;
  try {
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'money': // "ting ting" như máy tính tiền
        note(ctx, 1318, t, 0.12, 'triangle', 0.12);
        note(ctx, 1760, t + 0.09, 0.28, 'triangle', 0.12);
        break;
      case 'lose':
        note(ctx, 330, t, 0.35, 'sawtooth', 0.05, 180);
        break;
      case 'message': // "ting" báo tin nhắn
        note(ctx, 988, t, 0.1, 'sine', 0.1);
        note(ctx, 1319, t + 0.08, 0.18, 'sine', 0.1);
        break;
      case 'phoneOpen':
        note(ctx, 620, t, 0.06, 'sine', 0.06, 900);
        break;
      case 'phoneClose':
        note(ctx, 900, t, 0.06, 'sine', 0.05, 600);
        break;
      case 'start':
        note(ctx, 523, t, 0.12, 'triangle', 0.08);
        note(ctx, 784, t + 0.1, 0.2, 'triangle', 0.08);
        break;
      case 'complete': // hợp âm rải Đô trưởng
        [523, 659, 784, 1047].forEach((f, i) => note(ctx, f, t + i * 0.09, 0.32, 'triangle', 0.09));
        break;
      case 'fail':
        [392, 330, 262].forEach((f, i) => note(ctx, f, t + i * 0.14, 0.3, 'square', 0.035));
        break;
      case 'alert': // bị phát hiện: hai nốt trầm căng thẳng
        for (let i = 0; i < 3; i++) {
          note(ctx, 220, t + i * 0.22, 0.12, 'sawtooth', 0.05);
          note(ctx, 233, t + i * 0.22 + 0.11, 0.12, 'sawtooth', 0.05);
        }
        break;
      case 'escaped':
        [440, 660, 880].forEach((f, i) => note(ctx, f, t + i * 0.08, 0.22, 'sine', 0.08));
        break;
      case 'crash':
        thud(ctx, t, 0.35, 700, 0.35);
        note(ctx, 90, t, 0.3, 'sine', 0.2, 45);
        break;
    }
  } catch {
    // Trình duyệt chặn âm thanh: bỏ qua.
  }
}
