# 上海服务器部署

目标：`101.132.190.76`，Ubuntu 24.04。沿用 MessageHub 的 SSH 登录配置，网站使用独立 Nginx，不代理消息桥。

## 当前状态（2026-11-12）

- 正式入口：`https://onehistory.exc0.top/`。Cloudflare 中 onehistory 已从 GitHub CNAME 改为 `A 101.132.190.76`，仅 DNS（灰云）；HTTP 和 IP 入口跳转到正式 HTTPS 域名。
- 公网压缩模型 `2025-004.glb` 的 Content-Length 为 1,461,939 字节，原文件 4,251,036 字节；gzip 是无损传输压缩。
- Three.js 0.170.0 与 GLTFLoader / OrbitControls / BufferGeometryUtils 同源提供，MIT LICENSE 随资源保留。
- 首页、项目库和说明页已上传。首页在禁用外网请求的浏览器中成功生成 400 个零件，没有脚本错误。
- Let’s Encrypt 证书已通过 DNS-01 签发并启用，有效至 2027-02-10 16:14（北京时间）。域名与新源站证书校验通过，首页、项目库、说明页、Three.js、GLB 的公网 HTTPS 请求均为 200。
- 用户要求先跑通，暂不办理备案；本次已执行域名切换。其他 `@` 和 `api` DNS 记录未改。
- GitHub Actions 每日北京时间 04:00、相关文件推送和手动触发均会构建、压缩并发布到上海服务器；不再运行 GitHub Pages 发布步骤。公开编号仓库仍按原规则自动收录。

## 发布

日常无需本机操作：`.github/workflows/build-site.yml` 自动生成站点并提交差异，随后通过 SSH 标准输入发送压缩包。仓库 Secrets `SHANGHAI_DEPLOY_KEY` 和 `SHANGHAI_KNOWN_HOSTS` 分别保存专用私钥和固定主机公钥，不使用 MessageHub 私钥。服务器 authorized_keys 对此密钥设置 `restrict,command="/usr/local/sbin/onehistory-receive"`，关闭交互和转发，只运行固定接收器。

`receive-release.py` 由管理员安装到 `/usr/local/sbin/onehistory-receive`（root 所有、0755），工作流不能更新该脚本、Nginx 配置或证书。接收器锁定发布、校验压缩包路径/类型/大小，原子切换版本，检查 HTTPS；失败切回旧版，成功保留当前及最近两版。服务器不需要访问 GitHub 或安装 Node.js。

修改接收器或 Nginx 配置时仍需管理员手动部署；普通网站内容、模板、模型则由 Actions 自动更新。

首次服务器环境需要 `nginx`（Ubuntu 包含 gzip_static）与 `certbot`。安装软件时设置 `NEEDRESTART_MODE=l`，避免安装钩子主动重启其他服务。

本机依赖：Node.js、npm、Windows OpenSSH、tar。运行 `npm ci` 后：

```powershell
# 发布当前已生成站点，不联网重新抓 README
.\b-Deploy\Deploy.ps1
# 先重新抓取各仓库 README 并构建，再发布
.\b-Deploy\Deploy.ps1 -Build
```

部署压缩包位于忽略入库的 `b-Deploy/out/`。`prepare-deploy.mjs` 在新目录复制站点、剔除模板和 CNAME、生成 `.gz` 副本；不要直接修改压缩包。Three.js 的版本与首页 importmap 同步，升级依赖时调整 `vendor.mjs` 与 importmap。

服务器路径：

- `/opt/onehistory/incoming/`：上传包、激活脚本与访问报表脚本。
- `/var/www/onehistory/releases/`：独立版本目录。
- `/var/www/onehistory/current`：当前版本软链接。
- `/etc/nginx/sites-available/onehistory`：本站配置。
- `/var/log/nginx/onehistory.access.log`：JSON 访问日志；沿用 Ubuntu 默认每日轮转、保留 14 份、压缩旧日志。

`activate.sh` 检查 Nginx 配置后原子替换 current 链接并 reload。旧版本保留，可将 current 原子切回之前目录回滚。仓库中的 Nginx 配置已包含 HTTPS。新机器首次部署须先准备相应证书；不能直接把当前 TLS 配置部署到无证书的机器。

## 访问数据

```powershell
ssh -i C:/Users/Administrator/.ssh/messagehub-cloud.pem root@101.132.190.76 'python3 /opt/onehistory/incoming/access-report.py'
```

按日输出页面请求量、独立 IP 数、热门页面和来源域名。包含爬虫、监控与本站验收流量；独立 IP 不等于独立人数。访问日志仅从新服务器开始接收请求后产生，不能恢复 GitHub Pages 历史访问。日志通过 SSH 查看，未设置公开报表地址。

## 证书续期和回滚

当前证书通过手动 DNS 校验签发，**尚不能自动续期**。服务器直连 ACME 超时，本次通过只绑定服务器回环地址的临时 SSH 反向隧道使用本机代理完成签发，命令结束后隧道关闭。webroot 自动续期的 staging 测试因 CA 连接源站 80 端口超时失败，没有替换当前有效证书。不可把已存在的 certbot.timer 视为续期成功。

到期前使用本机已有代理与 SSH 密钥重新发起 DNS 校验：

```powershell
ssh -tt -R 127.0.0.1:18080:127.0.0.1:7890 -i C:/Users/Administrator/.ssh/messagehub-cloud.pem root@101.132.190.76 'export https_proxy=http://127.0.0.1:18080; export http_proxy=http://127.0.0.1:18080; certbot certonly --manual --preferred-challenges dns --cert-name onehistory.exc0.top -d onehistory.exc0.top'
```

按照命令打印的挑战值，在 Cloudflare 更新 `_acme-challenge.onehistory` TXT，确认公共解析生效后按回车完成，随后 `nginx -t && systemctl reload nginx`。当前保留的 TXT 是已使用的验证值，不是访问凭据，也不能用于下一次续期。不要在仓库中存放证书私钥或 Cloudflare 令牌。

如需退回 GitHub Pages，先恢复工作流的 Pages 上传和发布步骤、手动构建成功，再把 Cloudflare 中 onehistory 恢复为原 `CNAME cyx3705.github.io`（仅 DNS）。

## 安装记录

安装 Nginx 时，系统 needrestart 钩子尝试重启 `aegis.service`，该 unit 报 signal=KILL。随后检查原 AliYunDunUpdate、AliYunDun、AliYunDunMonitor 进程仍存在；没有主动停止这些进程或修改云安全代理。MessageHub 三桥部署后仍 healthy。
