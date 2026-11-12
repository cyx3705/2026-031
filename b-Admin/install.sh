#!/usr/bin/env bash
set -euo pipefail
install -d -m 755 /opt/onehistory/admin
install -m 644 /opt/onehistory/incoming/server.py /opt/onehistory/incoming/index.html /opt/onehistory/admin/
install -m 644 /opt/onehistory/incoming/onehistory-admin.service /etc/systemd/system/
if [ ! -s /etc/nginx/onehistory-admin.htpasswd ]; then
    python3 - <<'PY'
import os, pathlib, secrets, subprocess
os.umask(0o077)
password = secrets.token_urlsafe(24)
hashed = subprocess.run(['openssl', 'passwd', '-6', '-stdin'], input=password+'\n', text=True, capture_output=True, check=True).stdout.strip()
pathlib.Path('/etc/nginx/onehistory-admin.htpasswd').write_text('admin:'+hashed+'\n')
pathlib.Path('/etc/onehistory-admin.credentials').write_text('URL: https://onehistory.exc0.top/admin/\nUsername: admin\nPassword: '+password+'\n')
PY
fi
chown root:www-data /etc/nginx/onehistory-admin.htpasswd
chmod 640 /etc/nginx/onehistory-admin.htpasswd
systemctl daemon-reload
systemctl enable onehistory-admin >/dev/null
systemctl restart onehistory-admin
