/**
 * OneHistory 站点生成器
 *
 * 数据来源：GitHub 上 owner 名下所有「有编号」的公开仓库的 README.md。
 * 配额策略：仓库列表走 api.github.com（1 次请求），README 走 raw.githubusercontent.com
 *           （CDN，不计入 60 次/小时的未认证 API 限额），因此项目再多也不会触顶。
 *
 * 产出：
 *   b-Site/index.html          代表作品页（site.config.json 的 showcase 挑选，含 3D 动画与模型选页）
 *   b-Site/assets/covers/      代表作品的封面图（裁掉白边/黑边后的 webp）
 *   b-Site/library/index.html  项目库：全部项目的统一列表（卡片数据内联，页面零请求）
 *   b-Site/p/<编号>/index.html 每个项目的说明页（README 渲染）
 *   b-Site/projects.json       结构化数据，便于其他地方复用
 *
 * 用法：node b-Code/build.mjs [--dry]
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setDefaultResultOrder } from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import sharp from "sharp";

// 有些网络里 GitHub 的 IPv6 地址连不上、只能等超时，优先走 IPv4 能省掉这段空等
setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "b-Site");
const DRY = process.argv.includes("--dry");

const cfg = JSON.parse(await readFile(path.join(ROOT, "b-Code/site.config.json"), "utf8"));
const includeRe = cfg.includePatterns.map((p) => new RegExp(p));

const UA = { "User-Agent": "onehistory-site-builder", Accept: "application/vnd.github+json" };
// Actions 里会注入 GITHUB_TOKEN，带上可把限额提到 5000/小时；本地不带也能跑
if (process.env.GITHUB_TOKEN) UA.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

/**
 * 带重试的 fetch —— 本机出网链路不稳，宁可慢也不要半路失败。
 * 失败仍然抛出（而不是跳过）：悄悄少抓一个 README 会让站点静默掉一个项目，
 * 那比构建失败更糟。
 */
const BACKOFF = [1000, 2000, 3500, 6000, 10000];
async function get(url, { asJson = false, asBuf = false, allow404 = false } = {}) {
  let lastErr;
  for (let i = 0; i <= BACKOFF.length; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404 && allow404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      if (asBuf) return Buffer.from(await r.arrayBuffer());
      return asJson ? await r.json() : await r.text();
    } catch (e) {
      lastErr = e;
      if (i === BACKOFF.length) break;
      await new Promise((s) => setTimeout(s, BACKOFF[i]));
    }
  }
  throw lastErr;
}

/** 仓库名 -> 编号。2026-012 / 0000-001-AIReady 都取前段 */
function idOf(repoName) {
  const m = repoName.match(/^(\d{4}-\d{3})/);
  return m ? m[1] : repoName;
}

/**
 * 从 README 解析标准项目模型的两个字段：
 *   # 标题        -> 项目全称（去掉重复的编号前缀）
 *   > 一句话描述  -> 卡片描述；没有引用行时退回标题后的首个段落
 */
function parseReadme(md, id) {
  const lines = md.split(/\r?\n/);

  let title = "";
  let titleIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (m) {
      title = m[1];
      titleIdx = i;
      break;
    }
  }
  // 去掉标题里重复的编号："2026-012 便携式…" / "2026-011-顺时针…" -> 纯名称
  title = title.replace(/^\d{4}-\d{3}\s*[-—·:：]?\s*/, "").trim();
  // 去掉标题尾部版本号："HistoryVulcan 5.6.1" -> "HistoryVulcan"
  title = title.replace(/\s+v?\d+(\.\d+)+\s*$/i, "").trim();
  // 去掉破折号/冒号后的副标题："HistoryDiana — OneHistory 的 AI 工具区" -> "HistoryDiana"
  title = title.replace(/\s*[—–]{1,2}\s*.+$/, "").replace(/\s*[:：]\s*.+$/, "").trim();

  let note = "";
  for (let i = titleIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("#")) break;           // 进入下一节了，放弃
    if (line.startsWith(">")) {                 // 标准模型的描述行
      note = line.replace(/^>\s*/, "");
      break;
    }
    if (!note && !line.startsWith("!") && !line.startsWith("|")) {
      note = line;                              // 退化情况：取首个正文段落
      break;
    }
  }
  // 描述里常带 "—— 2025-009 项目" 这类尾巴，去掉
  note = note
    .replace(/\s*[—-]{1,2}\s*\d{4}-\d{3}\s*项目\s*$/, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // Markdown 链接只留文字
    .replace(/`/g, "")
    // "HistoryJanus 5.8.1 是运行在…" -> "运行在…"：去掉自报家门和版本号
    .replace(/^[A-Za-z][\w.-]*\s+v?\d+(\.\d+)+\s*(是|为)\s*/, "")
    .replace(/^[A-Za-z][\w.-]*\s*(是|为)\s*/, "")
    .trim();

  // 卡片描述优先取第一个完整句子；句子太长再退回按分句截断
  const max = cfg.cardNoteMaxLength;
  let cardNote = note;
  const period = cardNote.search(/[。！？]/);
  if (period >= 8 && period <= max) {
    cardNote = cardNote.slice(0, period);              // 第一句就够短，直接用
  } else if (cardNote.length > max) {
    const cut = cardNote.slice(0, max);
    const at = Math.max(cut.lastIndexOf("；"), cut.lastIndexOf("，"),
                        cut.lastIndexOf("、"), cut.lastIndexOf("："));
    cardNote = at >= 12 ? cut.slice(0, at) : cut.trimEnd() + "…";
  }
  cardNote = cardNote.replace(/[，、：；]$/, "").trim();

  return { title, note, cardNote };
}

/**
 * README 里的相对路径要指到 GitHub raw / blob 上才显示得出来。
 * 图片走 github.com/<repo>/raw/：它对 LFS 文件重定向到 media.githubusercontent.com，
 * 对普通文件重定向到 raw CDN。直接用 raw.githubusercontent.com 时 LFS 图片只拿到指针文本。
 */
function rewriteLinks(md, repoFull) {
  const raw = `https://github.com/${repoFull}/raw/HEAD/`;
  const blob = `https://github.com/${repoFull}/blob/HEAD/`;
  return md
    .replace(/(!\[[^\]]*\]\()(?!https?:|#|mailto:)\.?\/?([^)]+)(\))/g,
      (_, a, p, c) => a + raw + encodeURI(p.replace(/^\.\//, "")) + c)
    .replace(/(?<!!)(\[[^\]]*\]\()(?!https?:|#|mailto:)\.?\/?([^)]+)(\))/g,
      (_, a, p, c) => a + blob + encodeURI(p.replace(/^\.\//, "")) + c);
}

/** README 里第一张不是 Logo 的图，作为作品封面 */
function coverOf(md, repoFull) {
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    if (/(^|\/)logo\.(png|jpe?g|svg|webp)$/i.test(m[1])) continue;
    return assetUrl(m[1], repoFull);
  }
  return "";
}

/** 仓库内相对路径 -> 可直接引用的地址（走 /raw/，理由同 rewriteLinks） */
function assetUrl(p, repoFull) {
  if (/^https?:/.test(p)) return p;
  return `https://github.com/${repoFull}/raw/HEAD/` + encodeURI(p.replace(/^\.?\//, ""));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- 抓取

console.log(`列出 ${cfg.owner} 的公开仓库…`);
const repos = [];
for (let page = 1; page <= 5; page++) {
  const batch = await get(
    `https://api.github.com/users/${cfg.owner}/repos?per_page=100&page=${page}&sort=full_name`,
    { asJson: true }
  );
  repos.push(...batch);
  if (batch.length < 100) break;
}

const picked = repos
  .filter((r) => !r.private && !r.archived)
  .filter((r) => includeRe.some((re) => re.test(r.name)))
  .filter((r) => !cfg.exclude.includes(r.name));

console.log(`命中有编号的项目 ${picked.length} 个，开始读 README…`);

const projects = [];
const unwritten = [];   // README 仍是模板占位、且没有人工覆盖的仓库
for (const r of picked) {
  const id = idOf(r.name);
  const md = await get(
    `https://raw.githubusercontent.com/${r.full_name}/HEAD/README.md`,
    { allow404: true }
  );
  if (md === null) {
    console.log(`  ! ${r.name} 没有 README，跳过`);
    continue;
  }
  const { title, note, cardNote } = parseReadme(md, id);
  // README 还是模板占位（没写过）时，回退到 overrides 里的人工名称
  const ov = cfg.overrides?.[id] || {};
  const placeholder = !title || title === "项目名称" || title === r.name;
  const notePlaceholder = !note || note === "简短的项目描述（一句话）";
  if (placeholder && !ov.name) unwritten.push(`${id}  (${r.full_name})`);

  projects.push({
    id,
    repo: r.full_name,
    name: ov.name || (placeholder ? r.name : title),
    note: ov.note || (notePlaceholder ? "" : cardNote),
    fullNote: note,
    url: `/p/${r.name}/`,
    slug: r.name,
    pushedAt: r.pushed_at,
    cover: coverOf(md, r.full_name),
    html: marked.parse(rewriteLinks(md, r.full_name)),
  });
  console.log(`  ✓ ${id}  ${title}`);
}

// 编号倒序：新项目在前
projects.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

/**
 * 站点是一个统一列表，不再分「工作流 / 主体项目」。
 * 页面上的年份筛选由 id 前四位自行推导，这里不产出任何分组名单，
 * 新年份的项目一出现就自动生效。
 */
const cards = projects.map((p) => ({
  id: p.id,
  name: p.name,
  note: p.note || "",
  url: p.url,
  repo: p.repo,
  // 本站仓库不写推送时间，否则每次推送都会引出一个机器人提交（见 site.config.json 的 self）
  pushed: p.repo === cfg.self ? "" : p.pushedAt || "",
}));

// 不在 owner 名下的条目没有说明页，卡片直接链到 GitHub 仓库（ext:1 让前端标出外链）
for (const e of cfg.extraTools) {
  cards.push({
    id: e.id,
    name: e.name,
    note: e.note || "",
    url: `https://github.com/${e.repo}`,
    repo: e.repo,
    pushed: "",
    ext: 1,
  });
}

console.log(`目录共 ${cards.length} 项（含 ${cfg.extraTools.length} 个外挂条目）`);

if (unwritten.length) {
  console.log(`\n⚠ 下列仓库的 README 仍是模板占位，站点只能显示仓库名：`);
  for (const u of unwritten) console.log(`    ${u}`);
  console.log(`  改掉这些仓库 README 的「# 标题」和「> 一句话描述」即可自动生效。\n`);
}

if (DRY) {
  console.log(JSON.stringify(cards.map((c) => [c.id, c.name, c.note]), null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- 生成

const tpl = await readFile(path.join(SITE, "library.template.html"), "utf8");
const libraryHtml = tpl
  .replaceAll("/*__NOTE__*/", esc(cfg.note))
  .replaceAll("/*__OWNER__*/", cfg.owner)
  // 对象数组而非元组：以后给卡片加字段不会错位。
  // 转义 < ：万一哪个 README 的描述里出现 </script>，内联脚本会被就地截断
  .replace("/*__PROJECTS__*/", JSON.stringify(cards).replace(/</g, "\\u003c"))
  .replaceAll("/*__BUILT__*/", new Date().toISOString().slice(0, 10));

await mkdir(path.join(SITE, "library"), { recursive: true });
await writeFile(path.join(SITE, "library/index.html"), libraryHtml, "utf8");
console.log("写入 b-Site/library/index.html");

// ---------------------------------------------------------------- 代表作品页

const sc = cfg.showcase;
const byId = new Map(projects.map((p) => [p.id, p]));
const animated = new Set(sc.hero.map((m) => m.id));

/** 配置条目（编号或对象）-> 作品数据；README 是来源，配置只补封面和标签 */
function work(entry) {
  const e = typeof entry === "string" ? { id: entry } : entry;
  const p = byId.get(e.id);
  if (!p) {
    console.log(`  ! showcase 里的 ${e.id} 不在已收录的项目中，跳过`);
    return null;
  }
  return {
    ...p,
    text: p.fullNote || p.note,
    cover: e.cover ? assetUrl(e.cover, p.repo) : p.cover,
    tags: e.tags || [],
    caption: e.caption || "",
  };
}
const works = (list) => list.map(work).filter(Boolean);

/**
 * 封面图下载到本站、裁掉四周的纯色边（渲染图常见的大片白底/黑底），按原始长宽比展示。
 * 失败不让构建失败：退回直接引用 GitHub 上的原图。
 */
const COVERS = path.join(SITE, "assets/covers");
async function localCover(w) {
  if (!w.cover) return;
  try {
    const buf = await get(w.cover, { asBuf: true });
    const out = await sharp(buf, { limitInputPixels: false })
      .flatten({ background: "#ffffff" })     // 透明底按白底处理，trim 才裁得掉
      .trim({ threshold: 18 })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(path.join(COVERS, `${w.id}.webp`), out.data);
    w.cover = `/assets/covers/${w.id}.webp`;
    w.coverW = out.info.width;
    w.coverH = out.info.height;
  } catch (e) {
    console.log(`  ! ${w.id} 封面处理失败，直接引用原图：${e.message}`);
  }
}

const ICON_GH = '<svg class="i-gh" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const repoBtn = (w) => `<a class="repo" href="https://github.com/${esc(w.repo)}" rel="noopener" aria-label="在 GitHub 打开 ${esc(w.name)}" title="在 GitHub 打开">${ICON_GH}</a>`;

// 带上宽高：图按原始比例排，加载前就占好位，不会跳
const img = (w, cls) => w.cover
  ? `<img class="${cls}" src="${esc(w.cover)}" alt="${esc(w.name)} 效果图" loading="lazy" decoding="async"` +
    (w.coverW ? ` width="${w.coverW}" height="${w.coverH}"` : "") + ">"
  : `<span class="${cls} no-cover" aria-hidden="true"><span class="id">${esc(w.id)}</span></span>`;

/** 首屏动画的文字：每件一块，JS 切换 */
const slideHtml = (w, i, all) => `
          <article class="slide${i ? "" : " is-on"}" data-i="${i}"${i ? " hidden" : ""}>
            <p class="slide-n"><span class="id">${String(i + 1).padStart(2, "0")}</span> / ${String(all.length).padStart(2, "0")} · 代表作品</p>
            <h1>${esc(w.name)}</h1>
            <p class="slide-note">${esc(w.note)}</p>
            <p class="slide-cap"><span class="id">${esc(w.id)}</span>${esc(w.caption)}</p>
            <p class="slide-links">
              <a class="solid-btn" href="${esc(w.url)}">查看说明</a>
              <a class="ghost-btn" href="#works">全部代表作品 ↓</a>
            </p>
          </article>`;

/** 代表作品：大图 + 说明，左右交替 */
const featureHtml = (w, i) => `
        <article class="feature${i % 2 ? " flip" : ""}">
          <a class="feature-media" href="${esc(w.url)}" tabindex="-1" aria-hidden="true">${img(w, "feature-img")}</a>
          <div class="feature-body">
            <span class="id">${esc(w.id)}</span>
            <h3><a href="${esc(w.url)}">${esc(w.name)}</a></h3>
            <p>${esc(w.text)}</p>
            ${w.tags.length ? `<ul class="tags">${w.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
            <p class="feature-links">
              <a class="ghost-btn" href="${esc(w.url)}">查看说明</a>
              ${animated.has(w.id) ? `<button type="button" class="text-btn" data-hero="${esc(w.id)}">看拆装动画</button>` : ""}
              ${repoBtn(w)}
            </p>
          </div>
        </article>`;

/** 更多作品：带图小卡，瀑布流 */
const tileHtml = (w) => `
          <a class="tile" href="${esc(w.url)}">
            ${img(w, "tile-img")}
            <span class="tile-body">
              <span class="id">${esc(w.id)}</span>
              <strong>${esc(w.name)}</strong>
              <span class="tile-note">${esc(w.note)}</span>
            </span>
          </a>`;

/** 模型展示的选页按钮 */
const pageBtnHtml = (w, i) =>
  `<button type="button" class="page-btn${i ? "" : " is-on"}" data-i="${i}" aria-pressed="${!i}">` +
  `<span class="id">${esc(w.id)}</span><span class="page-name">${esc(w.name)}</span></button>`;

/** 软件与工具：没有效果图，沿用项目库的卡片 */
const cardHtml = (w) => `
          <article class="card">
            <a class="card-link" href="${esc(w.url)}">
              <span class="id">${esc(w.id)}</span>
              <h3>${esc(w.name)}</h3>
              <p>${esc(w.note)}</p>
            </a>
            <footer class="card-foot"><span></span>
              ${repoBtn(w)}
            </footer>
          </article>`;

/** 模型条目 -> 作品数据 + 前端需要的几个字段；GLB 不在就跳过 */
const modelWorks = (list) => list
  .filter((m) => existsSync(path.join(SITE, m.file)) || console.log(`  ! 模型 ${m.file} 不存在，跳过`))
  .map((m) => ({ ...work(m), file: m.file, up: m.up || "y", explode: m.explode || "" }))
  .filter((w) => w.id);
const toClient = (list) => list.map((w) => ({ id: w.id, name: w.name, note: w.note, caption: w.caption, url: w.url, file: w.file, up: w.up, explode: w.explode }));

const hero = modelWorks(sc.hero);
const shelf = modelWorks(sc.models);
const featured = works(sc.featured);
const more = works(sc.more);
const software = works(sc.software);

if (existsSync(COVERS)) await rm(COVERS, { recursive: true });
await mkdir(COVERS, { recursive: true });
for (const w of [...featured, ...more]) await localCover(w);

const showTpl = await readFile(path.join(SITE, "index.template.html"), "utf8");
const showHtml = showTpl
  .replaceAll("/*__NOTE__*/", esc(cfg.note))
  .replaceAll("/*__OWNER__*/", cfg.owner)
  .replaceAll("/*__LEAD__*/", esc(sc.lead))
  .replaceAll("/*__COUNT__*/", String(cards.length))
  .replaceAll("/*__BUILT__*/", new Date().toISOString().slice(0, 10))
  .replace("/*__HERO__*/", () => JSON.stringify(toClient(hero)).replace(/</g, "\\u003c"))
  .replace("/*__SHELF__*/", () => JSON.stringify(toClient(shelf)).replace(/</g, "\\u003c"))
  .replace("<!--__SLIDES__-->", () => hero.map(slideHtml).join(""))
  .replace("<!--__HERO_DOTS__-->", () => hero.map((w, i) =>
    `<button type="button" class="dot-btn${i ? "" : " is-on"}" data-i="${i}" aria-label="${esc(w.name)}">` +
    `<span class="dot-n">${String(i + 1).padStart(2, "0")}</span><span class="dot-name">${esc(w.name)}</span><span class="dot-bar"><i></i></span></button>`).join(""))
  .replace("<!--__PAGES__-->", () => shelf.map(pageBtnHtml).join(""))
  .replace("<!--__FEATURED__-->", () => featured.map(featureHtml).join(""))
  .replace("<!--__MORE__-->", () => more.map(tileHtml).join(""))
  .replace("<!--__SOFTWARE__-->", () => software.map(cardHtml).join(""));

await writeFile(path.join(SITE, "index.html"), showHtml, "utf8");
console.log(`写入 b-Site/index.html（首屏动画 ${hero.length}、模型选页 ${shelf.length}、代表作品 ${featured.length}、更多 ${more.length}、软件 ${software.length}）`);

await writeFile(
  path.join(SITE, "projects.json"),
  JSON.stringify(
    // builtAt 只精确到天：用完整时间戳的话每次构建都有差异，
    // "只提交差异" 会退化成跑一次就多一个提交
    { builtAt: new Date().toISOString().slice(0, 10), count: cards.length, projects: cards },
    null, 2
  ),
  "utf8"
);

// 详情页：整个 p/ 重建，删掉的项目不会留下孤儿页
const pDir = path.join(SITE, "p");
if (existsSync(pDir)) await rm(pDir, { recursive: true });
await mkdir(pDir, { recursive: true });

const pageTpl = await readFile(path.join(SITE, "p.template.html"), "utf8");
let n = 0;
for (const p of projects) {
  const dir = path.join(pDir, p.slug);
  await mkdir(dir, { recursive: true });
  const html = pageTpl
    .replaceAll("/*__TITLE__*/", esc(`${p.id} ${p.name}`))
    .replaceAll("/*__NAME__*/", esc(p.name))
    .replaceAll("/*__DESC__*/", esc(p.note || ""))
    .replaceAll("/*__ID__*/", esc(p.id))
    .replaceAll("/*__REPO__*/", esc(p.repo))
    .replace("/*__BODY__*/", p.html);
  await writeFile(path.join(dir, "index.html"), html, "utf8");
  n++;
}
console.log(`写入 ${n} 个说明页`);
console.log("完成。");
