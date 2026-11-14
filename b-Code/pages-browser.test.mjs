// Verify the published subpath, real Three.js imports and GLB loading together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

test('Pages homepage loads 3D models and links to library and details', { timeout: 120000 }, async () => {
  const output = (await readFile(new URL('../b-Deploy/out/pages-latest.txt', import.meta.url), 'utf8')).trim();
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/2026-031/')) throw new Error('Outside Pages base');
      pathname = pathname.slice('/2026-031/'.length);
      if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(output, pathname);
      if (!file.startsWith(output + path.sep)) throw new Error('Outside output');
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' }[path.extname(file)];
      res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    // 本地验证脚本配置与资源路径；统计接收在发布后单独验证。
    await page.route('https://static.cloudflareinsights.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    const base = `http://127.0.0.1:${server.address().port}/2026-031`;
    await page.goto(base + '/');
    await page.locator('#hero-load.done').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#hero-stage canvas').count(), 1);
    await page.locator('#shelf-stage').scrollIntoViewIfNeeded();
    await page.locator('#shelf-load.done').waitFor({ timeout: 60000 });
    for (const button of await page.locator('.page-btn').all()) {
      await button.click();
      await page.locator('#shelf-load.done').waitFor({ timeout: 60000 });
    }
    for (const button of await page.locator('.dot-btn').all()) {
      await button.click();
      await page.locator('#hero-load.done').waitFor({ timeout: 60000 });
    }
    assert.equal(await page.locator('a[href*="onehistory.exc0.top"], a[href="/admin/"]').count(), 0);
    assert.equal(await page.locator('script[data-cf-beacon]').count(), 1);
    assert.ok(await page.locator('a[href*="dash.cloudflare.com/"]').count());
    assert.ok(await page.locator('a[href="https://cyx3705.github.io/2026-031/library/"]').count());
    for (const location of ['/library/', `/p/${(await readdir(path.join(output, 'p')))[0]}/`]) {
      await page.goto(base + location);
      assert.equal(await page.locator('script[data-cf-beacon]').count(), 1);
      assert.ok(await page.locator('a[href="https://cyx3705.github.io/2026-031/"]').count());
    }
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
