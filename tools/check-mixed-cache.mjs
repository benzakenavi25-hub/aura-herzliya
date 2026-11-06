import { chromium } from 'playwright';
const pages = process.argv.slice(2);
let fail = 0;
for (const url of pages) {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[AURA]')) errs.push('boundary: ' + m.text()); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const sig = () => p.evaluate(() => { const c = document.getElementById('heroCanvas'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < x.length; i += 4099) h = (h * 31 + x[i]) >>> 0; return h; });
  await p.waitForTimeout(800); const a = await sig();
  const H = await p.evaluate(() => document.getElementById('top').offsetHeight - innerHeight);
  await p.evaluate((y) => scrollTo(0, y), Math.round(H * 0.3)); await p.waitForTimeout(2500); const m = await sig();
  await p.evaluate((y) => scrollTo(0, y), Math.round(H * 0.7)); await p.waitForTimeout(2500); const z = await sig();
  const tr = async (f) => { await p.evaluate((f) => { const d = document.getElementById('day'); scrollTo(0, d.offsetTop + (d.offsetHeight - innerHeight) * f); }, f); await p.waitForTimeout(900); return p.evaluate(() => getComputedStyle(document.getElementById('dayTrack')).transform); };
  const t0 = await tr(0.1), t1 = await tr(0.8);
  const heroOk = a !== m && m !== z, dayOk = t0 !== t1 && t1 !== 'none';
  console.log(`${url}\n  page errors: ${errs.length ? errs.join(' | ') : 0}\n  hero frames change: ${heroOk}\n  day track moves: ${dayOk} (${t0} → ${t1})`);
  if (errs.length || !heroOk || !dayOk) fail++;
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
