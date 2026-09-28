// 介绍动画的预览与离线渲染。无第三方依赖：内置静态服务器 + 无头 Chrome（CDP）+ ffmpeg。
//
//   node b-Code/intro/render.mjs --serve              起本地预览：浏览器打开打印出的地址
//   node b-Code/intro/render.mjs --at=3,20,31         只抽这几个时间点（秒）的静帧到 out/stills，检查画面
//   node b-Code/intro/render.mjs                      渲染全部帧（已存在的帧跳过，可断点续渲）
//   node b-Code/intro/render.mjs --encode             合成 out/OneHistory-intro-<主题>[-尺寸].mp4（有 out/audio.wav 就带上）
//   选项：--workers=6 并行页面数；--force 覆盖已有帧；--theme=light 浅色（默认深色）
//         --v=paper 纸本版；--size=2560x1440 输出尺寸（默认 1920x1080）
//   版本、主题与尺寸不同，帧目录、静帧、成片的文件名都分开，互不覆盖：
//         out/OneHistory-intro-dark-2560x1440.mp4、out/OneHistory-intro-light-2560x1440.mp4、out/OneHistory-intro-paper-2560x1440.mp4
//   时间表与音轨只按版本区分（深浅两版画面时间完全相同，共用 out/timeline.json、out/audio.wav）
//
// 帧序列放在系统临时目录（1080p PNG 约 1GB/分钟，2K 约 2GB），out/ 只放静帧、时间表、音轨和成片。
// 环境变量 CHROME_PATH / FFMPEG 可指定可执行文件，默认找 C:\Tools 下的，再退回 PATH。

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(HERE, "out");

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const VARIANT = args.v === "paper" ? "paper" : "";
const THEME = args.theme === "light" ? "light" : "dark";
const [SW, SH] = String(args.size || "1920x1080").split("x").map(Number);
const SIZE_TAG = SW === 1920 && SH === 1080 ? "" : `${SW}x${SH}`;
const SUFFIX = [VARIANT || THEME, SIZE_TAG].filter(Boolean).join("-");
const tag = s => (VARIANT ? `-${VARIANT}` : "") + s;
const STILLS = path.join(OUT, "stills" + (SUFFIX ? "-" + SUFFIX : ""));
const FRAMES = path.join(os.tmpdir(), "onehistory-intro-frames" + (SUFFIX ? "-" + SUFFIX : ""));
const TIMELINE = path.join(OUT, `timeline${tag("")}.json`);
const AUDIO = path.join(OUT, `audio${tag("")}.wav`);
const MOVIE = path.join(OUT, `OneHistory-intro${SUFFIX ? "-" + SUFFIX : ""}.mp4`);

const pick = (...cands) => cands.find(p => p && (p.includes(path.sep) ? fs.existsSync(p) : true));
const CHROME = pick(process.env.CHROME_PATH, "C:\\Tools\\chrome\\chrome.exe", "chrome");
const FFMPEG = pick(process.env.FFMPEG, "C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe", "ffmpeg");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 静态服务器（以仓库根为站点根，页面才能用 /b-Site/... 取数据） ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.resolve(REPO, "." + rel);
    if (!file.startsWith(REPO + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

// ---------- CDP ----------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        console.error("[页面异常]", d.exception?.description || d.text);
      } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        console.error("[页面 console.error]", m.params.args.map(a => a.value ?? a.description).join(" "));
      }
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function launchChrome() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-intro-"));
  const proc = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDir}`,
    "--hide-scrollbars", "--mute-audio", "--font-render-hinting=none",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    proc.stderr.on("data", d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
    proc.on("exit", c => rej(new Error(`Chrome 提前退出（${c}）：${buf.slice(-500)}`)));
    setTimeout(() => rej(new Error("等待 Chrome 调试端口超时")), 30000);
  });
  const cdp = new CDP(wsUrl);
  await cdp.open();
  const close = () => { try { proc.kill(); } catch {} setTimeout(() => fs.rmSync(userDir, { recursive: true, force: true }), 1500); };
  return { cdp, close };
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: SW, height: SH, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp.send("Page.navigate", { url }, sessionId);
  for (let i = 0; i < 600; i++) {
    try {
      const r = await cdp.send("Runtime.evaluate", { expression: "window.__ready === true && window.__meta", returnByValue: true }, sessionId);
      if (r.result.value) return { sessionId, meta: r.result.value };
    } catch { /* 导航中 */ }
    await sleep(100);
  }
  throw new Error("页面 60 秒内没有就绪（检查 intro.js 是否报错、字体或数据是否取到）");
}

async function grab(cdp, sessionId, frame) {
  const r = await cdp.send("Runtime.evaluate", { expression: `window.renderFrame(${frame})`, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return Buffer.from(r.result.value.split(",")[1], "base64");
}

async function renderFrames(base) {
  const workers = Math.max(1, parseInt(args.workers || "4", 10));
  const url = `${base}/b-Code/intro/preview.html?render=1&w=${SW}&h=${SH}${VARIANT ? "&v=" + VARIANT : ""}${THEME === "light" && !VARIANT ? "&theme=light" : ""}`;
  const { cdp, close } = await launchChrome();
  try {
    const pages = [];
    for (let i = 0; i < workers; i++) pages.push(await openPage(cdp, url));
    const { FPS, DUR, timeline } = pages[0].meta;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(TIMELINE, JSON.stringify({ FPS, DUR, ...timeline }, null, 2));
    console.log(`时长 ${DUR.toFixed(1)}s，聚焦模块：${timeline.spotlight.join("、")}`);

    let jobs;
    if (args.at) {
      fs.mkdirSync(STILLS, { recursive: true });
      jobs = String(args.at).split(",").map(s => {
        const sec = parseFloat(s);
        return { frame: Math.round(sec * FPS), file: path.join(STILLS, `t${sec.toFixed(2).padStart(6, "0")}.png`) };
      });
    } else if (args.meta) {
      return;
    } else {
      fs.mkdirSync(FRAMES, { recursive: true });
      const total = Math.round(DUR * FPS);
      for (const f of fs.readdirSync(FRAMES)) { // 时长变短后多出来的旧帧要清掉，否则会被合进视频
        const n = parseInt(f.slice(1), 10);
        if (n >= total) fs.rmSync(path.join(FRAMES, f));
      }
      jobs = [];
      for (let f = 0; f < total; f++) {
        const file = path.join(FRAMES, `f${String(f).padStart(5, "0")}.png`);
        if (args.force || !fs.existsSync(file)) jobs.push({ frame: f, file });
      }
    }

    const total = jobs.length;
    let done = 0, next = 0;
    const t0 = Date.now();
    console.log(`渲染 ${total} 帧，${workers} 个并行页面…`);
    await Promise.all(pages.map(async ({ sessionId }) => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const png = await grab(cdp, sessionId, job.frame);
        fs.writeFileSync(job.file + ".tmp", png);
        fs.renameSync(job.file + ".tmp", job.file);
        done++;
        if (done % 60 === 0 || done === total) {
          const el = (Date.now() - t0) / 1000;
          console.log(`  ${done}/${total}  已用 ${el.toFixed(0)}s  预计还需 ${((el / done) * (total - done)).toFixed(0)}s`);
        }
      }
    }));
  } finally {
    close();
  }
}

function encode() {
  const audio = AUDIO;
  const out = MOVIE;
  const withAudio = fs.existsSync(audio);
  const a = ["-y", "-hide_banner", "-loglevel", "warning", "-stats", "-framerate", "30", "-i", path.join(FRAMES, "f%05d.png")];
  if (withAudio) a.push("-i", audio);
  a.push("-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  if (withAudio) a.push("-c:a", "aac", "-b:a", "256k", "-shortest");
  a.push(out);
  console.log(`合成 → ${out}${withAudio ? "（含音轨）" : "（无音轨）"}`);
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, a, { stdio: "inherit" });
    p.on("exit", c => (c === 0 ? res() : rej(new Error(`ffmpeg 退出码 ${c}`))));
  });
}

try {
  if (args.encode) {
    await encode();
  } else {
    const server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    if (args.serve) {
      console.log(`预览：${base}/b-Code/intro/preview.html${VARIANT ? "?v=" + VARIANT : ""}   （?t=20 跳到第 20 秒，?v=paper 纸本版，?theme=light 浅色，空格暂停）`);
    } else {
      await renderFrames(base);
      server.close();
    }
  }
} catch (e) {
  console.error("失败：", e.message);
  process.exit(1);
}
