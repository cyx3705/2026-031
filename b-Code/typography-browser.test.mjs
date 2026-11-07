// WEB-FONT-002: verify computed styles on real generated pages without rebuilding public content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const colors=JSON.parse(await readFile(new URL('../z-OneHistoryID/colors.json',import.meta.url),'utf8'));
const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')+')';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../b-Site');
test('WEB-FONT-002: home, library and detail use shared 400/600 in both themes and mobile',async()=>{
  const server=createServer(async(req,res)=>{
    try {
      let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.endsWith('/')) pathname+='index.html';
      const filename=path.resolve(site,'.'+pathname);
      if(!filename.startsWith(site+path.sep)) {res.writeHead(403).end();return;}
      const type={'.css':'text/css','.html':'text/html','.js':'text/javascript','.woff2':'font/woff2'}[path.extname(filename)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type});res.end(await readFile(filename));
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:process.env.AURORA_BROWSER_CHANNEL||'msedge',headless:true});
    const page=await browser.newPage();
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.hostname!=='127.0.0.1'||/\.(glb|png|webp|jpg)$/.test(url.pathname)?route.abort():route.continue();
    });
    const detail=(await readdir(path.join(site,'p'),{withFileTypes:true})).find(item=>item.isDirectory()).name;
    for(const location of ['/','/library/',`/p/${detail}/`]) {
      await page.goto(`http://127.0.0.1:${server.address().port}${location}`);
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:900});
        for(const theme of ['light','dark']) {
          await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
          const actual=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,color:getComputedStyle(document.body).color,body:getComputedStyle(document.body).fontWeight,heading:getComputedStyle(document.querySelector('h1,h2,h3')).fontWeight,family:getComputedStyle(document.body).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth}));
          assert.equal(actual.background,rgb(colors.themes[theme].canvas),location);assert.equal(actual.color,rgb(colors.themes[theme].text),location);
          assert.equal(actual.body,'400',location);assert.equal(actual.heading,'600',location);
          assert.match(actual.family,/Noto Serif/);assert.equal(actual.overflow,false,location);
        }
      }
    }
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});