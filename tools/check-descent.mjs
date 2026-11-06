// node tools/check-descent.mjs [url] — hero → penthouse → slab → 12 → next section; elevator 12 ↔ 7 ↔ 3
import { chromium, webkit, devices } from 'playwright';
import { spawnSync } from 'node:child_process';
const url = process.argv[2] || 'http://localhost:5173/';
const TOTAL = 2.6;
let fail = 0;
const ok = (c, msg) => { console.log(`   ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };
for (const [name, eng, ctx] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['mobile', webkit, { ...devices['iPhone 13'] }]]) {
  console.log(name);
  const b = await eng.launch(); const p = await b.newPage(ctx);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[AURA]')) errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await p.evaluate(() => scrollBy({ top: 5, behavior: 'instant' })); await p.waitForTimeout(9000);   // let the film finish loading
  const S = (n) => p.screenshot({ path: `screenshots/descent-${name}-${n}.png` });
  const now = () => p.evaluate(() => document.getElementById('liftNow').textContent.replace(/[⁦⁩]/g, '').trim());
  const toU = (u) => p.evaluate(([u, T]) => { const s = document.getElementById('views'), st = document.getElementById('descentStage'); scrollTo({ top: s.offsetTop + (u / T) * (s.offsetHeight - st.clientHeight), behavior: 'instant' }); }, [u, TOTAL]);
  // 1. hand-off
  await p.evaluate(() => { const h = document.getElementById('top'); scrollTo({ top: h.offsetTop + h.offsetHeight - innerHeight - 2, behavior: 'instant' }); }); await p.waitForTimeout(2600); await S('a-hero-end');
  await toU(0.02); await p.waitForTimeout(1600); await S('b-descent-start');
  const crop = name === 'desktop' ? 'crop=iw-220:ih*0.3:220:0' : 'crop=iw:ih*0.4:0:0';
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', `screenshots/descent-${name}-a-hero-end.png`, '-i', `screenshots/descent-${name}-b-descent-start.png`, '-lavfi', `[0]${crop}[x];[1]${crop}[y];[x][y]psnr`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /average:([\d.]+|inf)/.exec(r.stderr || ''); const db = m ? (m[1] === 'inf' ? 99 : +m[1]) : 0;
  ok(db > 28, `hero last frame → descent first frame (PSNR ${db.toFixed(1)} dB)`);
  // 2. scroll path: penthouse → slab → 12, nothing more
  await toU(1.15); await p.waitForTimeout(2000); await S('c-slab-passing');
  ok(await p.evaluate(() => { const r = document.querySelector('.dslab').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }), 'slab on screen mid-descent');
  await toU(2.3); await p.waitForTimeout(2200); await S('d-floor-12-landed');
  const n12 = await now();
  const pulse = await p.evaluate(() => document.getElementById('lift').dataset.pulsed === '1' && document.getElementById('lift').classList.contains('is-inviting'));
  ok(n12 === 'קומה 12' && pulse, `scroll lands on "${n12}"; hint shown, button 7 pulses`);
  const geo = await p.evaluate(() => { const s = document.getElementById('views'), st = document.getElementById('descentStage'), nx = s.nextElementSibling; return { pin: (s.offsetHeight - st.clientHeight) / innerHeight, gap: nx.getBoundingClientRect().top - s.getBoundingClientRect().bottom, next: nx.id }; });
  ok(Math.abs(geo.pin - TOTAL) < .05 && Math.abs(geo.gap) < 1, `pinned scroll length ${geo.pin.toFixed(2)} viewports (was 7.25); next section "#${geo.next}" follows directly (gap ${geo.gap.toFixed(1)}px)`);
  await p.evaluate(() => { const s = document.getElementById('views'); scrollTo({ top: s.offsetTop + s.offsetHeight - innerHeight * .4, behavior: 'instant' }); }); await p.waitForTimeout(1200); await S('e-next-section');
  ok(await p.evaluate(() => { const r = document.getElementById('project').getBoundingClientRect(); return r.top < innerHeight * .7; }), 'scrolling on from floor 12 goes straight into the project section');
  // 3. elevator: 7, 3, back to 12 — page does not move
  await toU(2.3); await p.waitForTimeout(2200);
  const y0 = await p.evaluate(() => scrollY);
  const click = async (k) => { const bb = await p.locator(`.lift__btns button[data-k="${k}"]`).boundingBox(); if (name === 'desktop') await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); else await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const res = [];
  for (const [k, label, n] of [[2, 'קומה 7', '7'], [3, 'קומה 3', '3'], [1, 'קומה 12', '12']]) {
    const t0 = Date.now(); await click(k); await p.waitForTimeout(700);
    const mid = await now(); await S(`f-to-${n}-mid`);
    await p.waitForTimeout(1400); await S(`g-${n}-landed`); res.push(`${mid} → ${await now()}`);
    ok((await now()) === label && /[↓↑]/.test(mid), `click ${n}: mid "${mid}", landed "${await now()}"`);
  }
  const y1 = await p.evaluate(() => scrollY);
  ok(Math.abs(y1 - y0) < 1, `page scroll unchanged by the elevator (${y0} → ${y1})`);
  // 4. go to 3, then scroll back up: control returns to the scroll and it ascends to the penthouse
  await click(3); await p.waitForTimeout(2000);
  await toU(1.0); await p.waitForTimeout(1500); const mid2 = await now();
  await toU(0.1); await p.waitForTimeout(2200); const top = await now();
  ok(top === 'פנטהאוז', `scrolling back up from floor 3 ascends to "${top}" (mid "${mid2}")`);
  ok(!errs.length, `page errors: ${errs.length ? errs.join(' | ') : 0}`);
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
