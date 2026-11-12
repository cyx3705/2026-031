#!/usr/bin/python3
"""GitHub Actions 专用 SSH forced-command：只接收本站 tar.gz，不执行远端命令。"""
import fcntl
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

base = Path('/var/www/onehistory')
releases = base / 'releases'
releases.mkdir(parents=True, exist_ok=True)
lock = open('/opt/onehistory/deploy.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX)
release = Path(tempfile.mkdtemp(prefix=time.strftime('%Y%m%dT%H%M%S-'), dir=releases))
old = os.readlink(base / 'current') if (base / 'current').is_symlink() else None
active = False
try:
    with tempfile.TemporaryFile() as package:
        total = 0
        while chunk := sys.stdin.buffer.read(1024 * 1024):
            total += len(chunk)
            if total > 200 * 1024 * 1024:
                raise ValueError('部署包超过 200 MiB')
            package.write(chunk)
        package.seek(0)
        with tarfile.open(fileobj=package, mode='r:gz') as archive:
            members = archive.getmembers()
            if len(members) > 20000 or sum(m.size for m in members) > 500 * 1024 * 1024:
                raise ValueError('解压文件数量或大小超限')
            for member in members:
                name = PurePosixPath(member.name)
                if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                    raise ValueError('包内含不允许的路径或文件类型')
            archive.extractall(release, members=members, filter='data')
    for required in ['index.html', 'projects.json', 'library/index.html',
                     'assets/vendor/three-0.170.0/build/three.module.min.js',
                     'assets/models/2025-004.glb.gz']:
        if not (release / required).is_file():
            raise ValueError('缺少必要文件: ' + required)
    for root, dirs, files in os.walk(release):
        os.chmod(root, 0o755)
        for file in files:
            os.chmod(Path(root) / file, 0o644)
    temporary = base / ('current.' + str(os.getpid()))
    temporary.symlink_to(release)
    os.replace(temporary, base / 'current')
    active = True
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '15',
                    '--resolve', 'onehistory.exc0.top:443:127.0.0.1',
                    '--output', '/dev/null', 'https://onehistory.exc0.top/'], check=True)
    # 留当前版及最近两个旧版，避免每天发布占满磁盘。
    previous = sorted((p for p in releases.iterdir() if p.is_dir() and p != release),
                      key=lambda p: p.stat().st_mtime, reverse=True)
    for stale in previous[2:]:
        if stale.parent != releases or stale.is_symlink():
            raise ValueError('版本清理目录不合法')
        shutil.rmtree(stale)
    print('Published: ' + str(release))
except Exception:
    if active and old:
        rollback = base / ('rollback.' + str(os.getpid()))
        rollback.symlink_to(old)
        os.replace(rollback, base / 'current')
    if not active or old:
        shutil.rmtree(release)
    raise
