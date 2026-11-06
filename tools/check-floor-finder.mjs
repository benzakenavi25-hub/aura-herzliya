// node tools/check-floor-finder.mjs [url]
import { chromium, webkit, devices } from 'playwright';
const url = process.argv[2] || 'http://localhost:5173/';
let fail = 0; const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
for (const [name, eng, ctx] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['mobile', webkit, { ...devices['iPhone 13'] }]]) {
  console.log(name);
  const b = await eng.launch(); const p = await b.newPage(ctx);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[AURA]')) errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  const S = (n) => p.screenshot({ path: `screenshots/ff-${name}-${n}.png` });
  await p.evaluate(() => document.getElementById('floors').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(1500);
  if (name === 'mobile') await p.evaluate(() => scrollBy({ top: 40, behavior: 'instant' })); await p.waitForTimeout(400);
  await S('1-dimmed');
  const units = await p.evaluate(() => document.querySelectorAll('#ffIndex button').length);
  ok(units === 13, `floor index has 13 entries (12 → 1, קרקע): ${units}`);
  // light floor 7
  const hit = p.locator('.ff__hit[data-f="7"]'); const hb = await hit.boundingBox();
  if (name === 'desktop') await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); else await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.waitForTimeout(600); await S('2-floor-7-lit');
  const lit = await p.evaluate(() => ({ t: getComputedStyle(document.getElementById('floors')).getPropertyValue('--t').trim(), now: document.getElementById('ffNow').textContent }));
  ok(lit.t === '38.55%', `floor 7 band lit (top ${lit.t}) · "${lit.now}"`);
  // open plan
  if (name === 'desktop') await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2); else await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.waitForTimeout(1800);
  const plan = await p.evaluate(() => ({ on: document.getElementById('floors').classList.contains('is-plan'), title: document.getElementById('ffPlanTitle').textContent, apts: document.querySelectorAll('#ffSvg .apt').length, stat: document.getElementById('ffPlanStat').textContent }));
  ok(plan.on && plan.apts === 3, `plan view: "${plan.title}" · ${plan.apts} apartments · ${plan.stat}`);
  await p.evaluate(() => document.getElementById('floors').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(500);
  await S('3-plan-floor-7');
  // tap an apartment
  await p.evaluate(() => document.querySelectorAll('#ffSvg .apt')[1].scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(400);
  const ab = await p.locator('#ffSvg .apt').nth(1).boundingBox(); if (name === 'desktop') await p.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2); else await p.touchscreen.tap(ab.x + ab.width / 2, ab.y + ab.height / 2); await p.waitForTimeout(700);
  await S('4-apartment-card');
  const card = await p.evaluate(() => ({ open: document.getElementById('ffCard').classList.contains('is-open'), t: document.getElementById('ffCardK').textContent + ' · ' + document.getElementById('ffCardTitle').textContent }));
  ok(card.open, `apartment card: ${card.t}`);
  // other plates + totals
  const totals = await p.evaluate(async () => { const r = {}; let all = 0; for (const f of [0, 1, 10, 11, 12]) { document.querySelector(`#ffIndex button[data-f="${f}"]`).click(); await new Promise((x) => setTimeout(x, 150)); r[f] = document.querySelectorAll('#ffSvg .apt').length; } return r; });
  await p.evaluate(() => document.getElementById('floors').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(500); await S('5-plan-penthouse');
  ok(totals[0] === 4 && totals[1] === 3 && totals[11] === 3 && totals[12] === 1, `plates: ground ${totals[0]} · typical ${totals[1]} · 11 ${totals[11]} · 12 ${totals[12]} (total 4 + 30 + 3 + 1 = 38)`);
  // keyboard: Esc returns, arrows move, Enter opens
  if (name === 'desktop') {
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const back = await p.evaluate(() => !document.getElementById('floors').classList.contains('is-plan') && document.activeElement.dataset.f);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
    const f2 = await p.evaluate(() => document.activeElement.dataset.f);
    await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const opened = await p.evaluate(() => document.getElementById('ffPlanTitle').textContent);
    ok(back === '12' && f2 === '11' && /11/.test(opened), `keyboard: Esc → building (focus ${back}), ↓ → ${f2}, Enter → "${opened}"`);
    await p.click('#ffPlanBtn'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.getElementById('planDlg').open), 'לתוכנית הדירה opens the plan dialog');
    await p.keyboard.press('Escape');
  }
  ok(!errs.length, `page errors: ${errs.length ? errs.join(' | ') : 0}`);
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
