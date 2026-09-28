// 纸本版配乐：F 大调钢琴琶音 + 轻铺底，外加翻页、笔划、键盘、卡片落桌、盖章等纸上的声音。
// 和弦与音效节点全部读 out/timeline-paper.json（由 render.mjs --v=paper 导出），与画面逐一对应。
// 输出 out/audio-paper.wav（48kHz 16bit 立体声）。纯 Node，无依赖。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(fs.readFileSync(path.join(HERE, "out", "timeline-paper.json"), "utf8"));
const DUR = TL.DUR, SR = 48000, N = Math.ceil(DUR * SR);

const dry = [new Float32Array(N), new Float32Array(N)];
const send = [new Float32Array(N), new Float32Array(N)];
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = mulberry32(64);
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
function add(i, s, p, wet = 1, dryAmt = 0.6) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan(p);
  send[0][i] += s * gl * wet; send[1][i] += s * gr * wet;
  dry[0][i] += s * gl * dryAmt; dry[1][i] += s * gr * dryAmt;
}

// ---------- 音色 ----------
// 钢琴：带轻微非谐性的泛音，高次泛音衰减更快
function piano(t0, m, vel, p = (m - 64) / 40) {
  const f = mtof(m), i0 = Math.floor(t0 * SR), len = Math.floor(SR * Math.min(5, 2.4 + (76 - m) * 0.06));
  const parts = [];
  for (let h = 1; h <= 8; h++) parts.push([f * h * Math.sqrt(1 + 0.00035 * h * h), vel / Math.pow(h, 1.35), 0.9 + 0.5 * h + f / 1100]);
  for (let k = 0; k < len; k++) {
    const lt = k / SR, att = 1 - Math.exp(-lt * 380);
    let s = 0;
    for (const [fh, a, d] of parts) s += Math.sin(TAU * fh * lt) * a * Math.exp(-lt * d);
    if (k < SR * 0.012) s += (R() * 2 - 1) * vel * 0.05 * (1 - k / (SR * 0.012)); // 击弦的一点噪声
    add(i0 + k, s * att * 0.5, p, 0.9, 0.7);
  }
}
function band(t0, dur, f0, f1, amp, p0, p1, q, shape, wet = 0.6) {
  let low = 0, bnd = 0;
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let k = 0; k < n; k++) {
    const u = k / n, fc = f0 * Math.pow(f1 / f0, u), F = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    const x = R() * 2 - 1; low += F * bnd; const high = x - low - q * bnd; bnd += F * high;
    add(i0 + k, bnd * amp * shape(u, k), p0 + (p1 - p0) * u, wet, 1);
  }
}
function thump(t0, f0, amp, decay = 30) {
  let ph = 0; const i0 = Math.floor(t0 * SR);
  for (let k = 0; k < SR * 0.25; k++) { const lt = k / SR; ph += TAU * (f0 * (1 + 0.6 * Math.exp(-lt * 60))) / SR; add(i0 + k, Math.sin(ph) * amp * Math.exp(-lt * decay) * Math.min(1, lt * 800), 0, 0.15, 1); }
}
const SFX = {
  page: c => { band(c.t - 0.05, 0.75, 2600, 700, 0.11, 0.7, -0.7, 0.8, u => Math.pow(Math.sin(Math.PI * u), 1.4)); thump(c.t + 0.55, 70, 0.05, 18); },
  ink: c => band(c.t, c.dur || 1.3, 900, 3000, 0.018, -0.3, 0.3, 0.7, u => Math.sin(Math.PI * u)),
  pen: c => { const j = []; for (let i = 0; i < 64; i++) j.push(0.4 + R() * 0.6); band(c.t, c.dur || 0.6, 5200, 4200, 0.03, -0.2, 0.2, 0.9, (u, k) => Math.sin(Math.PI * u) * j[Math.floor(u * 63)], 0.2); },
  key: c => { band(c.t, 0.04, 2600, 2600, 0.16, 0, 0, 0.5, u => Math.exp(-u * 6), 0.2); thump(c.t, 160, 0.05, 70); },
  tick: c => band(c.t, 0.025, 3500, 3500, c.soft ? 0.03 : 0.06, (R() - 0.5), (R() - 0.5), 0.5, u => Math.exp(-u * 5), 0.3),
  drop: c => { thump(c.t, 120, c.soft ? 0.05 : 0.1, 40); band(c.t, 0.05, 900, 500, c.soft ? 0.03 : 0.06, R() - 0.5, R() - 0.5, 0.7, u => Math.exp(-u * 4), 0.2); },
  stamp: c => { thump(c.t, 85, 0.22, 22); band(c.t, 0.06, 1200, 600, 0.08, 0, 0, 0.6, u => Math.exp(-u * 5), 0.2); },
};

// ---------- 和弦：铺底 + 钢琴琶音 ----------
const CH = {
  Fmaj7: [41, 53, 57, 60, 64], Dm9: [38, 50, 57, 60, 64], Bbmaj7: [46, 53, 57, 62, 65], Gm9: [43, 50, 58, 65, 69],
  C6: [48, 55, 57, 64, 67], Am7: [45, 52, 55, 60, 64], Fmaj9: [41, 48, 57, 64, 67],
};
const BEAT = 60 / 76 / 2; // 76 BPM 的八分音符
const ARP = [1, 2, 3, 4, 3, 2, 3, 4];
TL.chords.forEach(([t0, name], c) => {
  const notes = CH[name], t1 = c + 1 < TL.chords.length ? TL.chords[c + 1][0] : DUR;
  const last = c === TL.chords.length - 1;
  // 铺底：很轻的正弦叠加，给琶音垫一层暖色
  notes.forEach((m, vi) => {
    const f = mtof(m + 12 * (vi === 0 ? 1 : 0)), i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t1 + 1.5) * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR, env = smooth(t0, t0 + 1.2, t) * (1 - smooth(t1, t1 + 1.5, t));
      if (env > 0) add(i, (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2 * t + vi)) * env * 0.012, (vi / 4 - 0.5) * 1.2, 1, 0.3);
    }
  });
  piano(t0 + 0.02, notes[0], last ? 0.42 : 0.3, -0.3);
  if (last) { [1, 2, 3, 4].forEach((v, i) => piano(t0 + 0.05 + i * 0.09, notes[v] + 12, 0.24)); return; }
  for (let k = 0, t = t0 + BEAT; t < t1 - 0.05; k++, t += BEAT) {
    const m = notes[ARP[k % ARP.length]] + 12;
    piano(t, m, 0.12 + (k % 4 === 0 ? 0.05 : 0) + 0.02 * Math.sin(k * 1.3), (ARP[k % ARP.length] - 2.5) / 3);
  }
});

// ---------- 画面节点 ----------
const MELODY = [72, 74, 77, 79, 81, 79, 77, 76, 77, 81, 84];
let noteI = 0;
for (const c of TL.cues) {
  if (SFX[c.kind]) SFX[c.kind](c);
  else if (c.kind === "focus") { const m = MELODY[c.n % MELODY.length]; piano(c.t, m, 0.34); piano(c.t, m - 12, 0.12); }
  else if (c.kind === "note") piano(c.t, [77, 81, 84, 86][noteI++ % 4], 0.22);
  else if (c.kind === "chime") {
    if (c.big) [53, 60, 65, 69, 72, 76].forEach((m, i) => piano(c.t + i * 0.05, m, 0.3 - i * 0.02));
    else [77, 81, 84].forEach((m, i) => piano(c.t + i * 0.06, m, 0.22));
  }
}

// ---------- 混响 + 总线 ----------
function reverb(inp, off) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(l => Math.round((l + off) * SR / 44100));
  for (const len of combs) {
    const buf = new Float32Array(len); let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) { const y = buf[idx]; filt = y * 0.7 + filt * 0.3; buf[idx] = inp[i] + filt * 0.82; out[i] += y / combs.length; if (++idx >= len) idx = 0; }
  }
  for (const l of [556, 441, 341]) {
    const len = Math.round((l + off) * SR / 44100), buf = new Float32Array(len); let idx = 0;
    for (let i = 0; i < N; i++) { const b = buf[idx], x = out[i]; out[i] = -x + b; buf[idx] = x + b * 0.5; if (++idx >= len) idx = 0; }
  }
  return out;
}
const wet = [reverb(send[0], 0), reverb(send[1], 23)];
const L = new Float32Array(N), Rt = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, g = smooth(0, 0.5, t) * (1 - smooth(DUR - 2.5, DUR, t));
  L[i] = Math.tanh((dry[0][i] + wet[0][i] * 0.9) * 1.2) * g;
  Rt[i] = Math.tanh((dry[1][i] + wet[1][i] * 0.9) * 1.2) * g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]));
}
const norm = 0.89 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Rt[i] * norm * 32767), 46 + i * 4); }
const file = path.join(HERE, "out", "audio-paper.wav");
fs.writeFileSync(file, buf);
console.log(`音轨 → ${file}（${DUR.toFixed(1)}s，${TL.cues.length} 个音效节点，归一化系数 ${norm.toFixed(2)}）`);
