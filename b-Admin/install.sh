#!/usr/bin/env bash
set -euo pipefail
install -d -m 755 /opt/onehistory/admin
install -d -m 750 -o www-data -g www-data /var/lib/onehistory
install -m 644 /opt/onehistory/incoming/server.py /opt/onehistory/incoming/index.html /opt/onehistory/admin/
install -m 644 /opt/onehistory/incoming/onehistory-admin.service /etc/systemd/system/
rm -f /etc/nginx/onehistory-admin.htpasswd /etc/onehistory-admin.credentials
systemctl daemon-reload
systemctl enable onehistory-admin >/dev/null
systemctl restart onehistory-admin
