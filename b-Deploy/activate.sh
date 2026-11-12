#!/usr/bin/env bash
# 上传 site.tar.gz 与配置到 /opt/onehistory/incoming 后执行；仅操作本站目录。
set -euo pipefail
release="/var/www/onehistory/releases/$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p "$release"
tar -xzf /opt/onehistory/incoming/site.tar.gz -C "$release"
test -s "$release/index.html"
test -s "$release/assets/vendor/three-0.170.0/build/three.module.min.js"
chmod -R a+rX "$release"
install -m 644 /opt/onehistory/incoming/onehistory.nginx.conf /etc/nginx/sites-available/onehistory
ln -sfn /etc/nginx/sites-available/onehistory /etc/nginx/sites-enabled/onehistory
nginx -t
old="$(readlink /var/www/onehistory/current || true)"
ln -s "$release" /var/www/onehistory/current.next
mv -Tf /var/www/onehistory/current.next /var/www/onehistory/current
if ! systemctl reload nginx; then
    if [ -n "$old" ]; then
        ln -s "$old" /var/www/onehistory/current.rollback
        mv -Tf /var/www/onehistory/current.rollback /var/www/onehistory/current
    fi
    exit 1
fi
printf 'Active release: %s\nPrevious release: %s\n' "$release" "$old"
curl --fail --silent --output /dev/null -H 'Host: onehistory.exc0.top' http://127.0.0.1/
