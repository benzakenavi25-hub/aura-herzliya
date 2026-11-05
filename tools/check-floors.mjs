import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5173/', { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached' });
await p.evaluate(() => document.getElementById('floors').scrollIntoView({ block: 'center' })); await p.waitForTimeout(800);
for (const n of [2, 7, 11, 12]) { const bx = await p.locator(`.floors__hit[data-n="${n}"]`).boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(450); await p.screenshot({ path: `screenshots/fl-${n}.png`, clip: { x: 720, y: 0, width: 720, height: 900 } }); }
await b.close();
