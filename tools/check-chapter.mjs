import { chromium, webkit, devices } from 'playwright';
for (const [name, eng, ctx] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['mobile', webkit, devices['iPhone 13']]]) {
  const b = await eng.launch(); const p = await b.newPage(ctx);
  await p.goto('http://localhost:5173/', { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached' });
  const h = await p.evaluate(() => document.querySelector('#top').offsetHeight - innerHeight);
  await p.evaluate((y) => scrollTo(0, y), Math.round(h * 0.67)); await p.waitForTimeout(3500);
  await p.screenshot({ path: `screenshots/${name}-hero-670.png` }); await b.close();
}
