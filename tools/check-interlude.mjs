// Interlude check (views → interlude → residences), forward and backward, desktop + iPhone.
// Usage: node tools/check-interlude.mjs [baseUrl] [outDir]
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'screenshots';
mkdirSync(out, { recursive: true });
const runs = [
  { name: 'desktop', engine: chromium, ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'iphone', engine: webkit, ctx: { ...devices['iPhone 13'] } },
];
const P = [-0.25, -0.02, 0.01, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.3];

const state = (page) => page.evaluate(() => {
  const op = (s) => +getComputedStyle(document.querySelector(s)).opacity;
  const ilu = document.querySelector('#interlude'), res = document.querySelector('#residences');
  const st = document.querySelector('.interlude__stage').getBoundingClientRect();
  return {
    p: +((scrollY - ilu.offsetTop) / innerHeight / 1.5).toFixed(3),
    handed: document.querySelector('#views').classList.contains('is-handed'),
    out: getComputedStyle(document.querySelector('#descentStage')).getPropertyValue('--out') || '0',
    stageTop: Math.round(st.top),
    blur: op('.interlude__blur').toFixed(2), vig: op('.interlude__vignette').toFixed(2), veil: op('.interlude__veil').toFixed(2),
    l1: op('.interlude__l1').toFixed(2), l2: op('.interlude__l2').toFixed(2),
    resTop: Math.round(res.getBoundingClientRect().top),
    header: document.querySelector('#header').classList.contains('is-visible'),
    wa: (document.querySelector('.wa')?.classList.contains('is-visible') || false) || (document.querySelector('#mbar')?.classList.contains('is-visible') || false),
  };
});

for (const run of runs) {
  const browser = await run.engine.launch();
  const page = await browser.newPage(run.ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1200);
  const { top, ih } = await page.evaluate(() => ({ top: document.querySelector('#interlude').offsetTop, ih: innerHeight }));
  // walk down to the section first so the descent has landed on floor 12
  for (const f of [0.5, 0.8, 0.95]) { await page.evaluate((y) => window.scrollTo(0, y), Math.round(top * f)); await page.waitForTimeout(500); }
  for (const dir of ['fwd', 'back']) {
    const seq = dir === 'fwd' ? P : [...P].reverse();
    for (const p of seq) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(top + p * 1.5 * ih));
      await page.waitForTimeout(1400);
      const s = await state(page);
      console.log(run.name, dir, JSON.stringify(s));
      await page.screenshot({ path: `${out}/${run.name}-${dir}-${String(p).replace('.', '_')}.png` });
    }
  }
  // seam check: just before / just after the hand-off, the two frames must match
  await page.evaluate((y) => window.scrollTo(0, y), top - 2); await page.waitForTimeout(1400);
  const a = await page.screenshot({ path: `${out}/${run.name}-seam-a.png` });
  await page.evaluate((y) => window.scrollTo(0, y), top + 2); await page.waitForTimeout(1400);
  const b = await page.screenshot({ path: `${out}/${run.name}-seam-b.png` });
  console.log(run.name, 'seam bytes equal:', a.equals(b), 'sizes', a.length, b.length);
  console.log(run.name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
}
