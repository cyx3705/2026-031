// 介绍动画的程序化配乐：120 BPM 的 D 大调电子律动，时间全部读 out/timeline.json（由 render.mjs 导出）
// 画面的脉动与这里的底鼓用同一张表（timeline.kicks），段落落点、模块聚焦、搜索命中都踩在拍子上。
//
//   开卷 0–6s        铺底 + 字标钟声，无鼓
//   编号 6–12s       半拍底鼓 → 四拍 → 一小节军鼓滚奏 + 上扬，落进
//   第一个年份       全套鼓组 + 滚动贝斯 + 八分琶音，扫光一张卡一个音
//   模块家族         十六分琶音；每个模块一小节，聚焦那一拍有总线「嗖」声；全员上线两小节加镲
//   最新年份 / 搜索  搜索段抽掉底鼓只留踩镲，命中那一拍砸回来
//   模板             四拍重新推起来，枝条到达叮叮当当；最后两小节滚奏 + 上扬
//   汇聚 → 落点      全场收声一个八分音符，然后最重的一下：低频下潜 + 镲 + 和弦
//
// 输出 out/audio.wav（48kHz 16bit 立体声）。纯 Node，无依赖。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(fs.readFileSync(path.join(HERE, "out", "timeline.json"), "utf8"));
const S = TL.S, DUR = TL.DUR, SR = 48000, N = Math.ceil(DUR * SR);
const BEAT = TL.beat, BAR = TL.bar, KICKS = TL.kicks;
const M = TL.spotlight.length;
const MOD_END = S.mod + TL.focus0 + M * TL.dwell;          // 全员上线

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = mulberry32(31);
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const noise = () => R() * 2 - 1;

// 三条总线：drum（干、不压）、music（被底鼓侧链压）、fx（事件音效）；各自再按比例送混响
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drum = bus(), music = bus(), fx = bus(), send = bus();
function put(b, i, s, p, wet) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan(p);
  b[0][i] += s * gl; b[1][i] += s * gr;
  if (wet) { send[0][i] += s * gl * wet; send[1][i] += s * gr * wet; }
}

// ---------- 段落判断 ----------
const inRange = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;
const FULL = t => inRange(t, S.y1, S.search) || inRange(t, S.tpl, S.end);   // 全套鼓组
const beatsIn = (a, b, step) => { const out = []; for (let t = a; t < b - 1e-6; t += step) out.push(+t.toFixed(4)); return out; };

// ---------- 和弦进行（每小节一个） ----------
const CH = {
  Dmaj9: [38, [50, 57, 61, 64, 66]], Bm9: [35, [47, 54, 57, 61, 62]], Gmaj7: [43, [55, 59, 62, 66]],
  Em9: [40, [52, 55, 59, 62, 66]], Asus: [45, [52, 57, 62, 64]], A: [45, [52, 57, 61, 64]],
  Fsm7: [42, [54, 57, 61, 64]], Gmaj9: [43, [55, 57, 62, 66]], D: [38, [50, 57, 62, 66]],
  Bm: [35, [47, 54, 59, 62]], G: [43, [55, 59, 62, 67]], Em: [40, [52, 55, 59, 64]],
};
const prog = [[0, "Dmaj9"], [4, "Bm9"], [S.num, "Gmaj7"], [S.num + 2, "Em9"], [S.num + 4, "Asus"], [S.y1 - 1, "A"]];
["D", "Bm", "G", "A"].forEach((c, i) => prog.push([S.y1 + i * BAR, c]));
for (let t = S.mod, i = 0; t < S.wall - 1e-6; t += BAR, i++) prog.push([t, ["Bm", "G", "D", "A"][i % 4]]);
prog.push([S.wall, "G"], [S.wall + BAR, "A"]);
prog.push([S.search, "Em9"], [S.search + BAR, "Fsm7"], [S.search + 2 * BAR, "Gmaj9"]);
prog.push([S.tpl, "G"], [S.tpl + BAR, "Em"], [S.tpl + 2 * BAR, "Asus"], [S.end, "A"], [S.drop, "Dmaj9"]);
const chordAt = t => { let c = prog[0][1]; for (const [t0, n] of prog) if (t >= t0 - 1e-6) c = n; return CH[c]; };

// ---------- 侧链包络 ----------
const duck = new Float32Array(N).fill(1);
for (const k of KICKS) {
  const i0 = Math.floor(k * SR);
  for (let j = 0; j < SR * 0.45; j++) {
    const i = i0 + j; if (i >= N) break;
    const lt = j / SR, e = Math.min(1, lt / 0.004) * Math.exp(-lt * 9);
    duck[i] = Math.min(duck[i], 1 - 0.62 * (lt < 0.004 ? lt / 0.004 : e));
  }
}

// ---------- 鼓 ----------
function kickDrum(t0, amp) {
  const i0 = Math.floor(t0 * SR); let ph = 0;
  for (let j = 0; j < SR * 0.42; j++) {
    const lt = j / SR, f = 46 + 130 * Math.exp(-lt * 38);
    ph += TAU * f / SR;
    let s = Math.sin(ph) * Math.exp(-lt * 7.5) * Math.min(1, lt * 2000);
    if (lt < 0.004) s += noise() * 0.35 * (1 - lt / 0.004);               // 敲击声
    put(drum, i0 + j, Math.tanh(s * 1.4) * amp, 0, 0.02);
  }
}
function svfNoise(t0, len, fc, q, envRate, amp, p, wet, kind = "band") {
  let low = 0, band = 0; const F = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR), i0 = Math.floor(t0 * SR);
  for (let j = 0; j < SR * len; j++) {
    const x = noise(); low += F * band; const high = x - low - q * band; band += F * high;
    const lt = j / SR, v = kind === "high" ? high : kind === "low" ? low : band;
    put(drum, i0 + j, v * amp * Math.exp(-lt * envRate) * Math.min(1, lt * 3000), p, wet);
  }
}
const clap = (t0, amp) => { [0, 0.011, 0.022].forEach((d, k) => svfNoise(t0 + d, k === 2 ? 0.22 : 0.012, 1400, 0.5, k === 2 ? 22 : 200, amp, 0.05, 0.25)); };
const hat = (t0, amp, p) => svfNoise(t0, 0.06, 9000, 0.6, 75, amp, p, 0.05, "high");
const openHat = (t0, amp, p) => svfNoise(t0, 0.32, 8500, 0.5, 11, amp, p, 0.1, "high");
function snare(t0, amp, p = 0) {
  svfNoise(t0, 0.16, 2200, 0.7, 26, amp, p, 0.2);
  const i0 = Math.floor(t0 * SR);
  for (let j = 0; j < SR * 0.08; j++) { const lt = j / SR; put(drum, i0 + j, Math.sin(TAU * 190 * lt) * Math.exp(-lt * 40) * amp * 0.6, p, 0.1); }
}
function crash(t0, amp) {
  for (const p of [-0.5, 0.5]) svfNoise(t0, 3.2, 7000 + (p > 0 ? 900 : 0), 0.4, 1.3, amp, p, 0.5, "high");
}
function boom(t0, amp, len = 2.6) { // 低频下潜
  const i0 = Math.floor(t0 * SR); let ph = 0;
  for (let j = 0; j < SR * len; j++) {
    const lt = j / SR, f = 32 + 90 * Math.exp(-lt * 7); ph += TAU * f / SR;
    put(drum, i0 + j, Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-lt * 1.6) * Math.min(1, lt * 800) * amp, 0, 0.1);
  }
}
function riser(t0, t1, f0, f1, amp) {
  let low = 0, band = 0; const i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR);
  for (let j = 0; j < n; j++) {
    const u = j / n, fc = f0 * Math.pow(f1 / f0, u), F = 2 * Math.sin(Math.PI * fc / SR);
    const x = noise(); low += F * band; const high = x - low - 0.35 * band; band += F * high;
    put(fx, i0 + j, band * amp * Math.pow(u, 1.8), Math.sin(u * 9) * 0.4, 0.5);
  }
}
function roll(t0, t1, amp0, amp1, step0, step1) { // 军鼓滚奏：越来越密、越来越响
  for (let t = t0; t < t1 - 1e-4;) {
    const u = (t - t0) / (t1 - t0);
    snare(t, amp0 + (amp1 - amp0) * u * u, (R() - 0.5) * 0.3);
    t += step0 + (step1 - step0) * u;
  }
}

// ---------- 旋律音色 ----------
function pluck(t0, midi, amp, p, decay = 7, wet = 0.35, h = 8, b = music) {
  const f = mtof(midi), i0 = Math.floor(t0 * SR), len = Math.floor(SR * Math.min(1.2, 6 / decay));
  for (let j = 0; j < len; j++) {
    const lt = j / SR; let s = 0;
    for (let k = 1; k <= h; k++) s += Math.sin(TAU * f * k * lt) / k * Math.exp(-lt * (decay + k * 5));
    put(b, i0 + j, s * amp * Math.min(1, lt * 1500), p, wet);
  }
}
function bassNote(t0, midi, amp, len) {
  const f = mtof(midi), i0 = Math.floor(t0 * SR);
  for (let j = 0; j < SR * len; j++) {
    const lt = j / SR, env = Math.min(1, lt * 800) * Math.exp(-lt * 9) * (1 - smooth(len - 0.02, len, lt));
    let s = Math.sin(TAU * f * lt) * 0.6;                                       // 基音
    for (let k = 2; k <= 9; k++) s += Math.sin(TAU * f * k * lt) / k * Math.exp(-lt * (12 + k * 6)) * 1.3;   // 滤波包络
    put(music, i0 + j, Math.tanh(s * 1.3) * env * amp, 0, 0.03);
  }
}
function bell(t0, midi, amp, p, decay = 3, partials = [[1, 1], [2, 0.22], [3.01, 0.07]]) {
  const f = mtof(midi), i0 = Math.floor(t0 * SR), len = Math.floor(SR * Math.min(6, 7 / decay));
  for (let j = 0; j < len; j++) {
    const lt = j / SR, env = Math.min(1, lt * 500) * Math.exp(-lt * decay);
    let s = 0; for (const [r, a] of partials) s += Math.sin(TAU * f * r * lt) * a;
    put(fx, i0 + j, s * env * amp, p, 0.8);
  }
}
function click(t0, amp, p) { svfNoise(t0, 0.05, 3200, 0.5, 90, amp, p, 0.15); }
function zap(t0, amp, p) { // 总线「嗖」：下滑正弦 + 一点噪声
  const i0 = Math.floor(t0 * SR); let ph = 0;
  for (let j = 0; j < SR * 0.22; j++) {
    const lt = j / SR, f = 2400 * Math.exp(-lt * 16) + 300; ph += TAU * f / SR;
    put(fx, i0 + j, Math.sin(ph) * Math.exp(-lt * 14) * amp, p, 0.4);
  }
}

// ---------- 铺底 ----------
prog.forEach(([t0, name], c) => {
  const t1 = c + 1 < prog.length ? prog[c + 1][0] : DUR;
  const last = c === prog.length - 1;
  const [root, tones] = CH[name];
  [root + 12, ...tones].forEach((m, vi, arr) => {
    const f = mtof(m), p = (vi / (arr.length - 1) - 0.5) * 1.2;
    const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t1 + 0.6) * SR));
    for (let i = i0; i < i1; i++) {
      const t = i / SR, lt = t - t0;
      const env = smooth(0, last ? 0.02 : 0.25, lt) * (1 - smooth(t1, t1 + 0.6, t)) * (m < 52 ? 0.7 : 0.5);
      if (env <= 0) continue;
      // 亮度：开场暗，律动段亮，搜索段收暗，落点最亮
      const bright = 0.25 + 0.18 * smooth(S.y1 - 2, S.y1, t) - 0.15 * (inRange(t, S.search, S.tpl) ? 1 : 0) + 0.2 * smooth(S.drop, S.drop + 0.05, t);
      let s = 0;
      for (const det of [-0.0021, 0.0023]) {
        let amp = 1;
        for (let h = 1; h <= 5; h++) { s += Math.sin(TAU * f * (1 + det) * h * t + h * vi) * amp / h; amp *= bright; }
      }
      const lvl = t < S.num ? 0.045 : t >= S.drop ? 0.055 : 0.038;
      put(music, i, s * env * lvl * (1 + 0.08 * Math.sin(TAU * 0.21 * t + vi)), p, 0.7);
    }
  });
});

// ---------- 鼓组编排 ----------
for (const k of KICKS) kickDrum(k, k === S.drop ? 1.0 : FULL(k) ? 0.72 : 0.62);
for (const t of beatsIn(S.y1, S.search, BAR / 2)) clap(t + BEAT, 0.6);                   // 二、四拍
for (const t of beatsIn(S.tpl, S.end, BAR / 2)) clap(t + BEAT, 0.6);
for (const t of beatsIn(S.num + 2, S.y1 - 1, BEAT / 2)) hat(t, 0.10 * (t % BEAT < 1e-3 ? 0.6 : 1), 0.3);  // 编号段八分踩镲
for (const t of beatsIn(S.y1, S.search, BEAT / 4)) {                                       // 十六分踩镲 + 反拍开镲
  const pos = Math.round((t - S.y1) / (BEAT / 4)) % 4;
  hat(t, [0.07, 0.05, 0.12, 0.05][pos], 0.35);
  if (pos === 2) openHat(t, 0.06, -0.3);
}
for (const t of beatsIn(S.search, S.tpl, BEAT / 4)) hat(t, 0.045 * (Math.round((t - S.search) / (BEAT / 4)) % 2 ? 0.6 : 1), 0.4);
for (const t of beatsIn(S.tpl, S.end, BEAT / 4)) {
  const pos = Math.round((t - S.tpl) / (BEAT / 4)) % 4;
  hat(t, [0.07, 0.05, 0.12, 0.05][pos], 0.35);
  if (pos === 2) openHat(t, 0.06, -0.3);
}
roll(S.y1 - 1, S.y1, 0.05, 0.28, BEAT / 4, BEAT / 8);                                     // 进第一个年份
riser(S.y1 - 2, S.y1, 300, 7000, 0.10);
roll(MOD_END - 1, MOD_END, 0.04, 0.2, BEAT / 4, BEAT / 4);                                 // 进全员上线
roll(S.end - BAR, S.end, 0.05, 0.2, BEAT / 4, BEAT / 4);                                   // 最后两小节 → 汇聚
roll(S.end, S.drop - BEAT / 2, 0.18, 0.4, BEAT / 8, BEAT / 12);
riser(S.end - 2 * BAR, S.drop - BEAT / 2, 200, 9000, 0.16);
[[S.y1, 0.16], [S.mod, 0.1], [MOD_END, 0.14], [MOD_END + BAR, 0.08], [S.wall, 0.1], [S.search + 2.5, 0.1], [S.tpl, 0.1], [S.drop, 0.2]]
  .forEach(([t, a]) => crash(t, a));
boom(S.y1, 0.5); boom(S.search + 2.5, 0.35, 1.6); boom(S.drop, 0.9, 3.5);

// ---------- 贝斯 ----------
// 律动段：每拍后三个十六分（让开底鼓）；编号段四拍那一下：反拍八分；搜索段命中后：只在反拍
for (const t of beatsIn(S.num + 4, S.y1 - 1, BEAT)) bassNote(t + BEAT / 2, chordAt(t)[0], 0.3, 0.2);
const rolling = (a, b) => { for (const t of beatsIn(a, b, BEAT)) [1, 2, 3].forEach(k => bassNote(t + k * BEAT / 4, chordAt(t)[0] + (k === 2 ? 12 : 0), k === 2 ? 0.22 : 0.3, 0.1)); };
rolling(S.y1, S.search); rolling(S.tpl, S.end);
for (const t of beatsIn(S.search + 2.5, S.tpl, BEAT)) bassNote(t + BEAT / 2, chordAt(t)[0], 0.26, 0.2);
for (const t of beatsIn(S.end, S.drop - BEAT / 2, BEAT / 4)) bassNote(t, chordAt(t)[0] + (Math.round(t / (BEAT / 4)) % 2 ? 12 : 0), 0.18 + 0.12 * (t - S.end) / BAR, 0.1);
bassNote(S.drop, 38, 0.45, 1.8);

// ---------- 琶音 ----------
function arp(a, b, step, amp, oct = 12) {
  for (const t of beatsIn(a, b, step)) {
    const [, tones] = chordAt(t), idx = Math.round((t - a) / step);
    const seq = [0, 1, 2, 3, 2, 1, 3, 4];
    const m = tones[seq[idx % seq.length] % tones.length] + oct + (idx % 16 >= 8 ? 12 : 0);
    const accent = idx % 4 === 0 ? 1.25 : 1;
    pluck(t, m, amp * accent, idx % 2 ? 0.45 : -0.45, 9, 0.3, 6);
  }
}
arp(S.y1, S.mod, BEAT / 2, 0.18);
arp(S.mod, S.wall, BEAT / 4, 0.15);
arp(S.wall, S.search, BEAT / 4, 0.16);
arp(S.search, S.tpl, BEAT / 2, 0.12, 24);
arp(S.tpl, S.end, BEAT / 4, 0.16);

// ---------- 画面事件 ----------
const penta = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95];                                   // D 大调五声
bell(1.5, 74, 0.05, -0.2, 1.2); bell(1.56, 78, 0.04, 0.1, 1.2); bell(1.62, 81, 0.035, 0.3, 1.2); bell(2.0, 86, 0.03, 0, 1.5);  // 字标
for (let k = 1; k <= 8; k++) click(S.num + 1.25 + k * BEAT / 4, 0.16, -0.1 + k * 0.03);  // 打出编号
bell(S.num + 2.5, 81, 0.05, -0.3, 2.5); bell(S.num + 3.0, 86, 0.05, 0.3, 2.5);           // 年份 / 序号
boom(S.num + 4, 0.25, 1.2); [74, 78, 81, 86].forEach((m, j) => bell(S.num + 4 + j * 0.02, m, 0.035, j / 2 - 0.75, 2)); // 计数砸出
for (let i = 0; i < TL.count; i += 2) bell(S.num + 4 + i * 0.02, penta[Math.min(penta.length - 1, Math.floor(i / TL.count * penta.length))], 0.014, i / TL.count * 1.6 - 0.8, 5);
for (let j = 0; j < TL.firstYearCount; j++)                                               // 扫光：一张卡一个音
  pluck(S.y1 + TL.sweep0 + j * TL.sweep, penta[3 + (j % 6)], 0.05, (j % 5) / 2 - 1, 5, 0.6, 4, fx);
TL.spotlight.forEach((_, j) => {                                                          // 模块逐个聚焦
  const t = S.mod + TL.focus0 + j * TL.dwell;
  zap(t, 0.06, j % 2 ? 0.4 : -0.4);
  bell(t, [86, 88, 90, 93, 95, 93, 90, 88, 86][j % 9], 0.035, j % 2 ? 0.35 : -0.35, 2.2);
});
for (let i = 0; i < M; i++) pluck(MOD_END + 0.1 + i * BEAT / 4, penta[i % penta.length] + 12, 0.035, (i / M) * 1.6 - 0.8, 6, 0.6, 3, fx);  // 全家福逐格弹出
for (let j = 0; j < TL.lastYearCount; j += 2) bell(S.wall + j * 0.02, penta[(j * 3) % penta.length], 0.01, ((j * 7) % 10) / 5 - 1, 6);
for (let k = 1; k <= TL.typed; k++) click(S.search + 0.5 + k * BEAT / 2, 0.2, 0);        // 搜索框输入
[86, 90, 93].forEach((m, j) => bell(S.search + 2.5 + j * 0.03, m, 0.045, j - 1, 2));       // 命中落定
TL.branchTimes.forEach((t, i) => { if (i % 2 === 0) bell(t, penta[4 + (i % 6)], 0.011, (i / TL.branchTimes.length) * 1.6 - 0.8, 4); });
bell(S.tpl + 4, 81, 0.04, 0.5, 2.2);                                                      // 外部仓库登场
[[62, -0.4], [66, 0.3], [69, -0.1], [74, 0.5], [78, -0.6], [81, 0.2]]                     // 落点和弦
  .forEach(([m, p], j) => { bell(S.drop + j * 0.02, m, 0.06, p, 0.7, [[1, 1], [2.76, 0.28], [5.4, 0.1]]); pluck(S.drop, m, 0.05, p, 1.5, 0.6, 8, fx); });
[93, 90, 86, 81].forEach((m, j) => bell(S.drop + 1 + j * BEAT / 2, m, 0.025, j % 2 ? 0.4 : -0.4, 1.5));  // 字标落定后的余韵

// ---------- 混响 + 总线 ----------
function reverb(inp, off) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(l => Math.round((l + off) * SR / 44100));
  for (const len of combs) {
    const buf = new Float32Array(len); let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) { const y = buf[idx]; filt = y * 0.7 + filt * 0.3; buf[idx] = inp[i] + filt * 0.84; out[i] += y / combs.length; if (++idx >= len) idx = 0; }
  }
  for (const l of [556, 441, 341]) {
    const len = Math.round((l + off) * SR / 44100), buf = new Float32Array(len); let idx = 0;
    for (let i = 0; i < N; i++) { const b = buf[idx], x = out[i]; out[i] = -x + b; buf[idx] = x + b * 0.5; if (++idx >= len) idx = 0; }
  }
  return out;
}
const wet = [reverb(send[0], 0), reverb(send[1], 23)];
const L = new Float32Array(N), Rt = new Float32Array(N);
const gap0 = Math.floor((S.drop - BEAT / 2) * SR), gap1 = Math.floor(S.drop * SR);          // 落点前收声一个八分音符
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, g = smooth(0, 0.3, t) * (1 - smooth(DUR - 3, DUR, t));
  const gate = i >= gap0 && i < gap1 ? 0.08 : 1;
  for (let c = 0; c < 2; c++) {
    const m = music[c][i] * duck[i] + drum[c][i] + fx[c][i] * 1.5 + wet[c][i] * 0.9 * (i >= gap0 && i < gap1 ? 1 : duck[i] * 0.5 + 0.5);
    const v = Math.tanh(m * 1.15 * gate) * g;
    (c ? Rt : L)[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
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
console.log(`音轨 → ${file}（${DUR.toFixed(1)}s，${TL.bpm} BPM，${KICKS.length} 下底鼓，归一化系数 ${norm.toFixed(2)}）`);
