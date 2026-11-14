// 全站发布到 GitHub Pages 的 /2026-031/ 子路径。
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitHosting } from './split-hosting.mjs';
import { generateVendor } from './vendor.mjs';
await splitHosting();
await generateVendor();
const root = fileURLToPath(new URL('../', import.meta.url));
const statsScript = `<script>(()=>{try{const p=location.pathname, u='https://onehistory.exc0.top/stats/collect'; if(p.startsWith('/2026-031/')&&!p.startsWith('/2026-031/admin')) navigator.sendBeacon(u,new Blob([JSON.stringify({path:p,referrer:document.referrer})],{type:'application/json'}));}catch{}})();</script>`;
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
        .replace('<a href="/admin/" rel="nofollow">访问统计</a>', '<a href="https://onehistory.exc0.top/admin/" rel="nofollow">访问统计</a>')
        .replace('</body>', `${statsScript}\n</body>`));
    }
  }
}
await rewrite(output);
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(root, 'b-Deploy/out/pages-latest.txt'), output + '\n');
console.log(`GitHub Pages: ${output}`);
