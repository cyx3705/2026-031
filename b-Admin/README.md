# 访客后台

入口为 `https://onehistory.exc0.top/admin/`，首页页脚有“访问统计”链接。源码保存在本 OneHistorySite 仓库的 `b-Admin/`；不发布到 GitHub Pages。

## 部署与登录

从仓库根目录执行 `./b-Deploy/Deploy.ps1` 会安装后台服务并发布首页。无需新增 Python 包：使用系统 Python 3 标准库，systemd 服务为 `onehistory-admin`，仅监听 `127.0.0.1:18731`。Nginx 对整个 `/admin/`（包括 API）进行 HTTP Basic 登录认证，外部通过 HTTPS 访问。后台进程以 `www-data` 运行，仅有日志读取权限；不接收上传或执行管理命令。

首次安装自动生成用户名 `admin` 和随机密码，密码哈希放在 `/etc/nginx/onehistory-admin.htpasswd`（root:www-data 640）。初始凭据放在 `/etc/onehistory-admin.credentials`（root 600），本次本机副本为忽略入库的 `b-Deploy/out/admin-credentials.txt`。后续部署保留现有密码。不要提交这两个凭据文件。

修改密码可在服务器交互执行：

```bash
# 使用已安装的 openssl，不把密码放进命令行或 shell 历史
umask 077
printf 'admin:%s\n' "$(openssl passwd -6)" > /etc/nginx/onehistory-admin.htpasswd
chown root:www-data /etc/nginx/onehistory-admin.htpasswd
chmod 640 /etc/nginx/onehistory-admin.htpasswd
rm -f /etc/onehistory-admin.credentials
```

修改后同时更新或删除本机旧凭据副本。Basic 登录状态由浏览器管理，退出可关闭对应浏览器会话。

## 数据口径

- 读取 `/var/log/nginx/onehistory.access.log*`，支持轮转 gzip；全部统计按北京时间归日。
- 页面访问：GET、200/304、无扩展名或 `.html` 路径；排除 `/assets/`、`/admin` 和隐藏路径。
- 排除浏览器标识中可识别的 bot/spider/crawler/curl/python/headless/wget；未知机器人、管理员自身访问首页仍可能计入。
- 独立 IP 在所选期间去重，不代表真实人数；前端和 API 不返回原始 IP 或完整 User-Agent。
- 显示 7/14/30 天范围；没有持久化汇总库，数据范围受原始日志保留期限约束（每日轮转，保留 14 份）。GitHub 项目库的访问不在其中。
- API 只读，缓存 30 秒；页面手动刷新，不额外发送访客跟踪请求。

## 检查

```powershell
python -m unittest discover -s b-Admin -v
```

覆盖日志轮转、gzip、时区边界、去重、机器人和静态资源/后台过滤、损坏日志容错。上线还需验证未登录页面和 API 均返回 401，正确登录能查看数据。
