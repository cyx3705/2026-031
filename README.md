# OneHistorySite

> OneHistory 公开项目目录站，内容由各项目仓库的 README 自动生成

## 项目效果图

![站点首页](./b-Picture/首页.png)

## 项目内容

对外站点 `onehistory.exc0.top` 的源码与生成管线。站点上每一张项目卡片、每一个说明页，都是从 GitHub 上各个**有编号的公开仓库**的 `README.md` 里读出来的，不手工维护内容。

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `b-Site/index.template.html` | 首页模板，`/*__PROJECTS__*/` 等占位符由脚本填充 |
| `b-Site/p.template.html` | 项目说明页模板 |
| `b-Site/assets/` | 样式、脚本、图标（手工维护） |
| `b-Site/CNAME` | 自定义域名 `onehistory.exc0.top` |
| `b-Site/index.html` | **生成产物**，勿手改 |
| `b-Site/p/<仓库名>/index.html` | **生成产物**，每个项目一页 |
| `b-Site/projects.json` | **生成产物**，结构化数据 |
| `b-Code/build.mjs` | 生成脚本 |
| `b-Code/site.config.json` | 配置：收录规则、外挂条目、人工覆盖 |

### 页面结构

首页分两段：**首屏**是字标、一行统计和搜索框；往下是**项目库**，一个不分类的统一列表，带搜索、年份筛选和排序（最近更新 / 编号）。搜索状态会写进地址栏的 `?q=` 和 `?g=`，可以直接把筛好的视图分享出去。

项目说明页在桌面端右侧带一个自动生成的目录（取正文的 `##` / `###`，少于两条就不显示），手机端折叠成顶部一个「目录」按钮。

### 分类是算出来的，不是配出来的

年份筛选项由编号前四位推导：`2026-xxx` 归 2026，`0000-xxx` 归「模板」，编号不是四位数字的（例如手工挂上去的 `extraTools`）归「其他」。**新的一年出现第一个项目时筛选项自动多一条，配置文件里不需要维护任何名单。**

卡片数据以对象数组内联进首页（`{id, name, note, url, repo, pushed}`），以后加字段不会影响已有字段。

### 数据从哪来

脚本读的是**标准项目模型**约定的两个字段：

```markdown
# 项目全称          ← 卡片标题
> 一句话描述        ← 卡片副标题
```

README 正文整体渲染成该项目的说明页，其中的相对路径图片会重写到 `raw.githubusercontent.com`，相对链接重写到仓库的 blob 页。

**所以：想改站点上某个项目的名称或描述，去改那个项目仓库的 README，不要改这里。**

### 配额说明

- 仓库列表走 `api.github.com`，**每次构建仅 1 次请求**
- 每个项目的 README 走 `raw.githubusercontent.com`，属于 CDN，**不计入 API 限额**

因此项目数量增长不会触发限速。Actions 中还会带上 `GITHUB_TOKEN`，限额进一步提到 5000/小时。

### 人工覆盖

`b-Code/site.config.json` 的 `overrides` 只在两种情况下使用：

1. 该仓库 README 仍是模板占位，解析不出内容；
2. README 标题适合做文档标题，但太长不适合做卡片标题。

**把对应仓库的 README 写好之后，删掉该条覆盖即可恢复全自动。** 构建时会把仍是模板占位的仓库列在日志里。

### 本地构建

```bash
npm install
npm run build      # 生成 b-Site/index.html、p/**、projects.json
npm run dry        # 只抓取和解析，不写文件
```

### 首次部署（只需一次）

1. 打开 `https://github.com/cyx3705/2026-031/settings/pages`
2. **Source** 选 **GitHub Actions**
3. 回到 Actions 页面重跑一次 workflow

> workflow 里虽然写了 `enablement: true`，但该参数要求具备 admin 权限的 PAT，
> Actions 默认的 `GITHUB_TOKEN` 权限不够，所以第一次仍得手动开启。开启后即可全自动。

### 自动发布

`.github/workflows/build-site.yml`：

- 每天 UTC 20:00（北京时间 04:00）刷新一次
- 改模板/脚本/样式后 push 立即重建
- 也可在 Actions 页面手动触发
- 生成结果提交回 `main`（**只提交有差异的部分**），随后发布到 GitHub Pages

## 保留内容

### logo与作者

- 作者：pinavia
- ![logo](./Logo.png)

### 学习许可与权利保留

- 本项目允许个人、学校和研究者进行非商业性的学习、研究和引用。
- 未经著作权人书面许可，不得将项目内容用于商业开发、产品制造、商业服务、商业宣传、投标交付、毕业设计成品交付或再授权。
- 不得删除作者、来源、版本历史和第三方许可证声明，不得将本项目或其衍生成果宣称为与作者无关的原创项目。
- 软件源码适用 [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)；机械模型、PCB、原理图、图片、文档、Unity 工程和其他非软件资料适用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)。
- SE、SW、STEP/STP 及其他三维模型仅允许个人或学校进行非商业学习、评审和研究；未经著作权人书面许可，不得用于加工、打样、制造、销售、量产、投标、产品交付、商业宣传、改作或再授权。
- 第三方组件、模板、元件库、外购件模型和工具仍受其原始许可证约束；本声明不扩大作者对第三方内容的权利。

商业使用、产品化、公司内部长期使用、转让或排他性授权需另行取得著作权人的书面许可。
