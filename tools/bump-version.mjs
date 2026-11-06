// Stamps css/style.css and js/main.js links in every HTML page with ?v=YYYYMMDDHHMM so
// a cached page and fresh assets can never mix. Run before every commit/deploy:
//   node tools/bump-version.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const d = new Date(), p = (n) => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
let changed = 0;
for (const f of readdirSync('.').filter((x) => x.endsWith('.html'))) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(/((?:href|src)="(?:css\/style\.css|js\/main\.js))(?:\?v=\d+)?"/g, `$1?v=${v}"`);
  if (out !== src) { writeFileSync(f, out); changed++; }
}
console.log(`version ${v} → ${changed} page(s)`);
