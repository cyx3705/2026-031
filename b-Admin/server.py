"""Read-only dashboard; Nginx authenticates /admin/, backend listens on loopback."""
import collections
import datetime as dt
import glob
import gzip
import json
import os
import pathlib
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

LOG_PATTERN = os.environ.get('OHSITE_LOG_PATTERN', '/var/log/nginx/onehistory.access.log*')
VISIT_FILE = os.environ.get('OHSITE_VISIT_FILE', '/var/lib/onehistory/visits.jsonl')
TZ = dt.timezone(dt.timedelta(hours=8))
LOCK = threading.Lock()
CACHE = (0, None)


def summarize(pattern, count=14, today=None):
    today = today or dt.datetime.now(TZ).date()
    dates = [(today - dt.timedelta(days=i)).isoformat() for i in reversed(range(count))]
    days = {d: {'views': 0, 'ips': set(), 'bots': 0} for d in dates}
    pages, sources, browsers, recent = collections.Counter(), collections.Counter(), collections.Counter(), []
    ips = set()
    for filename in glob.glob(pattern) + [VISIT_FILE]:
        opener = gzip.open if filename.endswith('.gz') else open
        try:
            with opener(filename, 'rt', encoding='utf-8', errors='replace') as stream:
                for line in stream:
                    try:
                        row = json.loads(line)
                        day = dt.datetime.fromisoformat(row['time']).astimezone(TZ).date().isoformat()
                        path = urlsplit(row['path']).path
                        if day not in days or row.get('method') != 'GET' or int(row.get('status', 0)) not in (200, 304):
                            continue
                        if path.startswith(('/admin', '/assets/', '/.')) or pathlib.PurePosixPath(path).suffix not in ('', '.html'):
                            continue
                        agent = row.get('agent', '').lower()
                        source = urlsplit(row.get('referer', '')).hostname or '直接访问'
                        bot = any(s in agent for s in ('bot', 'spider', 'crawler', 'curl/', 'python-', 'headless', 'wget/'))
                        if bot:
                            days[day]['bots'] += 1
                            continue
                        ip = row['ip']
                        days[day]['views'] += 1
                        days[day]['ips'].add(ip)
                        ips.add(ip)
                        pages[path] += 1
                        sources[source] += 1
                        browser = next((name for key, name in [('edg/', 'Edge'), ('firefox/', 'Firefox'), ('chrome/', 'Chrome'), ('safari/', 'Safari')] if key in agent), '其他')
                        browsers[browser] += 1
                        recent.append({'time': row['time'], 'path': path, 'browser': browser})
                    except (ValueError, KeyError, TypeError, AttributeError):
                        continue
        except (FileNotFoundError, OSError, EOFError):
            continue
    daily = [{'date': d, 'views': v['views'], 'ips': len(v['ips']), 'bots': v['bots']} for d, v in days.items()]
    return {'updated': dt.datetime.now(TZ).isoformat(), 'daily': daily,
            'totals': {'views': sum(d['views'] for d in daily), 'ips': len(ips), 'bots': sum(d['bots'] for d in daily)},
            'pages': pages.most_common(15), 'sources': sources.most_common(15), 'browsers': browsers.most_common(),
            'recent': sorted(recent, key=lambda r: r['time'], reverse=True)[:20]}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if urlsplit(self.path).path != '/stats/collect' or self.headers.get('Origin') != 'https://cyx3705.github.io':
            self.send_error(403); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 2048: raise ValueError()
            body = json.loads(self.rfile.read(length)); path = body['path']
            if not isinstance(path, str) or not path.startswith('/2026-031/') or '?' in path or '#' in path or len(path) > 500: raise ValueError()
            if pathlib.PurePosixPath(path).suffix not in ('', '.html') or path.startswith('/2026-031/admin'): raise ValueError()
            ua = self.headers.get('User-Agent', '')
            if any(s in ua.lower() for s in ('bot', 'spider', 'crawler', 'curl/', 'python-', 'headless', 'wget/')):
                self.send_response(204); self.end_headers(); return
            row = {'time': dt.datetime.now(TZ).isoformat(), 'ip': self.client_address[0], 'method': 'GET', 'status': 200, 'path': path, 'referer': body.get('referrer', ''), 'agent': ua}
            os.makedirs(os.path.dirname(VISIT_FILE), exist_ok=True)
            with LOCK:
                with open(VISIT_FILE, 'a', encoding='utf8') as stream: stream.write(json.dumps(row, ensure_ascii=False) + '\n')
            self.send_response(204); self.send_header('Access-Control-Allow-Origin', 'https://cyx3705.github.io'); self.end_headers()
        except (ValueError, KeyError, json.JSONDecodeError): self.send_error(400)

    def do_OPTIONS(self):
        if urlsplit(self.path).path == '/stats/collect':
            self.send_response(204); self.send_header('Access-Control-Allow-Origin', 'https://cyx3705.github.io'); self.send_header('Access-Control-Allow-Methods', 'POST'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.end_headers(); return
        self.send_error(404)

    def do_GET(self):
        global CACHE
        url = urlsplit(self.path)
        if url.path in ('/admin/', '/admin/index.html'):
            body = pathlib.Path(__file__).with_name('index.html').read_bytes()
            kind = 'text/html; charset=utf-8'
        elif url.path == '/admin/api/stats':
            try:
                count = int(parse_qs(url.query).get('days', ['14'])[0])
                if count not in (7, 14, 30):
                    raise ValueError()
            except ValueError:
                self.send_error(400)
                return
            with LOCK:
                if time.monotonic() - CACHE[0] > 30 or CACHE[1] is None:
                    CACHE = (time.monotonic(), {n: summarize(LOG_PATTERN, n) for n in (7, 14, 30)})
                body = json.dumps(CACHE[1][count], ensure_ascii=False).encode()
            kind = 'application/json; charset=utf-8'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        for k, v in {'Content-Type': kind, 'Content-Length': str(len(body)), 'Cache-Control': 'no-store',
                     'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
                     'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline' https://onehistory.exc0.top; style-src 'self' 'unsafe-inline' https://onehistory.exc0.top https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://onehistory.exc0.top; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 18731), Handler).serve_forever()
