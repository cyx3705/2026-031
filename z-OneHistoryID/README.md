# OneHistoryID

> OneHistory 视觉识别的唯一权威处：品牌基础写在本文件，各介质的风格各写一份，其他仓库只写引用。

## 1. 权威关系

| 内容 | 权威文件 | 实现（跟随权威） |
|---|---|---|
| 字标 | 本文件 | `b-Site/assets/site.css`、HistoryAurora `aurora.css`、各 Office 模板 |
| 屏幕字体栈与字重 | [`typography.json`](typography.json) | 网站生成 CSS；Aurora / Mercury 经 Diana Z 级指令消费为离线快照 |
| 网站风格 | [网站风格.md](网站风格.md) | `b-Site/`（模板、样式、脚本） |
| Office 风格 | [Office风格.md](Office风格.md) | `0000-000-Template/z-Unused/b-Office/` |

- 改色的顺序：先改本文件，再同步 `site.css` 和 `aurora.css`，最后同步 Office 模板。
- 实现与本目录冲突时，以本目录为准，并回头修实现。
- 其他仓库需要说明风格时，只放一个指向本目录的引用文件（例如 `b-Office/风格.md`），不要复制规则。

## 2. 字标

| 文件 | 用途 |
|---|---|
| `b-Site/assets/logo.png` | 原始字标，黑色，透明底，640×228。浅色主题的网站使用 |
| `b-Site/assets/logo-dark.png` | 米色（`#E2DAC6`）字标，透明底。深色主题的网站使用 |
| `b-Site/assets/favicon.png`、`apple-touch.png` | 站点图标，黑色 |
| `z-OneHistoryID/assets/logo-ink.png` | 墨色（`#26231E`）字标，已裁掉透明边，588×176。Office 浅色背景使用 |
| `z-OneHistoryID/assets/logo-canvas.png` | 纸色（`#FBFAF7`）字标，588×176。Office 墨色背景使用 |
| 各仓库根目录 `Logo.png` | README 用的整张字标图：网站浅色底 `#FBFAF7`、黑色字，字形居中，654×439 |

- 字标颜色就是上表这几种（2026-10-24 从 10-23 的 `#38352F` 改回原色），不跟文字色走。

- 字标是衬线体的「OneHistory」，中间嵌一本打开的书。「书页」是整个识别体系的母题（网站首屏的书页意象就来自它）。
- 不要拉伸字标，不要加描边、阴影或渐变，也不要给它另外配色。只允许使用上表中的几种颜色版本。

## 3. 颜色令牌

**WEB-COLOR-001：颜色唯一权威源为 [`colors.json`](colors.json)。** 两套主题共用同一组令牌名。`common` 为共用强调色，`themes` 为浅深主题与控件语义色，`desktop` 为桌面磁贴和项目图标专用色。网站生成 CSS；Aurora 与 Mercury 使用 manifest 的 `syncColors` 经 `diana.z.read` 获取完整对象、校验 schema 和 SHA-256，再生成离线快照；`checkColors` 检查漂移。改色只改此对象，不手改产物。验收：网站 colors.test.mjs 与主题浏览器测试、Aurora colors.test.mjs、Mercury Smoke。

- **深浅两套分开设定**（2026-10-24 起）：不拿一套主题的颜色去当另一套的颜色。2026-10-23 试过反色对齐（条带 = 另一套主题的墨色块），
  无论怎么调，总有一种颜色在某一套主题里显得突兀，已退回。改色时两套各自调、各自看。
- **文字只有一种颜色**：浅色 `#38352F`、深色 `#DAD7CE`。正文、标题、次要文字都是它；`text-2` 保留名字，值与 `text` 相同。
  这一档由用户从七档样张里选定：对背景约 11:1，比原来的墨色（`#26231E`）柔和，比原来的次要文字（`#6A6458`）清楚。
- 墨色块（`ink`）、页面（`surface`）、条带（`surface-2`）用原值，墨色块不再等于文字色；墨色块上的反白字是本主题的底色（`canvas`）。
- **主题色深浅共用一个值**（2026-11-05 起）：金 `#A97F22`，墨色块上的编号、计数也用它（`accent-on-ink` = `accent`）。
  原来浅色 `#7F5E0F`、深色 `#D9A441` 两套，墨块上又反过来用，记不住，已统一。这一档由用户从五档金色样张（`#997224` → `#D6A73A`）里选定：
  对浅色 `canvas` 3.5 : 1、深色 `canvas` 5.1 : 1，对浅色墨块 4.3 : 1、深色米白墨块 2.6 : 1。
  金色只做粗体编号和数字，正文文字不用它，所以不按正文的 AA（4.5 : 1）要求。深色米白墨块上偏淡，是保留米白墨块的代价。
- 层级是「底色 → 卡片 → 条带」三层小台阶，浅色越往上越深，深色与之对应。



- 主题色只用来强调，不做大面积底色。
- 「墨色」（`ink`）：墨色条、粗细墨线、选中块都用它，比正文略深。墨色块上的反白字是本主题 `canvas`，其余见 [网站风格.md §2.4](网站风格.md)。
- 不要引入令牌以外的颜色。

## 4. 字体

- **WEB-FONT-002**：机器可读文字令牌唯一源为本目录 [`typography.json`](typography.json)。网站构建生成 `b-Site/assets/onehistory-typography.css`；Aurora 与 Mercury 通过 `diana.z.read path=2026-031-OneHistorySite/z-OneHistoryID/typography.json` 消费，生成带源地址与 SHA-256 的离线快照。只改源对象，不手改消费快照；字体栈与字重取令牌，字号及布局留在各介质。Diana 3.1 现有 `z.read` 已满足消费，无新增专用指令。消费端同步脚本的 `--check` 会拒绝过期快照；构建与运行使用随源码、随包快照，无需在线宿主。

整套用衬线体。网页自 2026-11-06 起采用西文与数字 Noto Serif Variable、中文 Noto Serif SC（思源宋体），正文字重均为 400。Office 继续采用宋体与 Times New Roman。

| 用途 | 网站 | Office | 说明 |
|---|---|---|---|
| 中文（标题与正文） | Noto Serif SC（思源宋体） | 宋体（SimSun） | Office 保留系统字体，便于交换文件 |
| 西文（标题与正文） | Noto Serif Variable | Times New Roman | 网页采用真正的可变字体，连续字重 100–900 |
| 数字、编号、英文标签 | Noto Serif Variable | Times New Roman | 与西文正文同一字体 |
| 行内代码（路径、文件名） | 同正文衬线体，靠代码底色区分 | — | |
| 多行代码块 | Consolas → 等宽 | Consolas | 缩进需要对齐 |

- **WEB-FONT-001**：网页正文、说明文字及继承正文样式的控件，西文、数字和中文统一字重 400，深浅主题相同；标题、表头与强调层级统一引用 heading 字重 600。字号、行高沿用各页面现行规格。
- 西文与数字由站点自托管 Noto Serif Variable（Fontsource Variable 5.3.0 的 Latin WOFF2，正体与斜体，100–900）；文件及 SIL OFL 1.1 许可证放在 `b-Site/assets/fonts/`。中文经 Google Fonts 加载 Noto Serif SC 400 / 600。
- 字体栈以 Noto Serif、Noto Serif SC 为先，再由 Times New Roman 和系统宋体兜底；西文、数字取 Noto Serif，中文落到思源宋体。数字专用字体栈也以 Noto Serif 为首。
- 标题字重 600，不收紧字距；首屏大标题的例外见网站风格 §2.1。
- 验收：检查首页、项目库、说明页在深浅主题及桌面 / 手机宽度下的计算字重和实际字体；正文为 400，西文与数字使用 Noto Serif，中文使用 Noto Serif SC，标题层级及布局保留。

## 5. 语气

- 说明性文字只用一句话讲清楚，不堆形容词。
- 项目的名称和一句话描述来自各仓库 README 的 `# 名称` 与 `> 一句话`，不在别处另写一套。
