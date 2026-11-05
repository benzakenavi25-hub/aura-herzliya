import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: 'screenshots/reduced-top.png' });
const frames = await p.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/frames/')).length);
// keyboard: tab through first focusables
await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
const focused = await p.evaluate(() => document.activeElement.outerHTML.slice(0, 80));
console.log('frames requested in reduced mode:', frames, '| 2nd tab focus:', focused);
await b.close();
