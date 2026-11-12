// GitHub 项目站运行于 /2026-031/ 子路径；作品首页仍留在上海服务器。
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagesOrigin, splitHosting } from './split-hosting.mjs';
await splitHosting();
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'b-Deploy/out/pages-' + Date.now());
await mkdir(output, { recursive: true });
for (const item of ['library', 'p', 'assets', 'projects.json']) {
  await cp(path.join(root, 'b-Site', item), path.join(output, item), { recursive: true,
    filter: file => !['models', 'renders', 'vendor'].includes(path.basename(file)) });
}
async function rewrite(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      await writeFile(file, html.replace(/((?:src|href)=["'])\/assets\//g, '$1/2026-031/assets/'));
    }
  }
}
await rewrite(output);
await writeFile(path.join(output, 'index.html'), `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${pagesOrigin}/library/"><title>OneHistory 项目库</title><a href="${pagesOrigin}/library/">进入项目库</a></html>`);
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(root, 'b-Deploy/out/pages-latest.txt'), output + '\n');
console.log(`GitHub Pages: ${output}`);
