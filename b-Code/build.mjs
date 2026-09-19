/**
 * OneHistory 站点生成器
 *
 * 数据来源：GitHub 上 owner 名下所有「有编号」的公开仓库的 README.md。
 * 配额策略：仓库列表走 api.github.com（1 次请求），README 走 raw.githubusercontent.com
 *           （CDN，不计入 60 次/小时的未认证 API 限额），因此项目再多也不会触顶。
 *
 * 产出：
 *   b-Site/index.html          目录首页（卡片数据内联，页面零请求）
 *   b-Site/p/<编号>/index.html 每个项目的说明页（README 渲染）
 *   b-Site/projects.json       结构化数据，便于其他地方复用
 *
 * 用法：node b-Code/build.mjs [--dry]
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "b-Site");
const DRY = process.argv.includes("--dry");

const cfg = JSON.parse(await readFile(path.join(ROOT, "b-Code/site.config.json"), "utf8"));
const includeRe = cfg.includePatterns.map((p) => new RegExp(p));

const UA = { "User-Agent": "onehistory-site-builder", Accept: "application/vnd.github+json" };
// Actions 里会注入 GITHUB_TOKEN，带上可把限额提到 5000/小时；本地不带也能跑
if (process.env.GITHUB_TOKEN) UA.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

/** 带重试的 fetch —— 本机出网链路不稳，宁可慢也不要半路失败 */
async function get(url, { asJson = false, allow404 = false } = {}) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404 && allow404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return asJson ? await r.json() : await r.text();
    } catch (e) {
      lastErr = e;
      await new Promise((s) => setTimeout(s, 800 * (i + 1)));
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

/** README 里的相对路径要指到 GitHub raw / blob 上才显示得出来 */
function rewriteLinks(md, repoFull) {
  const raw = `https://raw.githubusercontent.com/${repoFull}/HEAD/`;
  const blob = `https://github.com/${repoFull}/blob/HEAD/`;
  return md
    .replace(/(!\[[^\]]*\]\()(?!https?:|#|mailto:)\.?\/?([^)]+)(\))/g,
      (_, a, p, c) => a + raw + encodeURI(p.replace(/^\.\//, "")) + c)
    .replace(/(?<!!)(\[[^\]]*\]\()(?!https?:|#|mailto:)\.?\/?([^)]+)(\))/g,
      (_, a, p, c) => a + blob + encodeURI(p.replace(/^\.\//, "")) + c);
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
    html: marked.parse(rewriteLinks(md, r.full_name)),
  });
  console.log(`  ✓ ${id}  ${title}`);
}

// 编号倒序：新项目在前
projects.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

const tools = projects.filter((p) => cfg.toolsIds.includes(p.id));
const works = projects.filter((p) => !cfg.toolsIds.includes(p.id));
for (const e of cfg.extraTools) {
  tools.push({ ...e, url: `/p/${e.id}/`, slug: e.id, html: null });
}

console.log(`工作流 ${tools.length} 项 / 主体项目 ${works.length} 项`);

if (unwritten.length) {
  console.log(`\n⚠ 下列仓库的 README 仍是模板占位，站点只能显示仓库名：`);
  for (const u of unwritten) console.log(`    ${u}`);
  console.log(`  改掉这些仓库 README 的「# 标题」和「> 一句话描述」即可自动生效。\n`);
}

if (DRY) {
  console.log(JSON.stringify({ tools: tools.map((t) => [t.id, t.name, t.note]) }, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- 生成

const tuple = (p) => JSON.stringify([p.id, p.name, p.note || "", p.url]);
const arr = (list) => "[" + list.map(tuple).join(", ") + "]";

const tpl = await readFile(path.join(SITE, "index.template.html"), "utf8");
const indexHtml = tpl
  .replaceAll("/*__LEDE__*/", esc(cfg.lede))
  .replaceAll("/*__NOTE__*/", esc(cfg.note))
  .replaceAll("/*__OWNER__*/", cfg.owner)
  .replace("/*__TOOLS__*/", arr(tools))
  .replace("/*__WORKS__*/", arr(works))
  .replace("/*__BUILT__*/", new Date().toISOString().slice(0, 10));

await writeFile(path.join(SITE, "index.html"), indexHtml, "utf8");
console.log("写入 b-Site/index.html");

await writeFile(
  path.join(SITE, "projects.json"),
  JSON.stringify(
    // builtAt 只精确到天：用完整时间戳的话每次构建都有差异，
    // "只提交差异" 会退化成跑一次就多一个提交
    { builtAt: new Date().toISOString().slice(0, 10), tools: tools.map(strip), works: works.map(strip) },
    null, 2
  ),
  "utf8"
);
function strip({ html, ...rest }) { return rest; }

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
    .replace(/\/\*__TITLE__\*\//g, esc(`${p.id} ${p.name}`))
    .replace("/*__DESC__*/", esc(p.note || ""))
    .replace("/*__ID__*/", esc(p.id))
    .replace("/*__REPO__*/", esc(p.repo))
    .replace("/*__BODY__*/", p.html);
  await writeFile(path.join(dir, "index.html"), html, "utf8");
  n++;
}
console.log(`写入 ${n} 个说明页`);
console.log("完成。");
