// node tools/check-floor-finder.mjs [url]
import { chromium, webkit, devices } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
const BANDS = { 12: [7.6, 16.4], 11: [15.7, 22.1], 10: [21.4, 27.6], 9: [26.9, 33.3], 8: [32.6, 38.9], 7: [38.2, 44.4], 6: [43.7, 49.9], 5: [49.2, 55.4], 4: [54.7, 60.8], 3: [60.2, 66.3], 2: [65.6, 71.7], 1: [71.0, 76.9], 0: [76.9, 91.9] };
let fail = 0; const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
for (const [name, eng, ctx] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['mobile', webkit, { ...devices['iPhone 13'] }]]) {
  console.log(name);
  const b = await eng.launch(); const p = await b.newPage(ctx);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[AURA]')) errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const S = (n) => p.screenshot({ path: `screenshots/ff-${name}-${n}.png` });
  await p.evaluate((m) => { const f = document.getElementById(m ? 'ffFig' : 'floors'); f.scrollIntoView({ behavior: 'instant', block: m ? 'center' : 'start' }); }, name === 'mobile'); await p.waitForTimeout(1500);
  await S('1-dimmed');
  // every number centred on its own floor band
  const geo = await p.evaluate(() => { const r = document.getElementById('ffFig').getBoundingClientRect(); return { top: r.top, h: r.height, left: r.left, w: r.width, items: [...document.querySelectorAll('.ff__lvl')].map((x) => { const q = x.getBoundingClientRect(), tick = x.querySelector('.tick').getBoundingClientRect(); return { f: +x.dataset.f, cy: q.top + q.height / 2, tickRight: tick.right }; }) }; });
  let worst = 0, touch = 0;
  for (const it of geo.items) { const [t, bb] = BANDS[it.f]; const want = geo.top + geo.h * (t + bb) / 200; worst = Math.max(worst, Math.abs(it.cy - want)); touch = Math.max(touch, Math.abs(it.tickRight - (geo.left + geo.w * 0.215))); }
  ok(geo.items.length === 13 && worst <= 1.5 && touch <= 1.5, `13 numbers, each centred on its floor band (max offset ${worst.toFixed(2)}px), ticks touch the facade (max ${touch.toFixed(2)}px)`);
  ok(await p.evaluate(() => !document.querySelector('.ff__tag, .ff__now') && document.querySelectorAll('#ffSum').length === 1), 'exactly one summary (no floating duplicate label)');
  for (const f of [9, 3]) {
    const y = geo.top + geo.h * (BANDS[f][0] + BANDS[f][1]) / 200, x = geo.left + geo.w * 0.5;
    if (name === 'desktop') await p.mouse.move(x, y); else await p.touchscreen.tap(x, y);
    await p.waitForTimeout(500); await S(`2-floor-${f}-lit`);
    const st = await p.evaluate(() => ({ t: getComputedStyle(document.getElementById('floors')).getPropertyValue('--t').trim(), sum: document.getElementById('ffSum').textContent, hot: document.querySelector('.ff__lvl.is-hot')?.dataset.f }));
    ok(st.t === BANDS[f][0] + '%' && st.hot === String(f), `floor ${f}: band lit at ${st.t}, number ${st.hot} highlighted · "${st.sum}"`);
  }
  // hovering a number lights its floor too (desktop)
  if (name === 'desktop') { await p.hover('.ff__lvl[data-f="5"]'); await p.waitForTimeout(400); ok(await p.evaluate(() => document.getElementById('ffSum').textContent.startsWith('קומה 5')), 'hovering number 5 lights floor 5'); }
  // open plan (second tap on phones / click on desktop) on floor 3
  const y3 = geo.top + geo.h * (BANDS[3][0] + BANDS[3][1]) / 200, x3 = geo.left + geo.w * 0.5;
  if (name === 'desktop') await p.mouse.click(x3, y3); else await p.touchscreen.tap(x3, y3);
  await p.waitForTimeout(1800);
  const plan = await p.evaluate(() => ({ on: document.getElementById('floors').classList.contains('is-plan'), title: document.getElementById('ffPlanTitle').textContent, apts: document.querySelectorAll('#ffSvg .apt').length }));
  ok(plan.on && plan.apts === 3 && /03/.test(plan.title), `plan view: "${plan.title}" · ${plan.apts} apartments`);
  await p.evaluate(() => document.getElementById('floors').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(500); await S('3-plan');
  await p.evaluate(() => document.querySelectorAll('#ffSvg .apt')[1].scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(400);
  const ab = await p.locator('#ffSvg .apt').nth(1).boundingBox(); if (name === 'desktop') await p.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2); else await p.touchscreen.tap(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await p.waitForTimeout(700); await S('4-card');
  ok(await p.evaluate(() => document.getElementById('ffCard').classList.contains('is-open')), 'apartment card opens');
  if (name === 'desktop') {
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const back = await p.evaluate(() => !document.getElementById('floors').classList.contains('is-plan') && document.activeElement.dataset.f);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
    const f2 = await p.evaluate(() => document.activeElement.dataset.f);
    await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    ok(back === '3' && f2 === '2' && /02/.test(await p.evaluate(() => document.getElementById('ffPlanTitle').textContent)), `keyboard: Esc → building (focus ${back}), ↓ → ${f2}, Enter opens it`);
  }
  ok(!errs.length, `page errors: ${errs.length ? errs.join(' | ') : 0}`);
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
