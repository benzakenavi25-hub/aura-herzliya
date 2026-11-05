// Screenshot + interaction pass: node tools/shots.mjs [baseUrl] [desktop|mobile] [hero]
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3];
const withHero = process.argv.includes('hero');
mkdirSync('screenshots', { recursive: true });

const HERO_P = [0, 0.04, 0.10, 0.25, 0.40, 0.50, 0.58, 0.67, 0.80, 0.90, 0.95, 1.0];
const SECTIONS = ['manifesto', 'project', 'views', 'residences', 'floors', 'materials', 'building', 'day', 'location', 'team', 'faq', 'contact'];

const runs = [
  { name: 'desktop', engine: chromium, ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'mobile', engine: webkit, ctx: { ...devices['iPhone 13'] } },
];
const wait = (p, ms) => p.waitForTimeout(ms);
const to = (p, id, block = 'start') => p.evaluate(([id, block]) => document.getElementById(id).scrollIntoView({ behavior: 'instant', block }), [id, block]);
const revealAll = (p) => p.evaluate(() => document.querySelectorAll('[data-reveal],[data-reveal-lines],.img-reveal').forEach((e) => e.classList.add('is-in')));

for (const run of runs) {
  if (only && run.name !== only) continue;
  const browser = await run.engine.launch();
  const page = await browser.newPage(run.ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const S = (n) => page.screenshot({ path: `screenshots/${run.name}-${n}.png` });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await wait(page, 1500);
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
  console.log(`${run.name}: first-load transfer before scrolling ≈ ${(bytes / 1048576).toFixed(2)} MB`);

  if (withHero) {
    const heroH = await page.evaluate(() => document.querySelector('#top').offsetHeight - innerHeight);
    for (const p of HERO_P) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(p * heroH));
      await wait(page, 2000);
      await S(`hero-${String(Math.round(p * 1000)).padStart(3, '0')}`);
    }
  }
  // hero → manifesto handoff
  await page.evaluate(() => { const h = document.querySelector('#top'); window.scrollTo(0, h.offsetTop + h.offsetHeight - innerHeight * 0.35); });
  await wait(page, 1600); await S('handoff');

  for (const id of SECTIONS) {
    await to(page, id); await wait(page, 1700);
    await S(id);
  }
  // section details
  await to(page, 'manifesto'); await page.evaluate(() => window.scrollBy(0, innerHeight * 0.9)); await wait(page, 1500); await S('manifesto-image');
  await to(page, 'views'); await wait(page, 600);
  await page.click('.views__floors [data-i="2"]'); await wait(page, 1900); await S('views-12');
  await page.click('.views__floors [data-i="1"]'); await wait(page, 500); await S('views-7-mid');
  await to(page, 'residences'); await page.evaluate(() => window.scrollBy(0, 300)); await wait(page, 900);
  await page.click('#tab-ph'); await wait(page, 1300); await S('residences-penthouse');
  await page.click('#planBtn'); await wait(page, 900); await S('plan-overlay');
  await page.keyboard.press('Escape'); await wait(page, 400);
  await to(page, 'floors', 'center'); await wait(page, 900);
  if (run.name === 'desktop') {
    const box = await page.locator('.floors__hit[data-n="10"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await wait(page, 600); await S('floors-hover10');
    await page.click('.floors__hit[data-n="12"]'); await wait(page, 500); await S('floors-select12');
  } else {
    await page.locator('#floorsList button[data-n="8"]').click(); await wait(page, 1200); await S('floors-tap8');
    await to(page, 'floorsList', 'start'); await wait(page, 600); await S('floors-list');
  }
  await page.click('#fcCta'); await wait(page, 1400); await S('contact-prefilled');
  await to(page, 'materials'); await page.evaluate(() => window.scrollBy(0, innerHeight * 1.2)); await wait(page, 1200); await S('materials-2');
  await page.click('.acc--spec summary'); await wait(page, 800); await S('spec-open');
  await to(page, 'building'); await page.evaluate(() => window.scrollBy(0, innerHeight * 1.3)); await wait(page, 1500); await S('building-2');
  // day: middle of the horizontal journey
  if (run.name === 'desktop') {
    await page.evaluate(() => { const d = document.getElementById('day'); window.scrollTo(0, d.offsetTop + (d.offsetHeight - innerHeight) * 0.5); });
  } else {
    await to(page, 'day'); await page.evaluate(() => { const v = document.querySelector('.day__viewport'); v.scrollBy({ left: -v.clientWidth * 2, behavior: 'instant' }); });
  }
  await wait(page, 1800); await S('day-mid');
  await to(page, 'location'); await page.evaluate(() => window.scrollBy(0, innerHeight * 0.6)); await wait(page, 4000); await S('map');
  if (run.name === 'mobile') { await page.click('#mapActivate').catch(() => {}); await wait(page, 500); await S('map-active'); }
  else { await page.hover('#places li[data-pin="marina"]'); await wait(page, 600); await S('map-hover'); }
  await to(page, 'faq'); await page.click('.faq__list details:nth-child(2) summary'); await wait(page, 700); await S('faq-open');
  await to(page, 'contact'); await page.click('#brochureBtn'); await wait(page, 700); await S('brochure');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(page, 1200); await S('footer');
  if (run.name === 'mobile') {
    await page.evaluate(() => window.scrollBy(0, -200)); await wait(page, 700);
    await page.tap('#menuBtn'); await wait(page, 700); await S('menu');
  }
  // full page (reveal everything first)
  await revealAll(page); await wait(page, 1300);
  console.log(run.name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
}
