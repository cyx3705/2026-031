/**
 * 代表作品的展示图：GLB 模型 -> 等轴测渲染 -> 6 阶色阶 -> 深浅两版。
 *
 * 规则见 z-OneHistoryID/网站风格.md §2.5「模型展示图」：
 *   - 正交等轴测（SE 或 SW），统一 4 : 3，透明底，模型撑满画面；
 *   - 保留 CAD 装配颜色渲染，再按明度聚成 6 层，每层整块填色阶 B 的 0/20/40/60/80/100%；
 *   - 浅色版：最浅一层换成浅色 accent #7F5E0F；深色版：最深一层换成深色 accent #D9A441。
 *     与页面底色相同的那一层变成金色，图片就不需要底板和边框，可以直接摊在页面上。
 *
 * 这一步要浏览器（WebGL），所以和 models.py 一样在本机手动跑，产物入库：
 *   b-Site/assets/renders/<编号>-light.webp、<编号>-dark.webp
 * 构建脚本看到这两张图，就用它们替换 README 截图做封面。
 *
 * 依赖：npm i（devDependencies 里的 three、playwright）；首次还要 npx playwright install chromium
 * 用法：node b-Code/renders.mjs [编号 ...]
 * 要加模型：先用 models.py 转出 GLB，再在 site.config.json 的 showcase.renders 里登记。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SITE = path.join(ROOT, "b-Site");
const OUT = path.join(SITE, "assets/renders");
const THREE_DIR = path.dirname(path.dirname(require.resolve("three")));   // node_modules/three

const W = 1600, H = 1200, SS = 2;          // 成图 1600×1200（4 : 3），按 2 倍渲染后缩小，色阶边缘不起锯齿

// ---------------------------------------------------------------- 色阶 B（网站风格 §2.5）

const STOPS = [[0, "#121414"], [0.12, "#26231E"], [0.86, "#E2DAC6"], [1, "#FBFAF7"]];
const LEVELS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const GOLD = { light: "#7F5E0F", dark: "#D9A441" };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const unlin = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function toOklab(c) {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => unlin(Math.min(1, Math.max(0, v))));
}
const stopsLab = STOPS.map(([p, h]) => [p, toOklab(hex(h))]);
function rampB(t) {
  for (let i = 1; i < stopsLab.length; i++) {
    const [p0, c0] = stopsLab[i - 1], [p1, c1] = stopsLab[i];
    if (t <= p1) { const u = (t - p0) / (p1 - p0); return fromOklab(c0.map((v, k) => v + (c1[k] - v) * u)); }
  }
  return fromOklab(stopsLab.at(-1)[1]);
}
const to255 = (c) => c.map((v) => Math.round(v * 255));
const PALETTE = LEVELS.map((t) => to255(rampB(t)));

// ---------------------------------------------------------------- 分层

/** 一维 k-means：按明度把模型像素聚成 6 层，同一个零件落在同一层 */
function kmeans(values, k) {
  const sorted = Float32Array.from(values).sort();
  const c = Array.from({ length: k }, (_, i) => sorted[Math.floor((0.05 + 0.9 * i / (k - 1)) * (sorted.length - 1))]);
  for (let it = 0; it < 40; it++) {
    const sum = new Float64Array(k), n = new Float64Array(k);
    for (const v of values) {
      let j = 0, best = Infinity;
      for (let q = 0; q < k; q++) { const d = Math.abs(v - c[q]); if (d < best) { best = d; j = q; } }
      sum[j] += v; n[j]++;
    }
    for (let q = 0; q < k; q++) if (n[q]) c[q] = sum[q] / n[q];
  }
  return c.sort((a, b) => a - b);
}

async function stylize(png, id) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const L = new Float32Array(n);
  const sample = [];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    L[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    if (data[o + 3] > 128 && i % 3 === 0) sample.push(L[i]);
  }
  const centers = kmeans(sample, LEVELS.length);
  const layer = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let j = 0, best = Infinity;
    for (let q = 0; q < centers.length; q++) { const d = Math.abs(L[i] - centers[q]); if (d < best) { best = d; j = q; } }
    layer[i] = j;
  }
  const accentLayer = { light: LEVELS.length - 1, dark: 0 };
  for (const theme of ["light", "dark"]) {
    const pal = PALETTE.map((c, j) => (j === accentLayer[theme] ? to255(hex(GOLD[theme])) : c));
    const out = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      const c = pal[layer[i]], o = i * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = data[o + 3];
    }
    const file = path.join(OUT, `${id}-${theme}.webp`);
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .resize(W, H, { kernel: "lanczos3" })
      .webp({ quality: 88, alphaQuality: 100 })
      .toFile(file);
  }
}

// ---------------------------------------------------------------- 渲染

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const W = ${W * SS}, H = ${H * SS};
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.setClearColor(0, 0); document.body.appendChild(r.domElement);
// up：模型哪根轴朝上。y = 网页默认；z = 多数 CAD 默认；-y = 导出时上下颠倒（如 2026-001）
const UP = { y: [0, 0], z: [-Math.PI / 2, 0], "-y": [Math.PI, 0], "-z": [Math.PI / 2, 0] };
window.render = async (file, up, view, margin) => {
  const root = (await new GLTFLoader().loadAsync(file)).scene;
  root.rotation.x = (UP[up] || UP.y)[0];
  root.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: o.material.color || 0xffffff, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }); });
  root.updateMatrixWorld(true);
  const scene = new THREE.Scene(); scene.add(root);
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
  const R = box.getSize(new THREE.Vector3()).length() / 2;
  const sx = view === "SW" ? -1 : 1;                       // SE：从右前上方看；SW：从左前上方看
  const dir = new THREE.Vector3(sx, 0.8, 1).normalize();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, R * 0.01, R * 10);
  cam.position.copy(c).addScaledVector(dir, R * 4); cam.lookAt(c); cam.updateMatrixWorld();
  // 按顶点在画面里的实际范围取景，模型撑满 4 : 3
  const inv = cam.quaternion.clone().invert(), v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).sub(c).applyQuaternion(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
  });
  const a = W / H, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const hw = Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * a) * (1 + margin), hh = hw / a;
  Object.assign(cam, { left: mx - hw, right: mx + hw, top: my + hh, bottom: my - hh }); cam.updateProjectionMatrix();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.copy(c).add(new THREE.Vector3(1.5 * sx, 3, 2).multiplyScalar(R)); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.copy(c).add(new THREE.Vector3(-2 * sx, 1, -1).multiplyScalar(R)); scene.add(fill);
  r.render(scene, cam);
  return r.domElement.toDataURL("image/png");
};
window.ready = true;
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".html": "text/html" };

async function main() {
  const cfg = JSON.parse(await readFile(path.join(HERE, "site.config.json"), "utf8"));
  const only = new Set(process.argv.slice(2));
  const list = (cfg.showcase.renders || []).filter((m) => !only.size || only.has(m.id));
  if (!list.length) return console.log("showcase.renders 里没有要渲染的条目");
  await mkdir(OUT, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  ! 页面错误", e.message));
  await page.route("http://render.local/**", async (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = p === "/" ? null : p.startsWith("/three/") ? path.join(THREE_DIR, p.slice(7)) : path.join(SITE, p);
    if (!file) return route.fulfill({ body: PAGE, contentType: "text/html" });
    if (!existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ body: await readFile(file), contentType: TYPES[path.extname(file)] || "application/octet-stream" });
  });
  await page.goto("http://render.local/");
  await page.waitForFunction("window.ready");

  for (const m of list) {
    if (!existsSync(path.join(SITE, m.file))) { console.log(`  ! ${m.id} 找不到 ${m.file}，跳过`); continue; }
    const url = await page.evaluate(([f, up, view, margin]) => window.render(f, up, view, margin),
      [m.file, m.up || "y", m.view || "SE", m.margin ?? 0.04]);
    await stylize(Buffer.from(url.split(",")[1], "base64"), m.id);
    console.log(`  ✓ ${m.id}  ${m.view || "SE"}  -> assets/renders/${m.id}-light.webp / -dark.webp`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
