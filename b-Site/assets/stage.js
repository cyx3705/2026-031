/* OneHistory 首页的 3D：首屏的拆装动画，以及「模型展示」选页。
   three.js 由 index.html 的 importmap 指到 CDN。
   对外只有 Stage：new Stage(容器, 选项)，stage.show(模型) 切换。

   拆装动画是通用的「爆炸图」：把装配里每个零件拿出来，按它离整机中心的方向推开，
   外圈的先走、内圈的后走，拆开停一会儿再按反序装回去。任何 STEP 装配都能直接用，
   不需要在 CAD 里另做动画。

   画面是 6 阶风格（网站风格 §2.5.2，与 renders.mjs 出的静态展示图同一套）：
   场景先按装配颜色渲染到离屏纹理，再由一道后处理按明度分成 6 层，每层整块填色阶 B 的一档；
   与页面底色相同的那一层换成金色（浅色主题最浅层、深色主题最深层），金色取页面的 --accent。
   分层阈值在每个模型第一次出现时按画面明度聚类算出，同一个零件总落在同一层。 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = new GLTFLoader();
const files = new Map();                       // 同一个 GLB 只下载一次

/** 一轮拆装的时间表（秒）：装好停 → 拆开 → 拆开停 → 装回 → 装好停 */
const T = { hold: 1.4, out: 2.2, open: 2.8, back: 2.2, rest: 1.4 };
export const CYCLE = T.hold + T.out + T.open + T.back + T.rest;
const STAGGER = 0.35;                          // 外圈零件比内圈早走的比例

/** 色阶 B 上的 6 档（0/20/40/60/80/100%），sRGB */
const LEVELS = ["#121414", "#37342D", "#676258", "#9A9486", "#D1C9B7", "#FBFAF7"];
const ACCENT_FALLBACK = { light: "#7F5E0F", dark: "#D9A441" };

const POST_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
  uniform sampler2D tColor; uniform float thr[5]; uniform vec3 pal[6]; varying vec2 vUv;
  float toSrgb(float c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
  void main() {
    vec4 c = texture2D(tColor, vUv);
    if (c.a < 0.004) { gl_FragColor = vec4(0.0); return; }
    vec3 rgb = c.rgb / c.a;
    float L = 0.2126 * toSrgb(rgb.r) + 0.7152 * toSrgb(rgb.g) + 0.0722 * toSrgb(rgb.b);
    vec3 col = pal[5];
    for (int i = 4; i >= 0; i--) if (L < thr[i]) col = pal[i];
    gl_FragColor = vec4(col * c.a, c.a);
  }`;

/** 一维 k-means：明度聚成 k 层，返回相邻两层中心的中点（k-1 个阈值） */
function thresholds(values, k) {
  const sorted = Float32Array.from(values).sort();
  if (!sorted.length) return [0.2, 0.4, 0.6, 0.8, 0.9];
  const c = Array.from({ length: k }, (_, i) => sorted[Math.floor((0.05 + 0.9 * i / (k - 1)) * (sorted.length - 1))]);
  for (let it = 0; it < 30; it++) {
    const sum = new Float64Array(k), n = new Float64Array(k);
    for (const v of sorted) {
      let j = 0, best = Infinity;
      for (let q = 0; q < k; q++) { const d = Math.abs(v - c[q]); if (d < best) { best = d; j = q; } }
      sum[j] += v; n[j]++;
    }
    for (let q = 0; q < k; q++) if (n[q]) c[q] = sum[q] / n[q];
  }
  c.sort((a, b) => a - b);
  return c.slice(1).map((v, i) => (v + c[i]) / 2);
}

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** 时间 -> 拆开程度 0..1 */
function phase(t) {
  let u = t % CYCLE;
  if ((u -= T.hold) < 0) return 0;
  if (u < T.out) return u / T.out;
  if ((u -= T.out) < T.open) return 1;
  if ((u -= T.open) < T.back) return 1 - u / T.back;
  return 0;
}

function loadFile(file, onProgress) {
  if (!files.has(file)) {
    files.set(file, new Promise((ok, fail) => loader.load(file, ok, onProgress, fail)));
  }
  return files.get(file);
}

/**
 * GLB -> 可拆装的模型。
 * Z 朝上（多数 CAD）转成 Y 朝上，居中，缩放到最长边 = 2；
 * 所有零件拍平到同一个组里，各自记下装配位置 base 和拆开时的位移 off。
 */
function prepare(gltf, m) {
  const holder = new THREE.Group();
  holder.add(gltf.scene);
  if (m.up === "z") holder.rotation.x = -Math.PI / 2;
  if (m.up === "-y") holder.rotation.x = Math.PI;      // 导出时上下颠倒的模型
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2 / Math.max(size.x, size.y, size.z);
  const norm = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

  const meshes = [];
  holder.traverse((o) => { if (o.isMesh) meshes.push(o); });

  const parts = new THREE.Group();
  for (const mesh of meshes) {
    const mtx = norm.clone().multiply(mesh.matrixWorld);
    mesh.removeFromParent();
    mtx.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // 只保留装配颜色：6 阶分层看的是明度，金属感、透明度都不要（同 renders.mjs）
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    mesh.material = new THREE.MeshStandardMaterial({ color: src.color || 0xffffff, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    parts.add(mesh);
  }
  parts.updateMatrixWorld(true);

  // 拆开的位移：radial 水平方向向四周推开、同时往上抬；y 只在竖直方向拉开（筒状叠层）。
  // 都以底面为基准往上走，零件不会钻到地面以下，影子始终贴着整机的底
  const floor = -size.y * s / 2;
  const tmp = new THREE.Box3();
  let reach = 1;
  const list = meshes.map((mesh) => {
    const c = tmp.setFromObject(mesh).getCenter(new THREE.Vector3());
    const h = c.y - floor;                                 // 离底面的高度
    const off = m.explode === "y"
      ? new THREE.Vector3(0, h * 0.75, 0)
      : new THREE.Vector3(c.x * 0.7, h * 0.45, c.z * 0.7);
    return { mesh, base: mesh.position.clone(), off, d: c.length(), r: tmp.getSize(new THREE.Vector3()).length() / 2, c };
  });
  list.sort((a, b) => a.d - b.d);
  list.forEach((p, i) => { p.delay = (1 - i / Math.max(1, list.length - 1)) * STAGGER; });   // 离得越远越早走

  // 取景范围：装好和拆开两种状态合在一起的高度中点，和离这个点最远的零件
  let top = size.y * s / 2;
  if (m.explode) for (const p of list) top = Math.max(top, p.c.y + p.off.y + p.r * 0.5);
  const cy = (floor + top) / 2;
  const at = new THREE.Vector3(0, cy, 0);
  for (const p of list) {
    reach = Math.max(reach, p.c.distanceTo(at) + p.r * 0.3);
    if (m.explode) reach = Math.max(reach, p.c.clone().add(p.off).distanceTo(at) + p.r * 0.3);
  }

  return { group: parts, parts: list, reach: Math.max(reach * 0.92, 1), cy, floor, explode: !!m.explode };
}

export class Stage {
  /**
   * @param {HTMLElement} el 容器（画布会铺满它）
   * @param {{ spin?: number, onProgress?: (p:number)=>void, onTime?: (t:number)=>void, onInteract?: ()=>void }} opt
   */
  constructor(el, opt = {}) {
    this.el = el;
    el.stage = this;                           // 方便在控制台里调试
    this.opt = opt;
    this.models = new Map();

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    el.appendChild(r.domElement);

    // 离屏纹理（多重采样抗锯齿），后处理在它上面分层上色
    this.rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.post = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rt.texture }, thr: { value: [0.2, 0.4, 0.6, 0.8, 0.9] }, pal: { value: LEVELS.map(() => new THREE.Color()) } },
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.applyTheme();
    new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // 灯光与 renders.mjs 一致：天光打底，主光从右上方，弱补光从左后方；不投影（展示图也没有影子）
    const scene = this.scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(1.5, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    this.turn = new THREE.Group();
    scene.add(this.turn);

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableZoom = false;                       // 滚轮留给页面滚动
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.7;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = 1.62;
    c.addEventListener("start", () => { this.dragged = true; opt.onInteract && opt.onInteract(); });
    r.domElement.style.touchAction = "pan-y";   // 手机上竖着划仍然是滚页面
    r.domElement.addEventListener("dblclick", () => this.frame(true));

    this.clock = new THREE.Clock();
    this.t = 0;
    this.visible = true;
    new ResizeObserver(() => this.resize()).observe(el);
    if (window.IntersectionObserver) {
      new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }).observe(el);
    }
    this.resize();
    r.setAnimationLoop(() => this.tick());
  }

  /** 色阶颜色固定；金色层随主题：浅色主题最浅层、深色主题最深层，取页面的 --accent */
  applyTheme() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || ACCENT_FALLBACK[dark ? "dark" : "light"];
    const pal = this.post.uniforms.pal.value;
    // 后处理直接输出 sRGB 值，所以存 sRGB 分量（Color.set 默认会转成线性）
    LEVELS.forEach((h, i) => pal[i].set(h).convertLinearToSRGB());
    pal[dark ? 0 : LEVELS.length - 1].set(accent).convertLinearToSRGB();
  }

  /** 按当前画面的明度把模型分成 6 层，阈值记在模型上 */
  calibrate(model) {
    const r = this.renderer, N = 192;
    const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType });
    r.setRenderTarget(rt);
    r.clear();
    r.render(this.scene, this.camera);
    const buf = new Uint16Array(N * N * 4);
    r.readRenderTargetPixels(rt, 0, 0, N, N, buf);
    r.setRenderTarget(null);
    rt.dispose();
    const f = THREE.DataUtils.fromHalfFloat;
    const s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const L = [];
    for (let i = 0; i < N * N; i++) {
      const a = f(buf[i * 4 + 3]);
      if (a > 0.5) L.push(0.2126 * s(f(buf[i * 4]) / a) + 0.7152 * s(f(buf[i * 4 + 1]) / a) + 0.0722 * s(f(buf[i * 4 + 2]) / a));
    }
    model.thr = thresholds(L, LEVELS.length);
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.round(w * pr), Math.round(h * pr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.cur) this.frame(false);
  }

  /** 让整机（拆开时的范围）刚好装进画面 */
  frame(reset) {
    const cam = this.camera;
    const v = THREE.MathUtils.degToRad(cam.fov);
    const hfov = 2 * Math.atan(Math.tan(v / 2) * cam.aspect);
    const d = (this.cur.reach * 1.04) / Math.sin(Math.min(v, hfov) / 2);
    const at = new THREE.Vector3(0, this.cur.cy, 0);
    if (reset || !this.placed) {
      const az = THREE.MathUtils.degToRad(38), pol = THREE.MathUtils.degToRad(68);
      cam.position.set(d * Math.sin(pol) * Math.sin(az), d * Math.cos(pol), d * Math.sin(pol) * Math.cos(az)).add(at);
      this.placed = true;
    } else {
      cam.position.sub(this.controls.target).setLength(d).add(at);
    }
    this.controls.target.copy(at);
    this.controls.update();
  }

  async show(m) {
    const token = (this.token = {});
    let model = this.models.get(m.file);
    if (!model) {
      this.opt.onProgress && this.opt.onProgress(0);
      const gltf = await loadFile(m.file, (e) => {
        if (e.lengthComputable && this.token === token && this.opt.onProgress) this.opt.onProgress(e.loaded / e.total);
      });
      model = prepare(gltf, m);
      this.models.set(m.file, model);
    }
    if (this.token !== token) return;            // 加载期间又切走了
    this.opt.onProgress && this.opt.onProgress(1);

    this.turn.clear();
    this.turn.rotation.y = 0;
    this.turn.add(model.group);
    for (const p of model.parts) p.mesh.position.copy(p.base);
    this.turn.scale.setScalar(1);
    this.turn.position.y = 0;
    this.cur = model;
    this.t = 0;
    this.dragged = false;
    this.frame(true);
    if (!model.thr) this.calibrate(model);
    this.post.uniforms.thr.value = model.thr;
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.visible || !this.cur) return;
    this.t += dt;
    const t = this.t;

    // 入场：轻微放大落位
    const e = ease(clamp(t / 0.9));
    this.turn.scale.setScalar(0.9 + 0.1 * e);
    this.turn.position.y = (1 - e) * -0.12;

    // 「减少动效」按全站的温和降级：不自转，拆装只演一轮，之后停在装好的样子
    if (!reduce) this.turn.rotation.y += dt * (this.opt.spin ?? 0.22);
    if (this.cur.explode && (!reduce || t < CYCLE + 0.5)) {
      const p = reduce && t >= CYCLE ? 0 : phase(t);
      for (const q of this.cur.parts) {
        const x = ease(clamp((p - q.delay) / (1 - STAGGER)));
        q.mesh.position.copy(q.base).addScaledVector(q.off, x);
      }
    }

    this.controls.update();
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.postScene, this.postCam);
    this.opt.onTime && this.opt.onTime(t);
  }
}
