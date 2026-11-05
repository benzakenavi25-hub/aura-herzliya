// Screenshot pass: node tools/shots.mjs [baseUrl] [only=desktop|mobile]
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3];
mkdirSync('screenshots', { recursive: true });

const HERO_P = [0, 0.04, 0.10, 0.25, 0.40, 0.50, 0.58, 0.67, 0.80, 0.90, 0.95, 1.0];
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
  if (run.name === 'mobile') {
    // menu overlay over content
    await page.evaluate(() => document.getElementById('specs').scrollIntoView({ behavior: 'instant' }));
    await page.waitForTimeout(900);
    await page.click('#menuBtn'); await page.waitForTimeout(700);
    await page.screenshot({ path: `screenshots/${run.name}-menu.png` });
    const locked = await page.evaluate(() => getComputedStyle(document.body).overflow);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const closed = await page.evaluate(() => !document.getElementById('mobileNav').classList.contains('is-open'));
    console.log('menu scroll-lock:', locked, '| closes on Escape:', closed);
    // timeline: first card + scrolled one card
    await page.evaluate(() => document.getElementById('timeline').scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/${run.name}-timeline.png` });
    // a mid-section frame to check the floating button is not over content at rest
    await page.evaluate(() => document.getElementById('residences').scrollIntoView({ behavior: 'instant' }));
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/${run.name}-plan.png` });
  }
  console.log(run.name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
}
