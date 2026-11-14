import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const pagesOrigin = 'https://cyx3705.github.io/2026-031';
export const worksOrigin = pagesOrigin;
const site = fileURLToPath(new URL('../b-Site/', import.meta.url));

// 所有公开页面统一指向 GitHub Pages；兼容之前生成的上海首页链接。
export async function splitHosting() {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'assets') await walk(file); continue; }
      if (entry.name.endsWith('.template.html') || !/\.(html|json)$/.test(entry.name)) continue;
      const original = await readFile(file, 'utf8');
      const updated = original
        .replaceAll('https://onehistory.exc0.top/', `${worksOrigin}/`)
        .replace(/(["'])\/(library\/|p\/)/g, `$1${pagesOrigin}/$2`)
        .replaceAll('href="/"', `href="${worksOrigin}/"`);
      if (updated !== original) await writeFile(file, updated);
    }
  }
  await walk(site);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await splitHosting();
