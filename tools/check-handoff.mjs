// Hero → descent hand-off check: screenshot just before / just after the swap, forwards and backwards,
// and report the pixel difference. Usage: node tools/check-handoff.mjs [baseUrl]
import { chromium, webkit, devices } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173/';
const runs = [
  { name: 'desktop', engine: chromium, ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'iphone', engine: webkit, ctx: { ...devices['iPhone 13'] } },
];

async function diff(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const c = (i) => { const k = document.createElement('canvas'); k.width = i.width; k.height = i.height; const g = k.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const da = c(ia), db = c(ib);
    let n = 0, max = 0, sum = 0;
    for (let p = 0; p < da.length; p += 4) {
      const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]));
      if (d > 0) n++; if (d > max) max = d; sum += d;
    }
    return { differing: n, of: da.length / 4, maxDelta: max, meanDelta: +(sum / (da.length / 4)).toFixed(3) };
  }, [a, b]);
}

for (const run of runs) {
  const browser = await run.engine.launch();
  const page = await browser.newPage(run.ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => document.querySelector('#views').offsetTop);
  const go = async (y) => { await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y); await page.waitForTimeout(1800); };
  const shot = async () => (await page.screenshot()).toString('base64');
  const info = () => page.evaluate(() => ({ handed: document.querySelector('#top').classList.contains('is-handed'), y: Math.round(scrollY) }));
  for (const dir of ['forward', 'backward']) {
    // approach slowly in small steps so the scrub smoothing settles like a real slow scroll
    // forward: hero side (top-3) then descent side (top); backward: the reverse order
    const seq = dir === 'forward' ? [top - 400, top - 150] : [top + 300, top + 100];
    for (const y of seq) await go(y);
    const [y1, y2] = dir === 'forward' ? [top - 3, top] : [top, top - 3];
    await go(y1); const a = await shot(); const iB = await info();
    await go(y2); const b = await shot(); const iA = await info();
    const res = await diff(page, a, b);
    console.log(run.name, dir, JSON.stringify(iB), '→', JSON.stringify(iA), JSON.stringify(res));
  }
  console.log(run.name, 'errors:', errors.length ? errors : 'none');
  await browser.close();
}
