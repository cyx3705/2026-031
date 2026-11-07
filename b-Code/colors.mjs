// WEB-COLOR-001: colors.json is authoritative; this file only adapts it to CSS.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const source = '2026-031-OneHistorySite/z-OneHistoryID/colors.json';
export function validate(tokens) {
  if(tokens.schemaVersion!==1 || tokens.id!=='onehistory.colors') throw new Error('Unsupported color schema');
  const color=value=>typeof value==='string' && (/^#[A-Fa-f0-9]{6}$/.test(value) || /^rgba\((?:\d{1,3},){3}(?:0|1|0?\.\d+)\)$/.test(value) && (()=>{const v=value.slice(5,-1).split(',').map(Number);return v.slice(0,3).every(x=>x<=255)&&v[3]<=1;})());
  const groups=[tokens.common,tokens.themes?.light,tokens.themes?.dark,tokens.desktop];
  for(const group of groups) if(!group || typeof group!=='object' || Array.isArray(group) || !Object.keys(group).length || Object.entries(group).some(([key,value])=>!/^[-a-z0-9]+$/.test(key)||!color(value))) throw new Error('Invalid color token');
  for(const key of ['accent','accent-soft','accent-wash']) if(!color(tokens.common[key])) throw new Error('Missing common color: '+key);
  const required=['canvas','surface','surface-2','surface-hover','text','text-2','ink','on-ink','hairline','hairline-2','code-bg','text-2-on-ink','pressed','danger','danger-soft','text-disabled','scroll-thumb','scroll-thumb-hover','selection-fill'];
  for(const theme of ['light','dark']) for(const key of required) if(!color(tokens.themes[theme][key])) throw new Error('Missing theme color: '+key);
  const desktop=['tile-base','tile-tint-target','tile-text','icon-text','icon-blue','icon-green','icon-red','icon-purple','icon-gold','icon-teal'];
  for(const key of desktop) if(!/^#[A-Fa-f0-9]{6}$/.test(tokens.desktop[key]||'')) throw new Error('Missing desktop color: '+key);
  return tokens;
}
export function cssFrom(snapshot) {
  const t=validate(snapshot.tokens);
  const declarations=group=>Object.entries(group).map(([key,value])=>'  --oh-color-'+key+':'+value+';').join('\n');
  return '/* Generated from '+snapshot.source+'\n   SHA-256: '+snapshot.sha256+'; do not edit. */\n:root{\n'+declarations(t.common)+'\n}\n:root,:root[data-theme=light]{\n'+declarations(t.themes.light)+'\n}\n:root[data-theme=dark]{\n'+declarations(t.themes.dark)+'\n}\n';
}
export async function generateColors({check=false}={}) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const text=await readFile(path.join(root,'z-OneHistoryID/colors.json'),'utf8');
  const css=cssFrom({source,sha256:createHash('sha256').update(text).digest('hex').toUpperCase(),tokens:JSON.parse(text)});
  const destination=path.join(root,'b-Site/assets/onehistory-colors.css');
  if(check) {
    if(await readFile(destination,'utf8')!==css) throw new Error('Color CSS is stale; run npm run colors');
  } else await writeFile(destination,css,'utf8');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generateColors({check:process.argv.includes('--check')});