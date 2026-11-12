"""通过 SSH 在服务器执行；统计保留日志中的页面请求（包含爬虫）。"""
import collections
import glob
import gzip
import json
import pathlib
from urllib.parse import urlsplit

days = collections.defaultdict(lambda: {"views": 0, "ips": set(), "pages": collections.Counter(), "sources": collections.Counter()})
for filename in glob.glob('/var/log/nginx/onehistory.access.log*'):
    opener = gzip.open if filename.endswith('.gz') else open
    with opener(filename, 'rt', encoding='utf-8', errors='replace') as log:
        for line in log:
            try:
                row = json.loads(line)
                page = row['path']
                if row['method'] != 'GET' or row['status'] not in (200, 304):
                    continue
                if pathlib.PurePosixPath(page).suffix not in ('', '.html') or page.startswith('/assets/'):
                    continue
                day = days[row['time'][:10]]
                day['views'] += 1
                day['ips'].add(row['ip'])
                day['pages'][page] += 1
                source = urlsplit(row.get('referer', '')).hostname or '(direct)'
                day['sources'][source] += 1
            except (ValueError, KeyError):
                continue
print(json.dumps({date: {"page_requests": data['views'], "distinct_ips": len(data['ips']),
    "top_pages": data['pages'].most_common(10), "sources": data['sources'].most_common(10)}
    for date, data in sorted(days.items())}, ensure_ascii=False, indent=2))
