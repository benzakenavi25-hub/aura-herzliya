/* AURA · Herzliya Pituach — main script */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const root = document.documentElement;
  // The full experience always runs, whatever the OS motion setting. The .reduced class below is
  // only the fallback for when the hero frames fail to load (static poster).

  // Each section initialises inside its own boundary: if one part of the page is
  // missing or throws (e.g. a cached older index.html with newer JS), the rest still runs.
  function section(name, fn) {
    try { fn(); } catch (err) { console.error(`[AURA] "${name}" failed to initialise:`, err); }
  }
  // shared helpers used by more than one section
  function setApt(value) {
    const r = $$('input[name="apt"]').find((x) => x.value === value);
    if (r) r.checked = true;
  }
  function openDlg(d) { d.showModal(); root.classList.add('menu-open'); }
  const bridge = {};   // cross-section hooks (e.g. the floor finder opens the residences plan dialog)

  // Native scrolling everywhere. scrollToY is the single place that scrolls programmatically.
  function scrollToY(y, immediate) {
    window.scrollTo({ top: y, behavior: immediate ? 'instant' : 'smooth' });
  }

  /* =======================================================
     HERO — scroll-scrubbed image sequence
     ======================================================= */
  const hero = $('#top');
  const canvas = $('#heroCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const loader = $('#loader');
  const chapters = $$('.chapter', hero);
  const railItems = $$('#rail li');
  const railFill = $('#railFill');
  const fadeEl = $('.hero__fade', hero);

  // Scroll progress (0..1) → video time (s). The construction (0–11 s) gets
  // over half of the scroll; camera moves get less. Tuned by feel.
  const PACE = [
    [0, 0], [0.035, 0], [0.52, 11], [0.6, 13], [0.73, 21],
    // the walk inside ends at 0.925; the last frame (living room → sea) then holds
    // for the final ~7.5% of the scroll with "welcome home" over it
    [0.83, 25], [0.85, 26], [0.925, 31], [1, 31],
  ];
  // Chapter rail: lot, structure, tower, roof, home (by video time)
  const CH_T = [0, 2, 9.6, 15, 26.5];
  // Portrait crop focal point (x, 0..1 within the mobile crop) over time
  const FOCAL = [[0, 0.44], [10, 0.44], [13, 0.5], [31, 0.5]];

  const interp = (table, x) => {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [x0, y0] = table[i - 1], [x1, y1] = table[i];
        return x1 === x0 ? y1 : lerp(y0, y1, (x - x0) / (x1 - x0));
      }
    }
    return table[table.length - 1][1];
  };

  let set = null, times = [], frames = [], ready = [], setKey = 'd';
  let progress = 0, lastDrawKey = '';
  let cw = 0, ch = 0;

  function sizeCanvas() {
    const stage = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
    // ignore small height changes (iOS toolbar) to avoid flashing
    if (w === cw && Math.abs(h - ch) < 2) return;
    cw = canvas.width = w; ch = canvas.height = h;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    measureInset();
    lastDrawKey = '';
    draw();
  }

  function frameIndexAt(t) {
    // binary search: last frame with time <= t
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function nearestReady(i) {
    if (ready[i]) return i;
    for (let d = 1; d < times.length; d++) {
      if (i - d >= 0 && ready[i - d]) return i - d;
      if (i + d < times.length && ready[i + d]) return i + d;
    }
    return -1;
  }

  /* ---- Framing ----
     Desktop/landscape: plain "cover".
     Portrait: during construction (0 → 10.5 s) the mobile crop (the middle ~52% of the
     16:9 film: tower + crane mast) is drawn at the viewport width — i.e. the full frame at
     ~1.9× the viewport — anchored so the street sits at the bottom of the small viewport.
     The sky above it is extended from the frame's own top rows. As the camera lifts off
     (10.5 → 12.5 s, hidden by the cut to the drone shot) it eases to full cover. */
  const FIT_T0 = 10.5, FIT_T1 = 12.5;
  let bottomInset = 0;          // device px between the large and small viewport bottoms
  function measureInset() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:100vh;height:100svh;width:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const svh = probe.getBoundingClientRect().height;
    probe.remove();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bottomInset = Math.max(0, (canvas.parentElement.clientHeight - svh) * dpr);
  }

  function placement(iw, ih, t) {
    const sCover = Math.max(cw / iw, ch / ih);
    const fx = setKey === 'm' ? interp(FOCAL, t) : 0.5;
    const cdw = iw * sCover, cdh = ih * sCover;
    const cover = { s: sCover, dx: clamp(cw / 2 - fx * cdw, cw - cdw, 0), dy: (ch - cdh) / 2 };
    const sFit = cw / iw;
    if (setKey !== 'm' || sFit >= sCover) return cover;
    const e = 1 - smooth(FIT_T0, FIT_T1, t);            // 1 = construction framing
    if (e <= 0) return cover;
    const fdh = ih * sFit;
    const fit = { s: sFit, dx: 0, dy: ch - bottomInset - fdh };
    return { s: lerp(cover.s, fit.s, e), dx: lerp(cover.dx, fit.dx, e), dy: lerp(cover.dy, fit.dy, e) };
  }

  // Sky extension: the top rows of the frame, median-filtered horizontally (so the crane
  // tip or a cable never streaks upward), stretched up, deepened slightly toward the
  // zenith, and faded into the top of the image so there is no seam.
  const stripC = document.createElement('canvas'); stripC.width = 64; stripC.height = 1;
  const sampleC = document.createElement('canvas'); sampleC.width = 64; sampleC.height = 2;
  const skyC = document.createElement('canvas');
  const sampleX = sampleC.getContext('2d', { willReadFrequently: true });
  const stripX = stripC.getContext('2d');
  const skyX = skyC.getContext('2d');
  let stripFor = -1;
  function buildStrip(img, idx) {
    if (stripFor === idx) return;
    stripFor = idx;
    sampleX.clearRect(0, 0, 64, 2);
    sampleX.drawImage(img, 0, 0, img.width, 4, 0, 0, 64, 2);
    let src;
    try { src = sampleX.getImageData(0, 0, 64, 2).data; } catch (e) { stripFor = -2; return; }
    const out = stripX.createImageData(64, 1);
    // median over a window that slides inward at the edges (clamping would repeat an
    // edge outlier — e.g. the crane counterweight at the right edge — and let it win)
    const W = 8;
    for (let x = 0; x < 64; x++) {
      const start = clamp(x - W, 0, 63 - 2 * W);
      for (let c = 0; c < 3; c++) {
        const win = [];
        for (let xx = start; xx <= start + 2 * W; xx++) {
          win.push((src[xx * 4 + c] + src[(64 + xx) * 4 + c]) / 2);
        }
        win.sort((p, q) => p - q);
        out.data[x * 4 + c] = win[W];
      }
      out.data[x * 4 + 3] = 255;
    }
    stripX.putImageData(out, 0, 0);
  }
  function drawSky(pl, iw) {
    const top = Math.ceil(pl.dy);
    if (top <= 0 || stripFor < 0) return;
    const fade = Math.round(28 * Math.min(window.devicePixelRatio || 1, 2));
    const h = top + fade;
    if (skyC.width !== cw || skyC.height !== h) { skyC.width = cw; skyC.height = h; }
    skyX.globalCompositeOperation = 'source-over';
    skyX.imageSmoothingEnabled = true;
    skyX.drawImage(stripC, 0, 0, 64, 1, pl.dx, 0, iw * pl.s, h);
    // a little deeper toward the zenith, like a real sky
    const g = skyX.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, 'rgba(70, 92, 160, .16)'); g.addColorStop(1, 'rgba(70, 92, 160, 0)');
    skyX.fillStyle = g; skyX.fillRect(0, 0, cw, top);
    // feather the bottom edge into the image
    skyX.globalCompositeOperation = 'destination-out';
    const f = skyX.createLinearGradient(0, top - 2, 0, h);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)');
    skyX.fillStyle = f; skyX.fillRect(0, top - 2, cw, h - top + 2);
    skyX.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(skyC, 0, 0);
  }

  function draw() {
    if (!set || !cw) return;
    const t = interp(PACE, progress);
    const i = frameIndexAt(t);
    const a0 = nearestReady(i);
    if (a0 < 0) return;
    // frames are kept as compressed blobs; only the ones being drawn are decoded (ImageBitmap, small LRU)
    let a = a0, img = getBmp(a0);
    if (!img) { a = nearestBmp(a0); if (a < 0) return; img = bmps.get(a); }
    // cross-dissolve to the next frame for sub-frame smoothness
    let b = -1, f = 0, imgB = null;
    if (a0 === i && a === i && i < times.length - 1 && ready[i + 1]) {
      f = clamp((t - times[i]) / (times[i + 1] - times[i]), 0, 1);
      if (f > 0.02) { imgB = getBmp(i + 1); if (imgB) b = i + 1; }
    }
    const key = a + ':' + b + ':' + f.toFixed(2) + ':' + t.toFixed(2);
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    const iw = img.width, ih = img.height;
    const pl = placement(iw, ih, t);
    if (pl.dy > 0.5) { ctx.fillStyle = '#C9C6DA'; ctx.fillRect(0, 0, cw, Math.ceil(pl.dy) + 1); }
    ctx.globalAlpha = 1;
    ctx.drawImage(img, pl.dx, pl.dy, iw * pl.s, ih * pl.s);
    if (b >= 0) { ctx.globalAlpha = f; ctx.drawImage(imgB, pl.dx, pl.dy, iw * pl.s, ih * pl.s); }
    ctx.globalAlpha = 1;
    if (pl.dy > 0.5) { buildStrip(b >= 0 && f > 0.5 ? imgB : img, b >= 0 && f > 0.5 ? b : a); drawSky(pl, iw); }
  }

  // Light arc: golden hour (ink on light veil) → blue hour (cream on dusk veil)
  const INK = [28, 26, 23], CREAM = [251, 247, 241];
  const WARM = [58, 38, 22], DUSK = [20, 26, 36];
  let lastActive = -1;
  function updateUI() {
    const t = interp(PACE, progress);
    const flip = smooth(10.6, 12.2, t);      // the camera lifts off the street
    const k = smooth(12, 30, t);             // sunset → blue hour
    const mix = (A, B, x) => A.map((c, n) => Math.round(lerp(c, B[n], x))).join(',');
    hero.style.setProperty('--ui', mix(INK, CREAM, flip));
    hero.style.setProperty('--shade', mix(WARM, DUSK, k));
    hero.style.setProperty('--veil-top', (0.5 * (1 - flip)).toFixed(3));
    hero.style.setProperty('--veil-bot', (flip * lerp(0.75, 0.95, k)).toFixed(3));
    // only the lower edge darkens at the very end, flowing into the dusk bridge
    // no fade: the final frame continues straight into the descent below

    chapters.forEach((el) => {
      const on = progress >= +el.dataset.from && progress < +el.dataset.to;
      el.classList.toggle('is-active', on);
    });
    let c = 0; CH_T.forEach((ct, n) => { if (t >= ct) c = n; });
    if (c !== lastActive) { railItems.forEach((li, n) => li.classList.toggle('is-active', n === c)); lastActive = c; }
    if (railFill) railFill.parentElement.style.setProperty('--p', progress.toFixed(3));
    hero.classList.toggle('is-started', progress > 0.03);
    hero.classList.toggle('is-ending', progress >= 0.985);
  }

  // Frames stay compressed (Blob per frame). Only the frames being drawn are decoded into ImageBitmaps,
  // kept in a tiny LRU and closed when evicted, so memory stays low on phones.
  const blobs = [], bmps = new Map(), decoding = new Set(), BMP_MAX = 8;
  const frameUrl = (k) => `frames/${setKey}/${String(k + 1).padStart(4, '0')}.webp`;
  const decodeBlob = (blob) => window.createImageBitmap ? createImageBitmap(blob) : new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u;
  });
  function getBmp(k) {
    const b = bmps.get(k);
    if (b) { bmps.delete(k); bmps.set(k, b); return b; }
    if (blobs[k] && !decoding.has(k)) {
      decoding.add(k);
      decodeBlob(blobs[k]).then((bm) => {
        decoding.delete(k); bmps.set(k, bm);
        while (bmps.size > BMP_MAX) { const [ok, ob] = bmps.entries().next().value; bmps.delete(ok); if (ob.close) ob.close(); }
        lastDrawKey = ''; draw();
      }).catch(() => decoding.delete(k));
    }
    return null;
  }
  function nearestBmp(i) {
    let best = -1;
    bmps.forEach((_, k) => { if (best < 0 || Math.abs(k - i) < Math.abs(best - i)) best = k; });
    return best;
  }

  function setProgress(p) { progress = clamp(p, 0, 1); draw(); updateUI(); }

  // -------- preloading --------
  // Loader gate: the opening frames plus a coarse pass over the whole film. Every other frame keeps
  // downloading in the background at low priority (so images further down the page are not starved).
  function loadFrames() {
    const portrait = innerWidth / innerHeight < 1;
    setKey = portrait ? 'm' : 'd';
    return fetch('frames/manifest.json').then((r) => r.json()).then((m) => {
      set = m.sets[setKey];
      times = set.t;
      ready = new Array(set.count).fill(false);
      const n = set.count;
      const order = [], seen = new Set();
      const push = (i) => { if (i >= 0 && i < n && !seen.has(i)) { seen.add(i); order.push(i); } };
      for (let i = 0; i < 8; i++) push(i);
      for (let i = 0; i < n; i += 14) push(i);
      const gate = order.length;
      for (let i = 0; i < n; i++) push(i);

      let gateLoaded = 0, cursor = 0, released = false;
      const bar = $('#loaderBar'), pct = $('#loaderPct');
      return new Promise((resolve) => {
        const release = () => { if (!released) { released = true; resolve(); } };
        const next = () => {
          if (cursor >= order.length) return;
          const idx = order[cursor];
          const isGate = cursor < gate;
          cursor++;
          const get = (tries) => fetch(frameUrl(idx), isGate ? undefined : { priority: 'low' })
            .then((r) => { if (!r.ok) throw 0; return r.blob(); })
            .catch((e) => (tries > 0 ? get(tries - 1) : null));
          get(1).then((blob) => {
            if (blob) { blobs[idx] = blob; ready[idx] = true; }
            if (isGate) {
              gateLoaded++;
              const p = gateLoaded / gate;
              bar.style.transform = `scaleX(${p})`;
              pct.textContent = Math.round(p * 100);
              if (gateLoaded === gate) release();
            }
            if (blob && Math.abs(interp(PACE, progress) - times[idx]) < 1.5) { lastDrawKey = ''; draw(); }
            next();
          });
        };
        for (let c = 0; c < 4; c++) next();
        setTimeout(release, 20000); // never trap the visitor behind the loader
      });
    });
  }

  function hideLoader() {
    // the descent panels move by transform, so native lazy-loading can reach them late: once the hero's
    // first frames are in, let them start loading (their src/srcset are already real; this only lifts "lazy")
    $$('#views img').forEach((im) => { im.loading = 'eager'; });
    loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    setTimeout(() => loader.remove(), 1400);
  }

  function initScrub() {
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.config({ ignoreMobileResize: true });
      const proxy = { p: 0 };
      gsap.to(proxy, {
        p: 1, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: 0.9, invalidateOnRefresh: true },
        onUpdate: () => setProgress(proxy.p),
      });
    } else {
      // fallback: own eased scrub
      let target = 0, cur = 0;
      const measure = () => { const r = hero.getBoundingClientRect(); target = clamp(-r.top / (r.height - innerHeight), 0, 1); };
      const tick = () => { cur += (target - cur) * 0.12; if (Math.abs(target - cur) < 0.0002) cur = target; setProgress(cur); requestAnimationFrame(tick); };
      addEventListener('scroll', measure, { passive: true }); measure(); tick();
    }
  }

  section('hero', () => {
  {
    document.body.classList.add('is-loading');
    sizeCanvas();
    addEventListener('resize', sizeCanvas);
    loadFrames().then(() => {
      sizeCanvas(); setProgress(0);
      hideLoader();
      initScrub();
    }).catch(() => { root.classList.add('reduced'); hideLoader(); });
  }
  });

  /* =======================================================
     Header / floating contact / mobile nav
     ======================================================= */
  section("Header / floating contact / mobile nav", () => {
  const header = $('#header');
  const wa = $('.wa');
  const menuBtn = $('#menuBtn');
  const mnav = $('#mobileNav');
  let lastY = scrollY;
  // Floating contact: hidden in the hero, while the form or footer is on screen,
  // and (on phones) while scrolling down through content — it returns when scrolling up
  // or when the page comes to rest, so it never parks on top of text being read.
  let waBlocked = false;
  const mbar = $('#mbar');
  const waIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { en.target._inView = en.isIntersecting; });
    waBlocked = [$('#contact'), $('.footer')].some((n) => n && n._inView);
    onScroll();
  }, { rootMargin: '0px 0px -10% 0px' });
  [$('#contact'), $('.footer')].forEach((n) => { if (n) waIO.observe(n); });
  function onScroll() {
    const y = scrollY;
    // header and contact bar stay away until the descent through the floors is over
    const intro = $('#views') || hero;
    const heroEnd = intro.offsetTop + intro.offsetHeight - innerHeight * (root.classList.contains('reduced') ? 0.3 : 1);
    const past = y > heroEnd;
    if (header) header.classList.toggle('is-visible', past);
    const menuOpen = !!menuBtn && menuBtn.getAttribute('aria-expanded') === 'true';
    if (header) header.classList.toggle('is-hidden-by-scroll', past && y > lastY + 4 && y > heroEnd + 400 && !menuOpen);
    if (header && y < lastY - 4) header.classList.remove('is-hidden-by-scroll');
    // desktop: floating pill · phones: slim bottom bar (CSS hides the other one)
    if (wa) wa.classList.toggle('is-visible', past && !waBlocked);
    if (mbar) mbar.classList.toggle('is-visible', past && !waBlocked);
    lastY = y;
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Full-screen mobile menu: scroll lock, Escape, focus return, closes on link tap.
  function setMenu(open, returnFocus, viaKeyboard) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.sr-only').textContent = open ? 'סגירת התפריט' : 'תפריט';
    mnav.classList.toggle('is-open', open);
    mnav.setAttribute('aria-hidden', String(!open));
    mnav.inert = !open;
    root.classList.toggle('menu-open', open);
    if (open) $$('.mnav__links a', mnav).forEach((a, n) => a.style.setProperty('--d', `${40 + n * 35}ms`));
    if (open && viaKeyboard) setTimeout(() => $('.mnav__links a', mnav).focus({ preventScroll: true }), 60);
    else if (!open && returnFocus) menuBtn.focus();
  }
  if (menuBtn && mnav) menuBtn.addEventListener('click', (e) => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true', false, e.detail === 0));
  if (mnav) $$('a', mnav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mnav && mnav.classList.contains('is-open')) setMenu(false, true); });
  matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches && mnav) setMenu(false); });

  // Anchor links: account for the fixed header; jumping into the page reveals the header
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = $(id); if (!el) return;
    e.preventDefault();
    const top = id === '#top' ? 0 : el.getBoundingClientRect().top + scrollY - (id === '#contact' ? 0 : 0);
    scrollToY(top);
    history.replaceState(null, '', id);
  }));
  });

  // Active section in nav
  const navLinks = $$('.header__nav a');
  const io2 = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navLinks.forEach((l) => l.setAttribute('aria-current', String(l.getAttribute('href') === '#' + en.target.id)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['views', 'residences', 'floors', 'day', 'location', 'contact'].forEach((id) => { const s = $('#' + id); if (s) io2.observe(s); });

  // one rAF-throttled scroll loop shared by the scroll-linked sections below
  const scrollJobs = new Set();
  let ticking = false;
  const runJobs = () => { ticking = false; scrollJobs.forEach((fn) => fn()); };
  const requestJobs = () => { if (!ticking) { ticking = true; requestAnimationFrame(runJobs); } };
  addEventListener('scroll', requestJobs, { passive: true });
  addEventListener('resize', requestJobs);
  // only run a job while its section is near the viewport
  function whileVisible(el, fn, margin = '20% 0px') {
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) { scrollJobs.add(fn); fn(); } else scrollJobs.delete(fn);
    }, { rootMargin: margin }).observe(el);
  }
  const desktopMQ = matchMedia('(min-width: 901px)');

  /* =======================================================
     Reveals
     ======================================================= */
  section("Reveals", () => {
  $$('[data-reveal-lines] > span').forEach((s) => { const inner = document.createElement('span'); inner.innerHTML = s.innerHTML; s.innerHTML = ''; s.appendChild(inner); });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  $$('[data-reveal], [data-reveal-lines], .img-reveal').forEach((el) => io.observe(el));
  });

  /* =======================================================
     1 · The descent — scroll: penthouse → 12; elevator: 12 ↔ 7 ↔ 3 (and back up)
     ======================================================= */
  section("1 · The descent", () => {
  const sec = $('#views'), stage = $('#descentStage');
  if (!sec || !stage) return;
  const panels = $$('.dpanel', stage), slabs = $$('.dslab', stage);
  const texs = slabs.map((s) => $('.dslab__tex', s));
  const caps = $$('.descent__cap', stage), title = $('.descent__title', stage), shade = $('.descent__shade', stage);
  const btns = $$('.lift__btns button', stage), liftNow = $('#liftNow'), liftFill = $('#liftFill');
  const FLOOR = ['פנטהאוז', '12', '7', '3'];

  // the first panel is the hero's own last frame (same file, already in cache) → no visible cut
  const home = $('#descentHome');
  const key = innerWidth / innerHeight < 1 ? 'm' : 'd';
  fetch('frames/manifest.json').then((r) => r.json()).then((m) => {
    const n = m.sets[key] && m.sets[key].count;
    if (n && home) home.src = `frames/${key}/${String(n).padStart(4, '0')}.webp`;
  }).catch(() => {});

  // scroll drives only penthouse → slab → floor 12 (section is 100vh + 260vh tall);
  // floors 7 and 3 are reached through the elevator, which animates the stage without moving the page
  const SEG = [['hold', .35], ['move', 1.6], ['hold', .65]];
  const TOTAL = SEG.reduce((s, [, d]) => s + d, 0);
  const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const camera = (u) => {           // → 0 (penthouse) … 1 (floor 12)
    let acc = 0, k = 0;
    for (const [t, d] of SEG) {
      if (u <= acc + d) return t === 'hold' ? k : k + ease((u - acc) / d);
      acc += d; if (t === 'move') k++;
    }
    return 1;
  };

  let H = 0, S = 0, STEP = 0;
  const measure = () => { H = stage.clientHeight; S = slabs[0] ? slabs[0].offsetHeight : H * .62; STEP = H + S; };
  measure(); addEventListener('resize', () => { measure(); paint(); });
  // hand-off: the moment the hero's stage would release, hide it — the identical frame is pinned beneath
  const hero = $('#top');
  const handOff = () => { if (hero) hero.classList.toggle('is-handed', scrollY >= sec.offsetTop - 1); };
  addEventListener('scroll', handOff, { passive: true }); handOff();

  // what's on screen = scroll position (0…1) + an elevator offset (−1…+2) animated by the panel
  let base = 0, extra = 0, lastF = 0, dir = 1, tween = null;
  const shown = () => clamp(base + extra, 0, 3);
  function render(f) {
    const y = f * STEP;
    if (f !== lastF) dir = f > lastF ? 1 : -1;
    lastF = f;
    panels.forEach((p, k) => { p.style.transform = `translate3d(0, ${(k * STEP - y).toFixed(1)}px, 0)`; });
    slabs.forEach((s, k) => {
      const top = k * STEP + H - y;
      s.style.transform = `translate3d(0, ${top.toFixed(1)}px, 0)`;
      // the plaster texture travels ~12% faster than the rooms (subtle parallax)
      texs[k].style.transform = `translate3d(0, ${((top - (H - S) / 2) * .12).toFixed(1)}px, 0)`;
    });
    const near = Math.round(f), atLanding = Math.abs(f - near) < .06;
    // captions only while a floor view has landed; each floor has its own
    const vis = near >= 1 ? clamp(1 - Math.abs(f - near) / .18, 0, 1) : 0;
    shade.style.opacity = vis.toFixed(3);
    caps.forEach((c) => c.classList.toggle('is-on', vis > .55 && +c.dataset.k === near));
    title.classList.toggle('is-on', vis > .55 && near === 1);
    btns.forEach((b) => { const on = +b.dataset.k === near; b.classList.toggle('is-active', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    const target = dir > 0 ? Math.min(3, Math.floor(f + .001) + 1) : Math.max(0, Math.ceil(f - .001) - 1);
    liftNow.textContent = atLanding ? (near === 0 ? 'פנטהאוז' : `קומה ${FLOOR[near]}`) : `⁦${dir > 0 ? '↓' : '↑'} ${FLOOR[target]}⁩`;
    liftFill.parentElement.style.setProperty('--p', (f / 3).toFixed(4));
    // the invitation + one-time pulse once a floor view has landed
    const invite = vis > .55;
    lift.classList.toggle('is-inviting', invite);
    if (invite && !pulsed) { pulsed = true; lift.dataset.pulsed = '1'; const b7 = btns.find((b) => b.dataset.k === '2'); if (b7) { b7.classList.add('is-pulse'); setTimeout(() => b7.classList.remove('is-pulse'), 2600); } }
  }
  const lift = $('#lift'); let pulsed = false;
  const paint = () => render(shown());

  // elevator offset animation (rAF, eased, ~1.4–1.8 s depending on distance)
  function animateExtra(to, ms) {
    if (tween) cancelAnimationFrame(tween.id);
    const from = extra, t0 = performance.now();
    if (Math.abs(to - from) < .001) { extra = to; paint(); return; }
    const step = () => {
      const p = clamp((performance.now() - t0) / ms, 0, 1);
      extra = from + (to - from) * ease(p);
      paint();
      if (p < 1) tween.id = requestAnimationFrame(step); else tween = null;
    };
    tween = { id: requestAnimationFrame(step) };
  }
  // scrolling (out of the landing) hands control back to the scroll: the offset settles to 0
  function setBase(b) {
    const moved = Math.abs(b - base) > .002;
    base = b;
    if (moved && extra !== 0 && (!tween || tween.to !== 0)) { animateExtra(0, 700); if (tween) tween.to = 0; }
    else paint();
  }
  function goFloor(k) {
    const target = k - base;
    const ms = clamp(1200 + 300 * Math.abs(shown() - k), 1400, 1800);
    animateExtra(target, ms);
    if (tween) tween.to = target;
  }

  const range = () => sec.offsetHeight - stage.clientHeight;
  const unitsFromScroll = () => clamp((scrollY - sec.offsetTop) / range(), 0, 1) * TOTAL;
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    const proxy = { u: 0 };
    gsap.to(proxy, {
      u: TOTAL, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.9, invalidateOnRefresh: true },
      onUpdate: () => setBase(camera(proxy.u)),
    });
  } else {
    let cur = 0;
    const tick = () => { const t = unitsFromScroll(); cur += (t - cur) * 0.12; if (Math.abs(t - cur) < .0005) cur = t; setBase(camera(cur)); requestAnimationFrame(tick); };
    tick();
  }
  base = camera(unitsFromScroll()); paint();

  // elevator buttons: play the descent/ascent inside the pinned stage — the page does not move
  btns.forEach((b, i) => {
    b.addEventListener('click', () => goFloor(+b.dataset.k));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowDown: 1, ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1 }[e.key];   // RTL row on phones: left = next floor down
      if (!d) return;
      e.preventDefault();
      const n = clamp(i + d, 0, btns.length - 1);
      btns[n].focus(); goFloor(+btns[n].dataset.k);
    });
  });
  });



  /* =======================================================
     4 · Residences — pinned horizontal panels (desktop) / snap carousel (phones); plan + spec dialogs
     ======================================================= */
  section("4 · Residences", () => {
  const R = (x, y, w, h, label, area) => ({ x, y, w, h, label, area });
  const srcs = (code, base = 'img/new/') => ({ src: `${base}${code}-1024.webp`, srcset: `${base}${code}-640.webp 640w, ${base}${code}-1024.webp 1024w, ${base}${code}-1672.webp 1672w` });
  const PLANS = [
    {
      name: 'דירת 4 חדרים', apt: '4 חדרים',
      img: srcs('P6'), alt: 'סלון דירת 4 חדרים: ספה בהירה, שולחן טרוורטין, פרקט אדרה ויציאה למרפסת מעוגלת מול הים',
      desc: 'בית מואר לזוג או למשפחה צעירה. הסלון והמרפסת פונים מערבה אל הים, וחדרי השינה שקטים ומופנים אל הגינה.',
      facts: [['שטח הדירה', '118 מ״ר'], ['מרפסת שמש', '14 מ״ר'], ['חדרי רחצה', '2'], ['כיווני אוויר', '3'], ['קומות', '1 עד 10']],
      outer: [60, 40, 400, 280],
      outs: [R(20, 70, 40, 220, 'מרפסת', '14')],
      rooms: [
        R(60, 40, 190, 160, 'סלון ופינת אוכל', '42'), R(250, 40, 90, 100, 'מטבח', '13'),
        R(340, 40, 120, 120, 'ממ״ד', '12'), R(250, 140, 90, 70, 'רחצה', '5'),
        R(340, 160, 120, 160, 'חדר', '13'), R(60, 200, 140, 120, 'יחידת הורים', '17'),
        R(200, 200, 50, 120, 'רחצת הורים', '5'), R(250, 210, 90, 110, 'מבואה', '9'),
      ],
      entry: [295, 320],
    },
    {
      name: 'דירת 5 חדרים', apt: '5 חדרים',
      img: srcs('P2'), alt: 'מטבח ופינת אוכל בדירת 5 חדרים: אי שיש, ארונות אלון ושולחן ערוך מול חלון לים',
      desc: 'חלל ציבורי רחב עם מטבח פתוח ואי שיש, יחידת הורים עם חדר ארונות, ושלושה חדרים נוספים. נוף פתוח לים מכל החלל המרכזי.',
      facts: [['שטח הדירה', '146 מ״ר'], ['מרפסת שמש', '18 מ״ר'], ['חדרי רחצה', '2 + שירותי אורחים'], ['כיווני אוויר', '3'], ['קומות', '1 עד 10']],
      outer: [40, 40, 440, 280],
      outs: [R(8, 60, 32, 240, 'מרפסת', '18')],
      rooms: [
        R(40, 40, 200, 150, 'סלון', '38'), R(240, 40, 110, 110, 'מטבח ופינת אוכל', '20'),
        R(350, 40, 130, 110, 'ממ״ד', '12'), R(350, 150, 130, 90, 'חדר', '11'),
        R(350, 240, 130, 80, 'חדר', '11'), R(40, 190, 150, 130, 'יחידת הורים', '18'),
        R(190, 190, 50, 70, 'רחצת הורים', '5'), R(190, 260, 50, 60, 'חדר ארונות', '4'),
        R(240, 150, 60, 70, 'רחצה', '5'), R(300, 150, 50, 70, 'כביסה', '3'),
        R(240, 220, 110, 100, 'מבואה', '10'),
      ],
      entry: [295, 320],
    },
    {
      name: 'דירת גן · מיני פנטהאוז', apt: 'גן / מיני פנטהאוז',
      img: srcs('P5'), alt: 'סלון דירת הגן נפתח אל גינה פרטית עם עצי זית, לבנדר ושולחן אבן, והים מעבר לחומה',
      desc: 'בקומת הקרקע עם גינה פרטית, או בקומה 11 עם מרפסת גג רחבה. אותו תכנון, שני אופני חיים — בשניהם החוץ הוא חלק מהבית.',
      facts: [['שטח הדירה', '168 מ״ר'], ['גינה / מרפסת גג', '85 מ״ר'], ['חדרי רחצה', '2 + שירותי אורחים'], ['כיווני אוויר', '4'], ['קומות', 'קרקע · 11']],
      outer: [150, 40, 330, 280],
      outs: [R(20, 40, 130, 280, 'גינה / מרפסת גג', '85')],
      rooms: [
        R(150, 40, 180, 160, 'סלון ופינת אוכל', '46'), R(330, 40, 70, 90, 'מטבח', '14'),
        R(400, 40, 80, 90, 'ממ״ד', '12'), R(400, 130, 80, 95, 'חדר', '12'),
        R(400, 225, 80, 95, 'חדר', '12'), R(150, 200, 130, 120, 'יחידת הורים', '20'),
        R(280, 200, 50, 60, 'רחצת הורים', '6'), R(280, 260, 50, 60, 'חדר ארונות', '5'),
        R(330, 130, 70, 70, 'רחצה', '6'), R(330, 200, 70, 120, 'מבואה', '11'),
      ],
      entry: [365, 320],
    },
    {
      name: 'פנטהאוז גג', apt: 'פנטהאוז גג',
      img: srcs('09-living-room', 'img/'), alt: 'סלון הפנטהאוז: ספות בהירות, שולחן טרוורטין וקיר זכוכית פתוח אל מרפסת הגג והים בשעת דמדומים',
      inset: srcs('08-terrace', 'img/'), insetAlt: 'מרפסת הגג של הפנטהאוז: פרגולת ברונזה, עצי זית ובריכה מוארת',
      desc: 'הבית היחיד בקומה העליונה. סוויטת הורים, חדר עבודה ומבואה פרטית מהמעלית — ומרפסת גג עם פרגולת ברונזה ובריכת אינסוף פרטית.',
      facts: [['שטח הדירה', '245 מ״ר'], ['מרפסת גג', '160 מ״ר'], ['בריכה פרטית', '12 מ׳'], ['חדרי רחצה', '3 + שירותי אורחים'], ['קומה', '12 · יחידה אחת']],
      outer: [170, 30, 330, 310],
      outs: [R(10, 30, 160, 310, 'מרפסת גג', '160')],
      pool: R(26, 262, 128, 58, 'בריכה', '24'),
      rooms: [
        R(170, 30, 170, 170, 'סלון ופינת אוכל', '58'), R(340, 30, 80, 100, 'חדר עבודה', '12'),
        R(420, 30, 80, 100, 'מטבח', '18'), R(420, 130, 80, 80, 'ממ״ד', '12'),
        R(420, 210, 80, 65, 'חדר', '13'), R(420, 275, 80, 65, 'חדר', '13'),
        R(170, 200, 140, 140, 'סוויטת הורים', '26'), R(310, 200, 50, 70, 'רחצת הורים', '7'),
        R(310, 270, 50, 70, 'חדר ארונות', '6'), R(340, 130, 80, 70, 'רחצה', '6'),
        R(360, 200, 60, 140, 'מבואה פרטית', '9'),
      ],
      entry: [390, 340],
    },
  ];

  // One full-screen panel per type. Desktop: the section pins and the track travels right as you
  // scroll down (RTL: panel 1 sits at the right, the next ones come in from the left).
  // Phones: a native swipe carousel with snap.
  const resScroll = $('#resScroll'), resVP = $('#resVP'), resTrack = $('#resTrack');
  const panels = $$('.rpanel', resTrack), N = panels.length;
  const resNow = $('#resNow'), resBar = $('.res__bar');
  const setPW = () => resScroll.style.setProperty('--pw', `${resVP.clientWidth}px`);
  setPW(); addEventListener('resize', () => { setPW(); requestJobs(); });
  new IntersectionObserver(([en], obs) => { if (en.isIntersecting) { $$('img', resTrack).forEach((im) => { im.loading = 'eager'; }); obs.disconnect(); } }, { rootMargin: '1200px 0px' }).observe(resScroll);
  let shownPanel = -1;
  function markRes(p) {
    const i = Math.round(p * (N - 1));
    if (i !== shownPanel) { shownPanel = i; resNow.textContent = String(i + 1).padStart(2, '0'); }
    resBar.style.setProperty('--p', p.toFixed(3));
  }
  function resDesktop() {
    if (!desktopMQ.matches) return;
    const r = resScroll.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
    const max = resTrack.scrollWidth - resVP.clientWidth;
    resTrack.style.transform = `translate3d(${(p * max).toFixed(1)}px, 0, 0)`;
    markRes(p);
  }
  whileVisible(resScroll, resDesktop, '0px');
  resVP.addEventListener('scroll', () => {
    if (desktopMQ.matches) { resVP.scrollLeft = 0; return; }   // focus must not shift the pinned track
    const max = resVP.scrollWidth - resVP.clientWidth;
    markRes(max > 0 ? clamp(Math.abs(resVP.scrollLeft) / max, 0, 1) : 0);
  }, { passive: true });
  desktopMQ.addEventListener('change', () => { resTrack.style.transform = ''; resVP.scrollLeft = 0; setPW(); requestJobs(); });
  // keyboard: tabbing into a panel scrolls the page to the spot where that panel is in view
  resTrack.addEventListener('focusin', (e) => {
    const pnl = e.target.closest('.rpanel');
    if (!pnl || !desktopMQ.matches) return;
    const y = resScroll.offsetTop + (resScroll.offsetHeight - innerHeight) * (+pnl.dataset.i / (N - 1));
    scrollToY(Math.round(y), true);
  });
  markRes(0);
  $$('[data-plan]', resTrack).forEach((b) => b.addEventListener('click', () => { renderPlan(PLANS[+b.dataset.plan]); openDlg(planDlg); }));
  $$('[data-apt]', resTrack).forEach((a) => a.addEventListener('click', () => setApt(PLANS[+a.dataset.apt].apt)));
  $('#specBtn').addEventListener('click', () => openDlg($('#specDlg')));

  // --- plan dialog: thin lines, numbered rooms, legend beside ---
  const planDlg = $('#planDlg'), planSvg = $('#planSvg'), planLegend = $('#planLegend');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const compactMQ = matchMedia('(max-width: 760px)');
  function renderPlan(p) {
    planSvg.textContent = '';
    $('#planDlgTitle').textContent = `תוכנית · ${p.name}`;
    const compact = compactMQ.matches;
    const defs = el('defs', {}, planSvg);
    const pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#9A7448', 'stroke-width': .5, opacity: .5 }, pat);
    const rect = (r, cls) => el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: cls }, planSvg);
    p.outs.forEach((o) => rect(o, 'pl-out'));
    if (p.pool) rect(p.pool, 'pl-pool');
    p.rooms.forEach((r) => rect(r, 'pl-room'));
    const [ox, oy, ow, oh] = p.outer;
    rect({ x: ox, y: oy, w: ow, h: oh }, 'pl-outer');
    const all = [...p.rooms, ...p.outs, ...(p.pool ? [p.pool] : [])];
    const rad = compact ? 12 : 9;
    planLegend.textContent = '';
    all.forEach((r, n) => {
      const g = el('g', { class: 'pl-num', 'data-n': n + 1 }, planSvg);
      el('circle', { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: Math.min(rad, r.w / 2 - 2, r.h / 2 - 2) }, g);
      const t = el('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 }, g); t.textContent = n + 1;
      const li = document.createElement('li');
      li.dataset.n = n + 1;
      li.innerHTML = `<b>${n + 1}</b><span>${r.label}</span><span>${r.area ? r.area + ' מ״ר' : ''}</span>`;
      li.addEventListener('pointerenter', () => g.classList.add('is-hot'));
      li.addEventListener('pointerleave', () => g.classList.remove('is-hot'));
      planLegend.appendChild(li);
    });
    const [ex, ey] = p.entry;
    el('path', { d: `M${ex - 12} ${ey} h24`, stroke: '#1A2029', 'stroke-width': 4 }, planSvg);
    el('path', { d: `M${ex} ${ey + 20} v-13 m-4 4 l4 -4 l4 4`, class: 'pl-entry' }, planSvg);
    // fit the drawing; sea arrow points west (left)
    const boxes = [...p.outs, { x: ox, y: oy, w: ow, h: oh }, ...(p.pool ? [p.pool] : [])];
    const minX = Math.min(...boxes.map((b) => b.x)) - 8, maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 8;
    const minY = Math.min(...boxes.map((b) => b.y)) - 8, maxY = ey + 30;
    el('path', { d: `M${minX + 4} ${maxY - 6} h40 M${minX + 4} ${maxY - 6} l6 -3.5 M${minX + 4} ${maxY - 6} l6 3.5`, class: 'pl-sea' }, planSvg);
    planSvg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  }
  bridge.openPlan = (i) => { renderPlan(PLANS[i]); openDlg(planDlg); };
  });

  /* =======================================================
     Dialogs (plan, brochure)
     ======================================================= */
  section("Dialogs (plan, brochure)", () => {
  $$('dialog.sheet').forEach((d) => {
    d.addEventListener('close', () => root.classList.remove('menu-open'));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  });
  });

  /* =======================================================
     5 · Floor finder — building view → floor plan view (demo availability)
     38 homes: ground 4 garden · floors 1–10 three each · 11 three mini-PH · 12 one PH
     ======================================================= */
  section("5 · Floor finder", () => {
  const ff = $('#floors');
  if (!ff || !$('#ffIndex')) return;
  // floor bands measured on F1-elevation (% of image height, top → bottom). Labels sit at each band's centre.
  const BANDS = { 12: [7.6, 16.4], 11: [15.7, 22.1], 10: [21.4, 27.6], 9: [26.9, 33.3], 8: [32.6, 38.9], 7: [38.2, 44.4],
    6: [43.7, 49.9], 5: [49.2, 55.4], 4: [54.7, 60.8], 3: [60.2, 66.3], 2: [65.6, 71.7], 1: [71.0, 76.9], 0: [76.9, 91.9] };
  const CENTER = (f) => (BANDS[f][0] + BANDS[f][1]) / 2;
  // types match the Residences section (res = its tab index)
  const TYPE = {
    r4: { name: '4 חדרים', long: 'דירת 4 חדרים', rooms: 4, size: 118, out: 14, outName: 'מרפסת שמש', res: 0, img: 'img/new/P6-640.webp' },
    r5: { name: '5 חדרים', long: 'דירת 5 חדרים', rooms: 5, size: 146, out: 18, outName: 'מרפסת שמש', res: 1, img: 'img/new/P2-640.webp' },
    garden: { name: 'דירת גן', long: 'דירת גן', rooms: 5, size: 168, out: 85, outName: 'גינה פרטית', res: 2, img: 'img/new/P5-640.webp' },
    mini: { name: 'מיני פנטהאוז', long: 'מיני פנטהאוז', rooms: 5, size: 168, out: 85, outName: 'מרפסת גג', res: 2, img: 'img/new/P5-640.webp' },
    ph: { name: 'פנטהאוז גג', long: 'פנטהאוז גג', rooms: 6, size: 245, out: 160, outName: 'מרפסת גג + בריכה', res: 3, img: 'img/09-living-room-640.webp' },
  };
  const APT_LABEL = { r4: '4 חדרים', r5: '5 חדרים', garden: 'גן / מיני פנטהאוז', mini: 'גן / מיני פנטהאוז', ph: 'פנטהאוז גג' };
  const SOLD = new Set([6, 9, 14, 20, 27, 35]), HELD = new Set([2, 5, 11, 17, 22, 29, 31, 36]);
  const STATUS = { free: 'פנויה', held: 'שמורה', sold: 'נמכרה' };
  const R = (x, y, w, h) => ({ x, y, w, h });
  // unit shapes on the plate (viewBox 800×520, sea side = west = left)
  const SLOTS = {
    typical: [{ r: R(120, 100, 240, 136), o: 'מערב · צפון' }, { r: R(120, 256, 240, 164), o: 'מערב · דרום' }, { r: R(440, 100, 240, 320), o: 'מזרח · צפון · דרום' }],
    ground: [{ r: R(120, 100, 210, 150), o: 'מערב · צפון' }, { r: R(120, 270, 210, 150), o: 'מערב · דרום' }, { r: R(470, 100, 210, 150), o: 'מזרח · צפון' }, { r: R(470, 270, 210, 150), o: 'מזרח · דרום' }],
    ph: [{ r: R(260, 100, 420, 320), o: '360° · ים ועיר' }],
  };
  const FLOORS = {};
  let num = 0;
  const mk = (f, plate, types) => {
    FLOORS[f] = { f, plate, units: SLOTS[plate === 'mini' ? 'typical' : plate].map((s, i) => {
      num++; const st = SOLD.has(num) ? 'sold' : HELD.has(num) ? 'held' : 'free';
      return { n: num, f, type: types[i], s: st, ...s };
    }) };
  };
  mk(0, 'ground', ['garden', 'garden', 'garden', 'garden']);
  for (let f = 1; f <= 10; f++) mk(f, 'typical', ['r4', 'r5', 'r4']);
  mk(11, 'mini', ['mini', 'mini', 'mini']);
  mk(12, 'ph', ['ph']);
  const fName = (f) => (f === 0 ? 'קרקע' : `קומה ${f}`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const avail = (f) => FLOORS[f].units.filter((u) => u.s === 'free').length;

  /* ---- building view: floor scale on the facade + hit layer; plan-view strip index ---- */
  const list = $('#ffIndex'), hits = $('#ffHits'), scale = $('#ffScale'), sum = $('#ffSum');
  const ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  const availTxt = (a) => (a ? plural(a, 'פנויה', 'פנויות') : 'נמכרה');
  ORDER.forEach((f) => {
    const a = avail(f), units = FLOORS[f].units.length;
    const label = `${fName(f)}: ${plural(units, 'דירה', 'דירות')}, ${plural(a, 'פנויה', 'פנויות')}`;
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-f="${f}"><b>${f === 0 ? 'קרקע' : f}</b><small>${availTxt(a)}</small></button>`;
    li.firstChild.setAttribute('aria-label', label);
    list.appendChild(li);
    const s = document.createElement('li');
    s.style.top = CENTER(f) + '%';
    s.innerHTML = `<button type="button" class="ff__lvl" data-f="${f}"><span class="tick" aria-hidden="true"></span><b>${f === 0 ? 'קרקע' : f}</b><small>${availTxt(a)}</small></button>`;
    s.firstChild.setAttribute('aria-label', label);
    scale.appendChild(s);
  });
  const idxBtns = $$('button', list), lvls = $$('.ff__lvl', scale);
  const btnFor = (f) => idxBtns.find((b) => +b.dataset.f === f);
  const lvlFor = (f) => lvls.find((b) => +b.dataset.f === f);
  // phones: keep the active floor centred in the plan-view strip without moving the page
  const centerInStrip = (btn) => { if (!btn || list.scrollWidth <= list.clientWidth) return; const a = btn.getBoundingClientRect(), r = list.getBoundingClientRect(); list.scrollBy({ left: (a.left + a.width / 2) - (r.left + r.width / 2), behavior: 'smooth' }); };
  // the floor under a point: nearest band centre (so each floor's target is its whole band, edge to edge)
  const floorAt = (clientY) => {
    const r = hits.getBoundingClientRect(), y = ((clientY - r.top) / r.height) * 100;
    if (y < BANDS[12][0] - 1 || y > BANDS[0][1] + 1) return null;
    return ORDER.reduce((best, f) => (Math.abs(CENTER(f) - y) < Math.abs(CENTER(best) - y) ? f : best), 12);
  };

  let hot = null, openF = null;
  function light(f) {
    hot = f;
    if (f === null) { ff.classList.remove('has-floor'); ff.style.setProperty('--t', '100%'); ff.style.setProperty('--b', '100%'); sum.textContent = 'בחרו קומה כדי לראות את הדירות בה'; }
    else {
      const [t, b] = BANDS[f], fl = FLOORS[f], a = avail(f), u = fl.units.length;
      ff.classList.add('has-floor');
      ff.style.setProperty('--t', t + '%'); ff.style.setProperty('--b', b + '%');
      sum.textContent = f === 0 ? `קרקע · ${u} דירות גן · ${plural(a, 'פנויה', 'פנויות')}`
        : `קומה ${f}${f === 12 ? ' · פנטהאוז' : ''} · ${plural(u, 'דירה', 'דירות')} · ${plural(a, 'פנויה', 'פנויות')}`;
    }
    lvls.forEach((b) => b.classList.toggle('is-hot', f !== null && +b.dataset.f === f));
  }
  light(null);
  const isPlan = () => ff.classList.contains('is-plan');
  hits.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const f = floorAt(e.clientY); if (f !== hot) light(f); });
  hits.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') light(null); });
  // tap on phones: first tap lights the floor, a second tap on the same floor opens it
  hits.addEventListener('click', (e) => {
    const f = floorAt(e.clientY); if (f === null) return;
    if (matchMedia('(hover: none)').matches && hot !== f) { light(f); return; }
    openPlan(f);
  });
  lvls.forEach((b, i) => {
    const f = +b.dataset.f;
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') light(f); });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') light(null); });
    b.addEventListener('focus', () => light(f));
    b.addEventListener('click', () => openPlan(f));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowUp: -1, ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1 }[e.key];   // up = higher floor
      if (d === undefined) return;
      e.preventDefault();
      lvls[clamp(i + d, 0, lvls.length - 1)].focus();
    });
  });
  idxBtns.forEach((b, i) => {
    b.addEventListener('click', () => openPlan(+b.dataset.f));
    b.addEventListener('focus', () => centerInStrip(b));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowUp: -1, ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1 }[e.key];
      if (d === undefined) return;
      e.preventDefault();
      const n = idxBtns[clamp(i + d, 0, idxBtns.length - 1)];
      n.focus(); openPlan(+n.dataset.f, true);
    });
  });

  /* ---- floor plan view ---- */
  const svg = $('#ffSvg'), NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent, text) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; if (parent) parent.appendChild(n); return n; };
  function drawPlate(fl) {
    svg.textContent = '';
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'fpHatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 8, height: 8, fill: 'rgba(120,120,120,.22)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: 'rgba(200,200,200,.45)', 'stroke-width': 2 }, pat);
    const ph = fl.plate === 'ph';
    // site / terraces / rounded wrap-around balconies (as on the façade)
    if (fl.plate === 'ground') { el('rect', { x: 34, y: 26, width: 732, height: 462, rx: 34, class: 'fp-dash' }, svg); el('text', { x: 400, y: 50, class: 'fp-label fp-small' }, svg, 'גינות פרטיות'); }
    if (fl.plate === 'mini') { el('rect', { x: 60, y: 42, width: 680, height: 436, rx: 64, class: 'fp-dash' }, svg); el('text', { x: 400, y: 64, class: 'fp-label fp-small' }, svg, 'מרפסות גג'); }
    if (ph) {
      el('rect', { x: 70, y: 78, width: 190, height: 364, rx: 40, class: 'fp-dash' }, svg);
      el('rect', { x: 92, y: 320, width: 146, height: 90, rx: 6, class: 'fp-pool' }, svg);
      el('text', { x: 165, y: 370, class: 'fp-label fp-small' }, svg, 'בריכה');
      el('text', { x: 165, y: 200, class: 'fp-label' }, svg, 'מרפסת גג');
      for (let x = 96; x <= 236; x += 14) el('line', { x1: x, y1: 104, x2: x, y2: 150, class: 'fp-thin' }, svg);   // pergola
    }
    el('rect', { x: ph ? 236 : 92, y: 72, width: ph ? 472 : 616, height: 376, rx: 48, class: 'fp-thin' }, svg);
    el('rect', { x: ph ? 260 : 120, y: 100, width: ph ? 420 : 560, height: 320, class: 'fp-line' }, svg);
    if (fl.plate === 'ground') { el('text', { x: 400, y: 128, class: 'fp-label' }, svg, 'לובי'); }
    // apartments
    fl.units.forEach((u) => {
      const t = TYPE[u.type];
      const g = el('g', { class: 'apt', 'data-n': u.n, 'data-s': u.s, tabindex: 0, role: 'button',
        'aria-label': `דירה ${u.n}, ${t.long}, ${t.size} מ״ר, ${STATUS[u.s]}` }, svg);
      el('rect', { x: u.r.x, y: u.r.y, width: u.r.w, height: u.r.h }, g);
      const cx = u.r.x + u.r.w / 2, cy = u.r.y + u.r.h / 2;
      el('text', { x: cx, y: cy + 6, class: 'n' }, g, u.n);
      el('text', { x: cx, y: cy + 36, class: 't' }, g, `${t.name} · ${STATUS[u.s]}`);
    });
    // building core: elevators + stairs
    el('rect', { x: 370, y: 176, width: 60, height: 168, class: 'fp-core' }, svg);
    el('rect', { x: 378, y: 186, width: 44, height: 40, class: 'fp-thin' }, svg);
    el('rect', { x: 378, y: 232, width: 44, height: 40, class: 'fp-thin' }, svg);
    for (let y = 282; y <= 334; y += 8) el('line', { x1: 378, y1: y, x2: 422, y2: y, class: 'fp-thin' }, svg);
    el('text', { x: 400, y: 168, class: 'fp-label fp-small' }, svg, 'מעליות · מדרגות');
    // orientation
    el('text', { x: 52, y: 508, class: 'fp-label' }, svg, '← צד הים');
    el('text', { x: 748, y: 508, class: 'fp-label' }, svg, 'צד הרחוב →');
    const n = el('g', { class: 'fp-north', transform: 'translate(752 36)' }, svg);
    el('path', { d: 'M0 -14 L6 6 L0 2 L-6 6 Z' }, n); el('text', { y: 22 }, n, 'N');
    // interactions
    $$('.apt', svg).forEach((g) => {
      const u = fl.units.find((x) => x.n === +g.dataset.n);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showCard(u, false); });
      g.addEventListener('click', () => showCard(u, true));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showCard(u, true); } });
    });
  }

  function openPlan(f, keepFocus) {
    const fl = FLOORS[f];
    openF = f;
    ff.classList.add('is-plan');
    $('#ffPlan').hidden = false;
    light(f);
    idxBtns.forEach((b) => { if (+b.dataset.f === f) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    $('#ffPlanTitle').innerHTML = f === 0 ? '<span>קומת קרקע</span>' : `<span>קומה</span> ${String(f).padStart(2, '0')}`;
    $('#ffPlanTypes').textContent = [...new Set(fl.units.map((u) => TYPE[u.type].long))].join(' · ') + ` · ${plural(fl.units.length, 'דירה', 'דירות')}`;
    const fr = fl.units.filter((u) => u.s === 'free').length, so = fl.units.filter((u) => u.s === 'sold').length, he = fl.units.length - fr - so;
    $('#ffPlanStat').textContent = `${fr} פנויות · ${so} נמכרו` + (he ? ` · ${he} שמורות` : '');
    drawPlate(fl);
    closeCard();
    // preselect the first available apartment on wide screens so the card is never empty
    if (matchMedia('(min-width: 901px)').matches) showCard(fl.units.find((u) => u.s === 'free') || fl.units[0], false);
    const top = ff.getBoundingClientRect().top;
    if (top < -40 || top > innerHeight * .4) ff.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!keepFocus) $('#ffPlanTitle').focus({ preventScroll: true });
  }
  function closePlan() {
    const f = openF;
    ff.classList.remove('is-plan'); $('#ffPlan').hidden = true; closeCard();
    idxBtns.forEach((b) => b.removeAttribute('aria-current'));
    if (f !== null) { light(f); lvlFor(f).focus({ preventScroll: true }); }
    openF = null;
  }
  $('#ffBack').addEventListener('click', closePlan);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isPlan() && !document.querySelector('dialog[open]') && ff.getBoundingClientRect().bottom > 0 && ff.getBoundingClientRect().top < innerHeight) { e.preventDefault(); if (root.classList.contains('ff-sheet')) closeCard(); else closePlan(); } });
  $('#ffZoom').addEventListener('click', (e) => { const z = $('#ffPlanWrap').classList.toggle('is-zoom'); e.currentTarget.setAttribute('aria-pressed', String(z)); e.currentTarget.textContent = z ? 'הקטנת התוכנית' : 'הגדלת התוכנית'; });

  /* ---- apartment card (side card on desktop, bottom sheet on phones) ---- */
  const card = $('#ffCard');
  let cardU = null;
  function showCard(u, sticky) {
    cardU = u;
    const t = TYPE[u.type];
    $$('.apt', svg).forEach((g) => g.classList.toggle('is-hot', +g.dataset.n === u.n));
    $('#ffThumb').src = t.img; $('#ffThumb').alt = `הדמיית פנים · ${t.long}`;
    $('#ffCardK').textContent = `דירה ${u.n} · ${fName(u.f)}`;
    $('#ffCardTitle').textContent = t.long;
    const rows = [['חדרים', t.rooms], ['שטח פנים', `${t.size} מ״ר`], [t.outName, `${t.out} מ״ר`], ['כיווני אוויר', u.o], ['סטטוס', `<span class="pill" data-s="${u.s}">${STATUS[u.s]}</span>`]];
    $('#ffCardDl').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#ffMeet').textContent = u.s === 'sold' ? 'לרשימת המתנה' : 'לתיאום פגישה';
    card.hidden = false;
    if (sticky || matchMedia('(min-width: 901px)').matches) { card.classList.add('is-open'); root.classList.toggle('ff-sheet', matchMedia('(max-width: 900px)').matches); }
  }
  function closeCard() { card.classList.remove('is-open'); root.classList.remove('ff-sheet'); $$('.apt', svg).forEach((g) => g.classList.remove('is-hot')); if (matchMedia('(max-width: 900px)').matches) card.hidden = true; }
  $('#ffCardClose').addEventListener('click', closeCard);
  $('#ffPlanBtn').addEventListener('click', () => { if (cardU && bridge.openPlan) bridge.openPlan(TYPE[cardU.type].res); });
  $('#ffMeet').addEventListener('click', () => {
    if (!cardU) return;
    const t = TYPE[cardU.type];
    setApt(APT_LABEL[cardU.type]);
    const ff2 = $('#f-floor'); if (ff2) ff2.value = `${cardU.f}/${cardU.n}`;
    const tagT = $('#formFloorText'), tag = $('#formFloor');
    if (tagT && tag) { tagT.textContent = `התעניינות: דירה ${cardU.n} · ${fName(cardU.f)} · ${t.long}`; tag.hidden = false; }
    closeCard();
  });
  $('#formFloorClear')?.addEventListener('click', () => { $('#formFloor').hidden = true; const x = $('#f-floor'); if (x) x.value = ''; });
  });


  /* =======================================================
     8 · A day at AURA — pinned horizontal (desktop), snap carousel (phones)
     ======================================================= */
  section("8 · A day at AURA", () => {
  const day = $('#day'), track = $('#dayTrack'), dayVP = $('.day__viewport');
  const cards = $$('.day__card', track);
  const HOURS = cards.map((c) => +c.dataset.t);
  const hh = $('.day__hh'), mh = $('.day__mh'), nowEl = $('#dayNow'), bar = $('#dayBar');
  new IntersectionObserver(([en], obs) => { if (en.isIntersecting) { $$('img', track).forEach((im) => { im.loading = 'eager'; }); obs.disconnect(); } }, { rootMargin: '1200px 0px' }).observe(day);
  function setDay(p) {
    const seg = p * (HOURS.length - 1), k = Math.min(Math.floor(seg), HOURS.length - 2);
    const h = lerp(HOURS[k], HOURS[k + 1], seg - k);
    const hour = Math.floor(h), min = Math.round(((h - hour) * 60) / 5) * 5 % 60;
    nowEl.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    hh.style.transform = `rotate(${((h % 12) / 12) * 360}deg)`;
    mh.style.transform = `rotate(${(h % 1) * 360}deg)`;
    bar.parentElement.style.setProperty('--p', p.toFixed(3));
  }
  function dayDesktop() {
    if (!desktopMQ.matches) return;
    const r = day.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
    const max = track.scrollWidth - dayVP.clientWidth;
    track.style.transform = `translate3d(${(p * max).toFixed(1)}px, 0, 0)`;   // RTL: content travels right
    setDay(p);
  }
  whileVisible(day, dayDesktop, '0px');
  dayVP.addEventListener('scroll', () => {
    if (desktopMQ.matches) return;
    const max = dayVP.scrollWidth - dayVP.clientWidth;
    setDay(max > 0 ? clamp(Math.abs(dayVP.scrollLeft) / max, 0, 1) : 0);
  }, { passive: true });
  desktopMQ.addEventListener('change', () => { track.style.transform = ''; requestJobs(); });
  setDay(0);
  });

  /* =======================================================
     9 · Location — one full-bleed image; pins light up one after another as you scroll
     ======================================================= */
  section("9 · Location", () => {
  const scroller = $('#locScroll'), stage = $('#locStage');
  const pins = $$('.lpin', stage), items = $$('#locList li');
  const N = pins.length;
  let lit = -1;
  function locProgress() {
    if (desktopMQ.matches) {   // the stage is pinned: progress through the pinned run
      const r = scroller.getBoundingClientRect();
      return clamp(-r.top / (r.height - innerHeight), 0, 1);
    }
    // phones: the image scrolls past; pins light while it travels up the screen
    const r = stage.getBoundingClientRect();
    return clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.25), 0, 1);
  }
  function locPins() {
    const n = clamp(Math.floor(locProgress() * (N + 1)), 0, N);
    if (n === lit) return;
    lit = n;
    pins.forEach((p, k) => p.classList.toggle('is-lit', k < n));
    items.forEach((li, k) => li.classList.toggle('is-lit', k < n));
  }
  whileVisible(scroller, locPins, '0px');
  desktopMQ.addEventListener('change', () => { lit = -1; requestJobs(); });
  });

  /* =======================================================
     Forms (demo only — nothing is sent)
     ======================================================= */
  section("Forms (demo only", () => {
  const normPhone = (v) => v.replace(/[\s\-().]/g, '').replace(/^\+?972/, '0');
  const RULES = {
    name: (v) => v.trim().length < 2 ? 'נא להזין שם מלא' : (v.trim().split(/\s+/).length < 2 ? 'נא להזין שם פרטי ושם משפחה' : ''),
    phone: (v) => { const p = normPhone(v); if (!p) return 'נא להזין מספר טלפון'; return /^05\d{8}$/.test(p) || /^0[2-489]\d{7}$/.test(p) || /^07\d{8}$/.test(p) ? '' : 'מספר הטלפון אינו תקין (לדוגמה 050-1234567)'; },
    email: (v) => !v.trim() ? 'נא להזין כתובת דוא״ל' : (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'כתובת הדוא״ל אינה תקינה'),
    consent: (_, c) => c ? '' : 'נדרש אישור כדי שנוכל לחזור אליכם',
  };
  function check(input) {
    const rule = RULES[input.name]; if (!rule) return true;
    const msg = rule(input.value, input.checked);
    input.closest('.field').classList.toggle('has-error', !!msg);
    input.setAttribute('aria-invalid', String(!!msg));
    const err = document.getElementById(input.getAttribute('aria-describedby'));
    if (err) err.textContent = msg;
    return !msg;
  }
  function wireForm(form, names, onDone) {
    $$('input', form).forEach((inp) => {
      inp.addEventListener('blur', () => { if (inp.value || inp.type === 'checkbox') check(inp); });
      inp.addEventListener('input', () => { if (inp.closest('.field')?.classList.contains('has-error')) check(inp); });
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = names.map((n) => form.elements[n]).filter((i) => !check(i));
      if (bad.length) { bad[0].focus(); return; }
      const btn = $('.btn', form);
      btn.disabled = true; btn.firstElementChild.textContent = 'שולח…';
      setTimeout(onDone, 900);
    });
  }
  const form = $('#leadForm');
  wireForm(form, ['name', 'phone', 'email', 'consent'], () => {
    $('#successName').textContent = form.elements.name.value.trim().split(/\s+/)[0];
    form.hidden = true;
    const s = $('#success'); s.hidden = false; s.focus();
  });
  const brDlg = $('#brochureDlg'), brForm = $('#brForm'), brBtn = $('#brochureBtn');
  if (brBtn && brDlg) brBtn.addEventListener('click', () => openDlg(brDlg));
  if (brForm) wireForm(brForm, ['name', 'phone'], () => { brForm.hidden = true; const s = $('#brSuccess'); s.hidden = false; s.focus(); });
  });

  /* =======================================================
     Motion layer — one-shot line rises and image curtains, marquee, section tone, progress, drag,
     marquee, section tone, progress + counter. Transform / opacity / clip-path only.
     Everything is visible without it: initial states are only applied by GSAP.
     ======================================================= */
  section("Motion layer", () => {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  // headlines: each line (split at <br>) rises once with a soft fade when it enters the viewport
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in'); io.unobserve(en.target);
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('[data-split]').forEach((h) => {
    const lines = [[]];
    [...h.childNodes].forEach((n) => { if (n.nodeType === 1 && n.tagName === 'BR') lines.push([]); else lines[lines.length - 1].push(n); });
    h.textContent = '';
    lines.forEach((nodes, i) => {
      const ln = document.createElement('span'); ln.className = 'ln'; ln.style.setProperty('--i', i);
      nodes.forEach((n) => ln.appendChild(n));
      h.appendChild(ln);
    });
    h.classList.add('split-ready');
    io.observe(h);
  });

  // image "curtain": clip-path opens once when the block enters (CSS transition, no scrub)
  [[$$('.mats__media'), null], [[$('#locStage')], $('#locScroll')], [[$('.finale__media')], $('#contact')], [[$('#resVP')], $('#resScroll')]].forEach(([boxes, trig]) => {
    boxes.forEach((box) => {
      if (!box) return;
      box.classList.add('curtain');
      const t = trig || box;
      const cio = new IntersectionObserver(([en]) => { if (en.isIntersecting) { box.classList.add('is-in'); cio.disconnect(); } }, { rootMargin: '0px 0px -6% 0px' });
      cio.observe(t);
    });
  });
  // one tone change: the day section sits on the lighter panel colour, blended in and out (opacity only)
  const tone = $('.tone'), daySec = $('#day');
  if (tone && daySec) {
    gsap.timeline({ scrollTrigger: { trigger: daySec, start: 'top 85%', end: 'bottom 15%', scrub: true } })
      .fromTo(tone, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.12 })
      .to(tone, { opacity: 1, duration: 0.76 })
      .to(tone, { opacity: 0, ease: 'none', duration: 0.12 });
  }

  // progress line + section counter (hidden during the hero)
  const pbar = $('.progress span'), counter = $('#secCount'), secNow = $('#secNow');
  const secs = ['views', 'residences', 'floors', 'day', 'location', 'contact'].map((id) => $('#' + id)).filter(Boolean);
  let tops = [], shownSec = -1;
  const cacheTops = () => { tops = secs.map((s) => s.getBoundingClientRect().top + scrollY); };
  ScrollTrigger.addEventListener('refresh', cacheTops); cacheTops();
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      pbar.style.transform = `scaleX(${self.progress.toFixed(4)})`;
      const y = scrollY + innerHeight * 0.5;
      let i = -1; tops.forEach((t, n) => { if (t <= y) i = n; });
      if (i !== shownSec) { shownSec = i; counter.classList.toggle('is-on', i >= 0); counter.classList.toggle('is-form', i === secs.length - 1); if (i >= 0) secNow.textContent = String(i + 1).padStart(2, '0'); }
    },
  });

  // marquee: speed and direction follow scroll velocity
  const mq = $('.marquee'), mqTrack = $('.marquee__track');
  if (mq && mqTrack) {
    let x = 0, dir = -1, lastY = scrollY, vel = 0, on = false, half = 1;
    const measureMq = () => { half = mqTrack.scrollWidth / 2 || 1; };
    measureMq(); addEventListener('resize', measureMq); document.fonts?.ready.then(measureMq);
    new IntersectionObserver(([en]) => { on = en.isIntersecting; }, { rootMargin: '120px 0px' }).observe(mq);
    gsap.ticker.add((t, dt) => {
      const y = scrollY, d = y - lastY; lastY = y;
      if (!on) return;
      vel += (d - vel) * 0.12;
      if (Math.abs(d) > 0.5) dir = d > 0 ? -1 : 1;
      x += dir * (0.5 + Math.min(Math.abs(vel) * 0.4, 28)) * (dt / 16.67);
      if (x <= -half) x += half; else if (x > 0) x -= half;
      mqTrack.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    });
  }

  // drag the horizontal sections (desktop): dragging right moves the content right = scrolling down
  [[$('#resVP'), $('#resScroll'), $('#resTrack')], [$('.day__viewport'), $('#day'), $('#dayTrack')]].forEach(([vp, sc, tr]) => {
    if (!vp || !sc || !tr) return;
    let x0 = null, y0 = 0;
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !desktopMQ.matches || e.target.closest('a, button')) return;
      e.preventDefault();
      x0 = e.clientX; y0 = scrollY;
      vp.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
    });
    vp.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const max = Math.max(1, tr.scrollWidth - vp.clientWidth);
      scrollToY(y0 + (e.clientX - x0) * ((sc.offsetHeight - innerHeight) / max) * 1.4, true);
    });
    const end = () => { x0 = null; root.classList.remove('is-dragging'); };
    vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  });
  });

})();
