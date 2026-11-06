// node tools/check-descent.mjs [url] — hero → descent handoff, slabs, landings, buttons, reverse
import { chromium, webkit, devices } from 'playwright';
import { spawnSync } from 'node:child_process';
const url = process.argv[2] || 'http://localhost:5173/';
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('   ✗ ' + msg); } else console.log('   ✓ ' + msg); };
for (const [name, eng, ctx] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['mobile', webkit, { ...devices['iPhone 13'] }]]) {
  console.log(name);
  const b = await eng.launch(); const p = await b.newPage(ctx);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await p.evaluate(() => scrollBy(0, 5)); await p.waitForTimeout(9000);   // let the whole film finish loading
  const S = (n) => p.screenshot({ path: `screenshots/descent-${name}-${n}.png` });
  const now = () => p.evaluate(() => document.getElementById('liftNow').textContent.replace(/[⁦⁩]/g, '').trim());
  const toU = (u) => p.evaluate((u) => { const s = document.getElementById('views'), st = document.getElementById('descentStage'); scrollTo({ top: s.offsetTop + (u / 7.25) * (s.offsetHeight - st.clientHeight), behavior: 'instant' }); }, u);
  // 1. handoff: hero at 100% vs. the descent's first instant
  await p.evaluate(() => { const h = document.getElementById('top'); scrollTo(0, h.offsetTop + h.offsetHeight - innerHeight - 2); }); await p.waitForTimeout(2600); await S('a-hero-end');
  await toU(0.02); await p.waitForTimeout(1600); await S('b-descent-start');
  // compare the image area only (the elevator panel exists only in the descent frame)
  const crop = name === 'desktop' ? 'crop=iw-220:ih*0.3:220:0' : 'crop=iw:ih*0.4:0:0';
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', `screenshots/descent-${name}-a-hero-end.png`, '-i', `screenshots/descent-${name}-b-descent-start.png`, '-lavfi', `[0]${crop}[x];[1]${crop}[y];[x][y]psnr`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /average:([\d.]+|inf)/.exec(r.stderr || ''); const db = m ? (m[1] === 'inf' ? 99 : +m[1]) : 0;
  ok(db > 28, `hero last frame → descent first frame match (PSNR ${db.toFixed(1)} dB on the image area)`);
  // 2. going down
  await toU(0.75); await p.waitForTimeout(2000); await S('c-room-leaving');
  await toU(1.15); await p.waitForTimeout(2000); await S('d-slab-passing');
  const slabVis = await p.evaluate(() => { const r = document.querySelector('.dslab').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  ok(slabVis, 'slab is on screen mid-descent');
  await toU(1.55); await p.waitForTimeout(2000); await S('e-ceiling-arriving');
  const seq = [];
  for (const [u, n] of [[2.27, '12'], [4.52, '7'], [6.85, '3']]) { await toU(u); await p.waitForTimeout(2200); seq.push(await now()); await S(`f-floor-${n}`); }
  ok(seq.join('|') === 'קומה 12|קומה 7|קומה 3', `landings in order: ${seq.join(' → ')}`);
  // 3. reverse
  await toU(5.6); await p.waitForTimeout(500); await p.evaluate(() => scrollBy(0, -40)); await p.waitForTimeout(250); const up = await now();
  const back = [];
  for (const u of [4.52, 2.27, 0.12]) { await toU(u); await p.waitForTimeout(2200); back.push(await now()); }
  ok(up.startsWith('↑') && back.join('|') === 'קומה 7|קומה 12|פנטהאוז', `ascending: "${up}" then ${back.join(' → ')}`);
  // 4. buttons
  { const bb = await p.locator('.lift__btns button[data-k="2"]').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); } await p.waitForTimeout(4500); const b7 = await now();
  await S('g-after-click-7');
  await p.focus('.lift__btns button[data-k="2"]'); await p.keyboard.press(name === 'desktop' ? 'ArrowDown' : 'ArrowLeft'); await p.waitForTimeout(3500); const b3 = await now();
  ok(b7 === 'קומה 7' && b3 === 'קומה 3', `button 7 → "${b7}", keyboard next → "${b3}"`);
  const box = await p.locator('.lift').boundingBox(); const tap = await p.locator('.lift__btns button').first().boundingBox();
  ok(box && tap.height >= 52, `elevator panel visible (${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}), tap height ${Math.round(tap.height)}px`);
  await toU(2.27); await p.waitForTimeout(2200); await S('h-floor-12-landed');
  // header must not cover the descent
  const hdr = await p.evaluate(() => document.getElementById('header').classList.contains('is-visible'));
  ok(!hdr, 'header stays hidden during the descent');
  ok(!errs.length, `page errors: ${errs.length ? errs.join(' | ') : 0}`);
  await b.close();
}
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
