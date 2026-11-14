// 全站发布到 GitHub Pages 的 /2026-031/ 子路径。
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitHosting } from './split-hosting.mjs';
import { generateVendor } from './vendor.mjs';
await splitHosting();
await generateVendor();
const root = fileURLToPath(new URL('../', import.meta.url));
// 公开的站点统计标识，不是管理 API 密钥；只在 Pages 发布包中插入脚本。
const { webAnalytics } = JSON.parse(await readFile(path.join(root, 'b-Code/site.config.json'), 'utf8'));
if (!/^[a-f0-9]{32}$/.test(webAnalytics.token)) throw new Error('Invalid Web Analytics token');
const analytics = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: webAnalytics.token })}'></script>`;
const output = path.join(root, 'b-Deploy/out/pages-' + Date.now());
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'library', 'p', 'assets', 'projects.json']) {
  await cp(path.join(root, 'b-Site', item), path.join(output, item), { recursive: true });
}
async function rewrite(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      // 同时处理 HTML 属性、importmap、模块 import 和内联模型 JSON。
      await writeFile(file, html
        .replace(/(["'])\/assets\//g, '$1/2026-031/assets/')
        .replace('<a href="/admin/" rel="nofollow">访问统计</a>',
          `<a href="${webAnalytics.dashboard.replaceAll('&', '&amp;')}" rel="nofollow noopener" target="_blank">访问统计</a>`)
        .replace('</body>', `${analytics}\n</body>`));
    }
  }
}
await rewrite(output);
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(root, 'b-Deploy/out/pages-latest.txt'), output + '\n');
console.log(`GitHub Pages: ${output}`);
