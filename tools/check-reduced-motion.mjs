// node tools/check-reduced-motion.mjs [url]  — scroll experiences must work with reduced motion
import { chromium, webkit, devices } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
let fail = 0;
for (const [name, eng, ctx] of [['desktop 1440', chromium, { viewport: { width: 1440, height: 900 } }], ['iPhone 13', webkit, { ...devices['iPhone 13'] }]]) {
  const b = await eng.launch(); const p = await b.newPage({ ...ctx, reducedMotion: 'reduce' });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const rm = await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sig = () => p.evaluate(() => { const c = document.getElementById('heroCanvas'); if (!c.width || getComputedStyle(c).display === 'none') return -1; const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < x.length; i += 4099) h = (h * 31 + x[i]) >>> 0; return h; });
  const H = await p.evaluate(() => document.getElementById('top').offsetHeight - innerHeight);
  const at = async (f) => { await p.evaluate((y) => scrollTo(0, y), Math.round(H * f)); await p.waitForTimeout(2200); return sig(); };
  const a = await at(0.02), m = await at(0.3), z = await at(0.7);
  const heroOk = a !== -1 && a !== m && m !== z;
  let dayOk = 'n/a (carousel on phones)';
  if (name.startsWith('desktop')) {
    const tr = async (f) => { await p.evaluate((f) => { const d = document.getElementById('day'); scrollTo(0, d.offsetTop + (d.offsetHeight - innerHeight) * f); }, f); await p.waitForTimeout(700); return p.evaluate(() => getComputedStyle(document.getElementById('dayTrack')).transform); };
    const t0 = await tr(0.1), t1 = await tr(0.8); dayOk = t0 !== t1 && t1 !== 'none';
    if (!dayOk) fail++;
  }
  const poster = await p.evaluate(() => getComputedStyle(document.querySelector('.hero__poster')).display);
  console.log(`${name}: reduced-motion=${rm} · errors=${errs.length ? errs.join(' | ') : 0} · hero frames change=${heroOk} · day track moves=${dayOk} · poster=${poster}`);
  if (errs.length || !heroOk || !rm) fail++;
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
