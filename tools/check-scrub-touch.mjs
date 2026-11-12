// Touch hero scrub check (WebKit, iPhone 13): fast flicks forward and backward through the hero.
// Instruments the hero canvas to log which frame is drawn on every animation frame, and reports
// the biggest jump between consecutive drawn frames, slow frames, live ImageBitmaps and errors.
// Usage: node tools/check-scrub-touch.mjs [baseUrl] [webkit|chromium]
import { webkit, chromium, devices } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173/';
const engine = process.argv[3] === 'chromium' ? chromium : webkit;
const browser = await engine.launch();
const page = await browser.newPage({ ...devices['iPhone 13'] });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const urlOf = new WeakMap(), idxOf = new WeakMap();
  const log = (window.__log = { draws: [], live: 0, maxLive: 0, decodes: 0 });
  const blob = Response.prototype.blob;
  Response.prototype.blob = function () { const u = this.url; return blob.call(this).then((b) => { urlOf.set(b, u); return b; }); };
  const cib = window.createImageBitmap;
  window.createImageBitmap = function (src, ...r) {
    return cib.call(this, src, ...r).then((bm) => {
      const m = /(\d{4})\.webp/.exec(urlOf.get(src) || '');
      if (m) { idxOf.set(bm, +m[1] - 1); log.decodes++; log.live++; log.maxLive = Math.max(log.maxLive, log.live); }
      return bm;
    });
  };
  const close = ImageBitmap.prototype.close;
  ImageBitmap.prototype.close = function () { if (idxOf.has(this)) log.live--; return close.call(this); };
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...r) {
    if (this.canvas.id === 'heroCanvas' && idxOf.has(img)) log.draws.push([performance.now(), idxOf.get(img), this.globalAlpha]);
    return di.call(this, img, ...r);
  };
  // rAF intervals
  log.gaps = [];
  let last = 0;
  const f = (t) => { if (last) log.gaps.push(t - last); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
await page.goto(base, { waitUntil: 'load' });
await page.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
const env = await page.evaluate(() => ({ touch: matchMedia('(hover: none) and (pointer: coarse)').matches, h: document.querySelector('#top').offsetHeight, vh: innerHeight }));
console.log('env', env);
await page.waitForTimeout(3000); // let the rest of the frames download

// a flick: momentum scroll with exponential decay, one scroll step per animation frame
const flick = (dist, ms) => page.evaluate(([dist, ms]) => new Promise((res) => {
  const y0 = scrollY, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    window.scrollTo(0, y0 + dist * e);
    if (k < 1) requestAnimationFrame(step); else res();
  };
  requestAnimationFrame(step);
}), [dist, ms]);

const report = async (label) => {
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const L = window.__log;
    // primary frame per draw (alpha 1); biggest index jump between consecutive draws
    const prim = L.draws.filter((d) => d[2] === 1).map((d) => d[1]);
    let maxJump = 0;
    for (let i = 1; i < prim.length; i++) maxJump = Math.max(maxJump, Math.abs(prim[i] - prim[i - 1]));
    const slow = L.gaps.filter((g) => g > 34).length;
    const out = { draws: prim.length, from: prim[0], to: prim[prim.length - 1], maxJump, slowFrames: slow, frames: L.gaps.length, live: L.live, maxLive: L.maxLive, decodes: L.decodes };
    L.draws = []; L.gaps = [];
    return out;
  });
  console.log(label, JSON.stringify(r));
};

const H = env.h - env.vh;
await page.evaluate(() => { window.__log.draws = []; window.__log.gaps = []; });
for (const [label, dist, ms] of [
  ['fwd 2500px/350ms', 2500, 350], ['fwd 2500px/350ms', 2500, 350], ['back 4500px/400ms', -4500, 400],
  ['fwd 6200px/500ms (stays in hero)', 6200, 500], ['back 6200px/500ms (to top)', -6200, 500],
  ['fwd past the end (hand-off forces final frame)', H + 600, 600], ['back to top', -(H + 600), 600],
]) { await flick(dist, ms); await report(label); }
console.log('errors', errors);
await browser.close();
