import datetime as dt
import gzip
import json
import pathlib
import tempfile
import unittest
from server import summarize


class StatisticsTest(unittest.TestCase):
    def test_rotation_timezone_dedup_and_exclusions(self):
        today = dt.date(2026, 11, 12)
        def row(**overrides):
            return json.dumps(dict(dict(time='2026-11-11T18:00:00+00:00', path='/',
                method='GET', status=200, ip='1.2.3.4', agent='Mozilla Chrome/140.0', referer=''), **overrides))
        # gzip and active log share an IP, count it once across the requested period.
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory)
            with gzip.open(p/'access.log.1.gz', 'wt') as f:
                f.write(row()+'\n')
            records = [row(), row(path='/page.html', ip='5.6.7.8', referer='https://example.com/a'),
                row(path='/admin/api/stats'), row(path='/assets/file.glb'), row(status=404),
                row(method='POST'), row(agent='Googlebot'), row(time='2026-10-01T00:00:00Z'),
                '{invalid json', row(referer='http://[bad')]
            (p/'access.log').write_text('\n'.join(records))
            result = summarize(str(p/'access.log*'), 7, today)
        self.assertEqual(result['totals'], {'views': 3, 'ips': 2, 'bots': 1})
        self.assertEqual(result['daily'][-1]['views'], 3)
        self.assertEqual(result['sources'], [('直接访问', 2), ('example.com', 1)])
        self.assertNotIn('ip', result['recent'][0])


if __name__ == '__main__':
    unittest.main()
