// node tools/check-motion-modes.mjs [url] — the experience must be identical for every OS motion setting
import { chromium, webkit, devices } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
let fail = 0;
const runs = [
  ['desktop 1440 · reduce', chromium, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }],
  ['desktop 1440 · no-preference', chromium, { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }],
  ['iPhone 13 · reduce', webkit, { ...devices['iPhone 13'], reducedMotion: 'reduce' }],
  ['iPhone 13 · no-preference', webkit, { ...devices['iPhone 13'], reducedMotion: 'no-preference' }],
];
for (const [name, eng, ctx] of runs) {
  const b = await eng.launch(); const p = await b.newPage(ctx);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const sig = () => p.evaluate(() => { const c = document.getElementById('heroCanvas'); if (!c.width || getComputedStyle(c).display === 'none') return -1; const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < x.length; i += 4099) h = (h * 31 + x[i]) >>> 0; return h; });
  const H = await p.evaluate(() => document.getElementById('top').offsetHeight - innerHeight);
  // smoothing check: right after a jump the scrub must still be easing (frame differs from the settled one)
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800); const a = await sig();
  await p.evaluate((y) => scrollTo(0, y), Math.round(H * 0.3)); await p.waitForTimeout(120); const mid = await sig();
  await p.waitForTimeout(2200); const m = await sig();
  await p.evaluate((y) => scrollTo(0, y), Math.round(H * 0.7)); await p.waitForTimeout(2200); const z = await sig();
  const heroOk = a !== -1 && a !== m && m !== z, smooth = mid !== m;
  let dayOk = 'n/a (carousel on phones)';
  if (name.startsWith('desktop')) {
    const tr = async (f) => { await p.evaluate((f) => { const d = document.getElementById('day'); scrollTo(0, d.offsetTop + (d.offsetHeight - innerHeight) * f); }, f); await p.waitForTimeout(700); return p.evaluate(() => getComputedStyle(document.getElementById('dayTrack')).transform); };
    const t0 = await tr(0.1), t1 = await tr(0.8); dayOk = t0 !== t1 && t1 !== 'none';
    if (!dayOk) fail++;
  }
  const state = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('reduced'), poster: getComputedStyle(document.querySelector('.hero__poster')).display, cueAnim: getComputedStyle(document.querySelector('.hero__cue i')).animationName }));
  console.log(`${name}: errors=${errs.length ? errs.join(' | ') : 0} · hero frames change=${heroOk} · scrub eased=${smooth} · day moves=${dayOk} · fallback=${state.cls} · poster=${state.poster} · cue=${state.cueAnim}`);
  if (errs.length || !heroOk || !smooth || state.cls || state.poster !== 'none') fail++;
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
