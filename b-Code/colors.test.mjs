import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,cssFrom,generateColors} from './colors.mjs';
const tokens=JSON.parse(await readFile(new URL('../z-OneHistoryID/colors.json',import.meta.url),'utf8'));
test('WEB-COLOR-001: source changes propagate without local palette defaults',async()=>{
 const changed=structuredClone(tokens);changed.themes.dark.canvas='#123456';
 assert.match(cssFrom({tokens:changed,source:'test',sha256:'test'}),/--oh-color-canvas:#123456/);
 await generateColors({check:true});
});
test('WEB-COLOR-001: reject missing themes, injection, invalid channels and alpha',()=>{
 for(const change of [t=>delete t.themes.dark,t=>delete t.themes.light.canvas,t=>t.common.accent='red;display:none',t=>t.common.accent='rgba(999,0,0,.5)',t=>t.common.accent='rgba(0,0,0,1.1)',t=>t.schemaVersion=2]){
 const changed=structuredClone(tokens);change(changed);assert.throws(()=>validate(changed));
 }
});
