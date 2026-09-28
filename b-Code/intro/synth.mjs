// 介绍动画的程序化配乐：D 大调铺底 + 各段节点音效，时间全部读 out/timeline.json（由 render.mjs 导出）
// 输出 out/audio.wav（48kHz 16bit 立体声）。纯 Node，无依赖。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(fs.readFileSync(path.join(HERE, "out", "timeline.json"), "utf8"));
const S = TL.S, DUR = TL.DUR, SR = 48000, N = Math.ceil(DUR * SR);

const dry = [new Float32Array(N), new Float32Array(N)];
const send = [new Float32Array(N), new Float32Array(N)];
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = mulberry32(31);
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
function add(i, s, p, wet = 1, dryAmt = 0.55) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan(p);
  send[0][i] += s * gl * wet; send[1][i] += s * gr * wet;
  dry[0][i] += s * gl * dryAmt; dry[1][i] += s * gr * dryAmt;
}

// ---------- 和弦铺底 ----------
const CH = {
  Dmaj7: [38, 50, 57, 61, 66], Bm9: [35, 47, 54, 61, 62], Gmaj7: [43, 55, 59, 62, 66], Em9: [40, 52, 59, 62, 66],
  Asus: [45, 52, 57, 62, 64], Dmaj9: [38, 50, 57, 64, 66, 69], Bm7: [35, 47, 54, 57, 62], Fsm7: [42, 54, 57, 61, 64],
  Gmaj9: [43, 55, 57, 62, 66], A: [45, 52, 57, 61, 64],
};
const prog = [[0, "Dmaj7"], [S.num, "Bm9"], [S.y1, "Gmaj7"]];
const modCycle = ["Em9", "Asus", "Dmaj9", "Bm7"];
for (let t = S.mod, i = 0; t < S.wall - 0.5; t += TL.dwell * 2, i++) prog.push([t, modCycle[i % modCycle.length]]);
prog.push([S.wall, "Gmaj7"], [S.wall + 2.5, "A"], [S.search, "Fsm7"], [S.tpl, "Gmaj9"], [S.tpl + 3, "A"], [S.end + 1.4, "Dmaj9"]);

prog.forEach(([t0, name], c) => {
  const t1 = c + 1 < prog.length ? prog[c + 1][0] : DUR;
  const last = c === prog.length - 1;
  CH[name].forEach((m, vi, arr) => {
    const f = mtof(m), p = (vi / (arr.length - 1) - 0.5) * 1.2;
    const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t1 + 1.8) * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR, lt = t - t0;
      const env = smooth(0, last ? 0.08 : 1.4, lt) * (1 - smooth(t1, t1 + 1.8, t)) * (m < 48 ? 0.8 : 0.5);
      if (env <= 0) continue;
      const bright = 0.28 + 0.2 * smooth(0, 20, t) + 0.2 * smooth(S.end + 1.3, S.end + 1.6, t);
      let s = 0;
      for (const det of [-0.0017, 0.0019]) {
        let amp = 1;
        for (let h = 1; h <= 5; h++) { s += Math.sin(TAU * f * (1 + det) * h * t + h * vi) * amp / h; amp *= bright; }
      }
      s *= env * (1 + 0.1 * Math.sin(TAU * 0.21 * t + vi)) * 0.03;
      add(i, s, p, 1, 0.45);
    }
  });
});

// ---------- 音色 ----------
function bell(t0, midi, amp, p, decay = 3, partials = [[1, 1], [2, 0.22], [3.01, 0.07]]) {
  const f = mtof(midi), i0 = Math.floor(t0 * SR), len = Math.floor(SR * Math.min(6, 7 / decay));
  for (let k = 0; k < len; k++) {
    const lt = k / SR, env = Math.min(1, lt * 500) * Math.exp(-lt * decay);
    let s = 0;
    for (const [r, a] of partials) s += Math.sin(TAU * f * r * lt) * a;
    add(i0 + k, s * env * amp, p, 1, 0.6);
  }
}
function click(t0, amp, p) { // 键盘声：短促带通噪声
  let low = 0, band = 0;
  const F = 2 * Math.sin(Math.PI * 3200 / SR), i0 = Math.floor(t0 * SR);
  for (let k = 0; k < SR * 0.05; k++) {
    const x = R() * 2 - 1; low += F * band; const high = x - low - 0.5 * band; band += F * high;
    add(i0 + k, band * amp * Math.exp(-k / SR * 90), p, 0.3, 1);
  }
}
function sweep(t0, dur, f0, f1, amp, p0, p1, q = 0.4, shape = k => Math.sin(Math.PI * k)) {
  let low = 0, band = 0;
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let k = 0; k < n; k++) {
    const u = k / n, fc = f0 * Math.pow(f1 / f0, u), F = 2 * Math.sin(Math.PI * fc / SR);
    const x = R() * 2 - 1; low += F * band; const high = x - low - q * band; band += F * high;
    add(i0 + k, band * amp * shape(u), p0 + (p1 - p0) * u, 1, 0.8);
  }
}
const penta = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95]; // D 大调五声

// ---------- 节点音效 ----------
bell(1.6, 74, 0.05, -0.2, 1.4); bell(1.65, 78, 0.04, 0.1, 1.4); bell(1.7, 81, 0.035, 0.3, 1.4); // Logo 浮现
for (let i = 0; i < 8; i++) click(S.num + 1.2 + i * 0.15, 0.12, -0.1 + i * 0.03);                // 打出编号
bell(S.num + 2.6, 81, 0.045, -0.3, 2.5); bell(S.num + 3.0, 86, 0.045, 0.3, 2.5);                  // 年份 / 序号
for (let i = 0; i < TL.count; i += 2) bell(S.num + 4.1 + i * 0.02, penta[Math.min(penta.length - 1, Math.floor(i / TL.count * penta.length))], 0.018, i / TL.count * 1.6 - 0.8, 5);
for (let j = 0; j < TL.firstYearCount; j++) bell(S.y1 + 0.35 + j * 0.05, penta[j % 5], 0.014, (j % 5) / 2 - 1, 6);
const sw = 3.8 / Math.max(1, TL.firstYearCount);
for (let j = 0; j < TL.firstYearCount; j++) bell(S.y1 + 1.7 + j * sw, penta[3 + (j % 5)], 0.02, (j % 5) / 2 - 1, 3.5);
TL.spotlight.forEach((_, j) => {                                                                  // 模块逐个聚焦
  const t = S.mod + 2.2 + j * TL.dwell;
  sweep(t - 0.25, 0.5, 900, 3200, 0.05, -0.4, 0.4);
  bell(t, [74, 78, 81, 83, 86, 88, 90, 93, 95][j % 9], 0.05, j % 2 ? 0.35 : -0.35, 1.8);
});
for (let j = 0; j < TL.lastYearCount; j += 2) bell(S.wall + 0.25 + j * 0.025, penta[(j * 3) % penta.length], 0.012, ((j * 7) % 10) / 5 - 1, 6);
for (let i = 0; i < 3; i++) click(S.search + 0.75 + i * 0.23, 0.16, 0);                          // 搜索框输入 AGV
bell(S.search + 2.6, 86, 0.05, -0.2, 2); bell(S.search + 2.64, 90, 0.04, 0.2, 2);
TL.branchTimes.forEach((t, i) => { if (i % 2 === 0) bell(t, penta[4 + (i % 6)], 0.012, (i / TL.branchTimes.length) * 1.6 - 0.8, 4); });
bell(S.tpl + 3.7, 81, 0.04, 0.5, 2.2);                                                            // 外部仓库登场
sweep(S.end, 1.4, 250, 6000, 0.12, -0.3, 0.3, 0.4, k => Math.pow(k, 2));                          // 合卷上扬
{ // 汇聚落点：低频 + 钟声和弦
  const i0 = Math.floor((S.end + 1.4) * SR); let ph = 0;
  for (let k = 0; k < SR * 2.5; k++) { const lt = k / SR, f = 40 + 55 * Math.exp(-lt * 9); ph += TAU * f / SR; const s = Math.sin(ph) * Math.exp(-lt * 2.3) * Math.min(1, lt * 300) * 0.5; add(i0 + k, s, 0, 0.1, 1); }
  [[62, -0.4], [66, 0.3], [69, -0.1], [74, 0.5], [78, -0.6]].forEach(([m, p], j) => bell(S.end + 1.4 + j * 0.03, m, 0.06, p, 0.8, [[1, 1], [2.76, 0.28], [5.4, 0.1]]));
}

// ---------- 混响 + 总线 ----------
function reverb(inp, off) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(l => Math.round((l + off) * SR / 44100));
  for (const len of combs) {
    const buf = new Float32Array(len); let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) { const y = buf[idx]; filt = y * 0.75 + filt * 0.25; buf[idx] = inp[i] + filt * 0.86; out[i] += y / combs.length; if (++idx >= len) idx = 0; }
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
  const t = i / SR, g = smooth(0, 0.8, t) * (1 - smooth(DUR - 3, DUR, t));
  L[i] = Math.tanh((dry[0][i] + send[0][i] * 0.4 + wet[0][i] * 1.1) * 1.3) * g;
  Rt[i] = Math.tanh((dry[1][i] + send[1][i] * 0.4 + wet[1][i] * 1.1) * 1.3) * g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]));
}
const norm = 0.89 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Rt[i] * norm * 32767), 46 + i * 4); }
const file = path.join(HERE, "out", "audio.wav");
fs.writeFileSync(file, buf);
console.log(`音轨 → ${file}（${DUR.toFixed(1)}s，归一化系数 ${norm.toFixed(2)}）`);
