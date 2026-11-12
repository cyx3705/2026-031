import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const worksOrigin = 'https://onehistory.exc0.top';
export const pagesOrigin = 'https://cyx3705.github.io/2026-031';
const site = fileURLToPath(new URL('../b-Site/', import.meta.url));

// 源站作品页与 GitHub 项目库都指向同一份在线项目说明，旧链接由 Nginx 重定向。
export async function splitHosting() {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'assets') await walk(file); continue; }
      if (entry.name.endsWith('.template.html') || !/\.(html|json)$/.test(entry.name)) continue;
      const original = await readFile(file, 'utf8');
      const updated = original
        .replace(/(["'])\/(library\/|p\/)/g, `$1${pagesOrigin}/$2`)
        .replaceAll('href="/"', `href="${worksOrigin}/"`);
      if (updated !== original) await writeFile(file, updated);
    }
  }
  await walk(site);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await splitHosting();
