# OneHistoryID

> OneHistory 视觉识别的唯一权威处：品牌基础写在本文件，各介质的风格各写一份，其他仓库只写引用。

## 1. 权威关系

| 内容 | 权威文件 | 实现（跟随权威） |
|---|---|---|
| 字标、颜色令牌、字体 | 本文件 | `b-Site/assets/site.css`、HistoryAurora `AuroraTokens.xaml`、各 Office 模板 |
| 网站风格 | [网站风格.md](网站风格.md) | `b-Site/`（模板、样式、脚本） |
| Office 风格 | [Office风格.md](Office风格.md) | `0000-000-Template/Unused/b-Office/` |

- 改色的顺序：先改本文件，再同步 `site.css` 和 `AuroraTokens.xaml`，最后同步 Office 模板。
- 实现与本目录冲突时，以本目录为准，并回头修实现。
- 其他仓库需要说明风格时，只放一个指向本目录的引用文件（例如 `b-Office/风格.md`），不要复制规则。

## 2. 字标

| 文件 | 用途 |
|---|---|
| `b-Site/assets/logo.png` | 原始字标，黑色，透明底，640×228。浅色主题的网站使用 |
| `b-Site/assets/logo-dark.png` | 浅色字标，透明底。深色主题的网站使用 |
| `b-Site/assets/favicon.png`、`apple-touch.png` | 站点图标 |
| `z-OneHistoryID/assets/logo-ink.png` | 墨色（`#26231E`）字标，已裁掉透明边，588×176。Office 浅色背景使用 |
| `z-OneHistoryID/assets/logo-canvas.png` | 纸色（`#FBFAF7`）字标，588×176。Office 墨色背景使用 |

- 字标是衬线体的「OneHistory」，中间嵌一本打开的书。「书页」是整个识别体系的母题（网站首屏的书页意象就来自它）。
- 不要拉伸字标，不要加描边、阴影或渐变，也不要给它另外配色。只允许使用上表中的几种颜色版本。

## 3. 颜色令牌

两套主题共用同一组令牌名。

- 浅色：暖白纸面上的墨色正文，主题色压暗到 `#7F5E0F`，保证文字对比度过 AA。
- 深色：炭黑底上的米色正文，主题色为亮金。
- 两套主题的文字与底色都在同一个暖色相里。
- 层级是「底色 → 卡片 → 条带」三层小台阶，浅色越往上越深，深色与之对应。

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `canvas` | `#FBFAF7` | `#121414` | 页面底色 |
| `surface` | `#F3F1EC` | `#1D201F` | 卡片、输入框、按钮底 |
| `surface-2` | `#EBE9E4` | `#191C1B` | 条带、分段控件底、快捷键提示 |
| `surface-hover` | `#E5E3DE` | `#2A2D2C` | 悬停底色 |
| `text` | `#26231E` | `#E2DAC6` | 正文、标题（Office 里称 ink，即墨色） |
| `text-2` | `#6A6458` | `#ACA593` | 次要文字、标签、说明 |
| `accent` | `#7F5E0F` | `#D9A441` | 主题色：链接、编号、选中态、章节号 |
| `accent-hover` | `#6A4E0C` | `#E8B65C` | 主题色悬停 |
| `accent-soft` | `rgba(127,94,15,.34)` | `rgba(217,164,65,.38)` | 选中 / 悬停时的描边 |
| `accent-wash` | `rgba(127,94,15,.08)` | `rgba(217,164,65,.10)` | 选中底、首屏光晕 |
| `hairline` | `#E5E3DE` | `#2A2D2C` | 常规分隔线、卡片边框 |
| `hairline-2` | `#D5D1C8` | `#343936` | 较深的分隔线、虚线框 |
| `code-bg` | `#EBE9E4` | `#171A19` | 代码底色 |
| `shadow` | `0 10px 30px rgba(38,35,30,.06)` | `0 16px 40px rgba(0,0,0,.26)` | 卡片、大搜索框 |
| `shadow-lift` | `0 16px 38px rgba(38,35,30,.12)` | `0 22px 52px rgba(0,0,0,.40)` | 卡片悬停 |
| `ring` | `0 0 0 4px rgba(127,94,15,.16)` | `0 0 0 4px rgba(217,164,65,.18)` | 输入框聚焦光圈 |

- 主题色只用来强调，不做大面积底色。
- 不要引入令牌以外的颜色。

## 4. 字体

| 用途 | 网站 | Office | 说明 |
|---|---|---|---|
| 中文与正文 | Noto Sans SC | Microsoft YaHei | Office 里可变字体不可靠，发给别人也可能缺字体 |
| 西文正文 | Noto Sans SC 自带 → Segoe UI | Segoe UI | |
| 数字、编号、英文标签 | Outfit | Bahnschrift | 两者都偏几何；Bahnschrift 为 Windows 自带 |
| 代码 | Outfit → Consolas / 等宽 | Consolas | |

- 网站字体经 Google Fonts 加载，字重 400 / 500 / 600 / 700。

## 5. 语气

- 说明性文字只用一句话讲清楚，不堆形容词。
- 项目的名称和一句话描述来自各仓库 README 的 `# 名称` 与 `> 一句话`，不在别处另写一套。
