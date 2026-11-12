// 3D 运行依赖与模型同源部署，避免首屏依赖境外 CDN。
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function generateVendor() {
  const source = path.join(root, 'node_modules/three');
  const { version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  if (version !== '0.170.0') throw new Error(`请同步更新首页 importmap 的 Three.js 版本：${version}`);
  const target = path.join(root, 'b-Site/assets/vendor/three-0.170.0');
  for (const file of ['build/three.module.min.js', 'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/controls/OrbitControls.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']) {
    const dest = path.join(target, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(source, file), dest);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generateVendor();
