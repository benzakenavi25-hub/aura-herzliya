// Screenshot pass: node tools/shots.mjs [baseUrl] [only=desktop|mobile]
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3];
mkdirSync('screenshots', { recursive: true });

const HERO_P = [0, 0.08, 0.22, 0.34, 0.47, 0.56, 0.66, 0.8, 0.9, 0.95, 0.985];
const SECTIONS = ['project', 'residences', 'specs', 'location', 'progress', 'gallery', 'contact'];

const runs = [
  { name: 'desktop', engine: chromium, ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'mobile', engine: webkit, ctx: { ...devices['iPhone 13'] } },
];

for (const run of runs) {
  if (only && run.name !== only) continue;
  const browser = await run.engine.launch();
  const page = await browser.newPage(run.ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(800);

  const heroH = await page.evaluate(() => { const h = document.querySelector('#top'); return h.offsetHeight - innerHeight; });
  for (const p of HERO_P) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(p * heroH));
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `screenshots/${run.name}-hero-${String(Math.round(p * 1000)).padStart(3, '0')}.png` });
  }
  // the dusk → stone bridge
  await page.evaluate((y) => window.scrollTo(0, y), heroH + Math.round(run.ctx.viewport.height * 0.6));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${run.name}-bridge.png` });

  for (const id of SECTIONS) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ behavior: 'instant', block: 'start' }), id);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `screenshots/${run.name}-${id}.png` });
    // full section
    const el = await page.$('#' + id);
    await page.evaluate((id) => document.querySelectorAll(`#${id} [data-reveal], #${id} [data-reveal-lines]`).forEach((e) => e.classList.add('is-in')), id);
    await page.waitForTimeout(1400);
    await el.screenshot({ path: `screenshots/${run.name}-${id}-full.png` });
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `screenshots/${run.name}-footer.png` });
  console.log(run.name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
}
