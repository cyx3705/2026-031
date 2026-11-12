// 制作独立部署目录，预压缩 GLB 与文本；不修改源文件。
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateVendor } from './vendor.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await generateVendor();
// 每次用新目录，避免旧资源或压缩副本混入新版本。
const output = path.join(root, 'b-Deploy/out', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
await cp(path.join(root, 'b-Site'), output, { recursive: true,
  filter: p => !p.endsWith('.template.html') && path.basename(p) !== 'CNAME' });
async function compress(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await compress(file); continue; }
    if (!/\.(html|css|js|json|svg|glb)$/.test(file)) continue;
    const raw = await readFile(file);
    const zipped = gzipSync(raw, { level: 9 });
    if (zipped.length < raw.length) await writeFile(file + '.gz', zipped);
    if (file.endsWith('.glb')) console.log(`${entry.name}: ${raw.length} → ${zipped.length} bytes`);
  }
}
await compress(output);
await writeFile(path.join(root, 'b-Deploy/out/latest.txt'), output + '\n');
console.log(`部署目录：${output}`);
