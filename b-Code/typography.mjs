// WEB-FONT-002: typography.json is authoritative; this file only adapts it to CSS.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const source = '2026-031-OneHistorySite/z-OneHistoryID/typography.json';
export function validate(tokens) {
  if (tokens.schemaVersion !== 1 || tokens.id !== 'onehistory.typography') throw new Error('Unsupported typography schema');
  for (const key of ['serif','numerals','mono','desktopSerif']) {
    const names = tokens.families?.[key];
    if (!Array.isArray(names) || !names.length || names.some(x => typeof x !== 'string' || !/^[A-Za-z0-9 -]+$/.test(x))) throw new Error('Invalid font family: '+key);
  }
  for (const key of ['body','heading']) if (!Number.isInteger(tokens.weights?.[key]) || tokens.weights[key]<100 || tokens.weights[key]>900) throw new Error('Invalid weight: '+key);
  return tokens;
}
export function cssFrom(text) {
  const t=validate(JSON.parse(text));
  const stack=key=>t.families[key].map(name=>['serif','monospace'].includes(name)?name:JSON.stringify(name)).join(',');
  const hash=createHash('sha256').update(text).digest('hex').toUpperCase();
  return `/* Generated from ${source}\n   SHA-256: ${hash}; do not edit. */\n:root{\n  --oh-font-family-serif:${stack('serif')};\n  --oh-font-family-numerals:${stack('numerals')};\n  --oh-font-family-mono:${stack('mono')};\n  --oh-font-weight-body:${t.weights.body};\n  --oh-font-weight-heading:${t.weights.heading};\n}\n`;
}
export async function generateTypography({check=false}={}) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const css=cssFrom(await readFile(path.join(root,'z-OneHistoryID/typography.json'),'utf8'));
  const destination=path.join(root,'b-Site/assets/onehistory-typography.css');
  if(check) {
    if(await readFile(destination,'utf8')!==css) throw new Error('Typography CSS is stale; run npm run typography');
  } else await writeFile(destination,css,'utf8');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generateTypography({check:process.argv.includes('--check')});