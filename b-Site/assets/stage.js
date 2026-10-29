/* OneHistory 首页的 3D：首屏的拆装动画，以及「模型展示」选页。
   three.js 由 index.html 的 importmap 指到 CDN。
   对外只有 Stage：new Stage(容器, 选项)，stage.show(模型) 切换。

   拆装动画是通用的「爆炸图」：把装配里每个零件拿出来，按它离整机中心的方向推开，
   外圈的先走、内圈的后走，拆开停一会儿再按反序装回去。任何 STEP 装配都能直接用，
   不需要在 CAD 里另做动画。 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = new GLTFLoader();
const files = new Map();                       // 同一个 GLB 只下载一次

/** 一轮拆装的时间表（秒）：装好停 → 拆开 → 拆开停 → 装回 → 装好停 */
const T = { hold: 1.4, out: 2.2, open: 2.8, back: 2.2, rest: 1.4 };
export const CYCLE = T.hold + T.out + T.open + T.back + T.rest;
const STAGGER = 0.35;                          // 外圈零件比内圈早走的比例

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
    mesh.castShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      mat.envMapIntensity = 0.9;
      if (mat.transparent) mat.depthWrite = false;   // 透明外壳不挡住里面的零件
    }
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

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2.5, 6, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 20 });
    key.shadow.radius = 6;
    scene.add(key);

    // 只接影子的地面：页面底色透出来，模型落在页面上而不是装在盒子里
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

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

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
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
    this.ground.position.y = model.floor - 0.002;
    this.cur = model;
    this.t = 0;
    this.dragged = false;
    this.frame(true);
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
    this.renderer.render(this.scene, this.camera);
    this.opt.onTime && this.opt.onTime(t);
  }
}
