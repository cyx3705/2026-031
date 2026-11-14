# GitHub Pages 全站部署

2026-11-14：上海域名公网 HTTPS 连接被重置，作品首页迁到 `https://cyx3705.github.io/2026-031/`。项目库仍在 `/2026-031/library/`，说明页仍在 `/2026-031/p/`。GitHub Actions 统一构建和发布全部公开页面、GLB 模型、展示图及 Three.js；`prepare-pages.mjs` 将 HTML 属性、importmap、模块导入和模型地址一起适配仓库子路径，不携带 CNAME 或后台文件。

本地验证：运行 `node b-Code/prepare-pages.mjs`，再运行 `node --test b-Code/pages-browser.test.mjs`（需安装 Edge 与 npm 依赖），覆盖首页 3D、全部六个模型、项目库及说明页。准备后的目录记录在 `b-Deploy/out/pages-latest.txt`。

上海访问统计后台继续保留原服务和历史数据；它只统计到达上海 Nginx 的请求，不能统计 GitHub Pages 的访问。Pages 首页移除“访问统计”入口。原域名尚未修改 DNS，也未配置为 Pages 自定义域名。

以下为上海分站的历史部署和维护记录，不代表当前公开站点的发布方式。

## 历史：上海分站部署

2026-11-12：按用户决定，作品页面留在上海服务器，项目库和项目说明页放回 GitHub Pages，不使用 OSS 或本机后台中转。

## 地址与更新

- 作品首页：`https://onehistory.exc0.top/`，上海服务器 `101.132.190.76`，3D 模型和 Three.js 均由上海同源提供，启用 gzip 预压缩和 HTTPS。
- 项目库：`https://cyx3705.github.io/2026-031/library/`；项目说明页：`https://cyx3705.github.io/2026-031/p/<仓库名>/`。
- GitHub Actions 每日北京时间 04:00、相关源码推送及手动触发时，从公开编号仓库 README 自动生成项目库和说明页，提交有变化的产物，再发布到 GitHub Pages。新建仓库不直接触发本站 workflow，会在下一次构建时收录。
- 上海作品首页暂不自动同步；代表作品、3D 模型及首页内容修改后，本机运行 `./b-Deploy/Deploy.ps1 -Build` 更新。
- 访问旧的上海 `/library/`、`/p/`、`/projects.json` 地址，会跳转到 GitHub；作品页的项目链接也直接指向 GitHub。项目库里的“作品”和 Logo 返回上海首页。
- 上海日志只能记录到达上海源站的请求，GitHub 项目库的访问不会进入上海日志。
- 首页页脚“访问统计”进入 `/admin/` 登录后台，提供趋势、热门页面、来源和浏览器统计；源码、凭据位置与数据口径见 [b-Admin/README.md](../b-Admin/README.md)。`Deploy.ps1` 同时安装或更新后台服务，保留已有密码。

## 构建与发布

`b-Code/build.mjs` 仍是统一内容生成器；最后调用 `split-hosting.mjs` 写入跨站链接。`prepare-pages.mjs` 把项目库、说明页和必要样式资源复制到独立产物目录，改写 `/2026-031/` 子路径，并生成项目库入口。GitHub 产物不含 CNAME、3D 模型或 Three.js vendor。

上海服务器的生成产物保留 `/assets/` 根路径。`prepare-deploy.mjs` 复制站点并预压缩 GLB 与文本，临时包位于忽略入库的 `b-Deploy/out/`。本机需要 Node.js、npm、OpenSSH、tar：

```powershell
npm ci
.\b-Deploy\Deploy.ps1        # 发布当前已生成站点
.\b-Deploy\Deploy.ps1 -Build # 重新抓 README、构建并发布
```

SSH 沿用 MessageHub 的 `root@101.132.190.76` 和本机 `C:/Users/Administrator/.ssh/messagehub-cloud.pem`，私钥不入库。Nginx 配置在 `/etc/nginx/sites-available/onehistory`，版本目录在 `/var/www/onehistory/releases/`，`current` 为当前版本软链接。管理员脚本 `activate.sh` 检查配置后原子切换并 reload；旧版本可回滚。

尝试 GitHub Actions 直接推送上海时，各类执行节点到源站均超时，因此已撤销该 workflow 和专用密钥的授权，删除 GitHub 相关 Secrets。`receive-release.py` 保留为受限接收器源码供参考，不再用于日常发布。

## 访问日志

```powershell
ssh -i C:/Users/Administrator/.ssh/messagehub-cloud.pem root@101.132.190.76 'python3 /opt/onehistory/incoming/access-report.py'
```

日志在 `/var/log/nginx/onehistory.access.log`，按默认规则每日轮转、保留 14 份。报表按日给出页面请求量、独立 IP、热门路径、来源域名，包含爬虫和验收请求；独立 IP 不等于人数。历史 GitHub 访问无法补回，GitHub 项目库没有额外部署访客统计。

## HTTPS 和本机访问

证书在 `/etc/letsencrypt/live/onehistory.exc0.top/`，当前有效至 2027-02-10 16:14（北京时间）。通过 DNS-01 手动验证签发，**尚不能自动续期**。服务器直连 ACME 超时，本次通过只绑定回环地址的临时 SSH 反向隧道使用本机代理签发；隧道已关闭。续期命令：

```powershell
ssh -tt -R 127.0.0.1:18080:127.0.0.1:7890 -i C:/Users/Administrator/.ssh/messagehub-cloud.pem root@101.132.190.76 'export https_proxy=http://127.0.0.1:18080; export http_proxy=http://127.0.0.1:18080; certbot certonly --manual --preferred-challenges dns --cert-name onehistory.exc0.top -d onehistory.exc0.top'
```

在 Cloudflare 更新命令打印的 `_acme-challenge.onehistory` TXT，确认公共解析生效后回车完成，随后 `nginx -t && systemctl reload nginx`。

本机代理链路无法访问上海源站，已在 Windows 系统代理例外添加 `onehistory.exc0.top`；其他网站仍使用原代理。本次不改变 GitHub 的代理路线。

## 安装记录

安装 Nginx 时 needrestart 钩子尝试重启 `aegis.service`，该 unit 报 signal=KILL；检查时原 AliYunDunUpdate、AliYunDun、AliYunDunMonitor 进程仍存在，未停止或修改安全代理。MessageHub 三桥部署后仍 healthy。
