import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,cssFrom,generateTypography} from './typography.mjs';
const text=await readFile(new URL('../z-OneHistoryID/typography.json',import.meta.url),'utf8');
test('WEB-FONT-002: source drives both typography roles and generated CSS',async()=>{
  const tokens=validate(JSON.parse(text));
  assert.equal(tokens.weights.body,400);assert.equal(tokens.weights.heading,600);
  assert.match(cssFrom(text),/--oh-font-weight-body:400/);
  assert.match(cssFrom(text),/--oh-font-weight-heading:600/);
  const changed=JSON.parse(text);changed.weights.body=300;
  assert.match(cssFrom(JSON.stringify(changed)),/--oh-font-weight-body:300/);
  await generateTypography({check:true});
});
test('WEB-FONT-002: malformed source is rejected before producing CSS',()=>{
  for(const change of [t=>t.schemaVersion=2,t=>t.weights.body='400',t=>t.families.serif=['bad; color:red']]) {
    const tokens=JSON.parse(text);change(tokens);assert.throws(()=>cssFrom(JSON.stringify(tokens)));
  }
});