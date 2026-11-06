/* AURA · Herzliya Pituach — main script */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // prefers-reduced-motion keeps every scroll-driven (user-controlled) experience; it only removes
  // decorative self-running motion (CSS media query) and scroll smoothing. The static hero poster
  // (.no-sequence) is used only when the frames fail to load.

  // Each section initialises inside its own boundary: if one part of the page is
  // missing or throws (e.g. a cached older index.html with newer JS), the rest still runs.
  function section(name, fn) {
    try { fn(); } catch (err) { console.error(`[AURA] "${name}" failed to initialise:`, err); }
  }
  // shared helpers used by more than one section
  function setApt(value) {
    const r = $('input[name="apt"]').find((x) => x.value === value);
    if (r) r.checked = true;
  }
  function openDlg(d) { d.showModal(); root.classList.add('menu-open'); }

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
    sampleX.drawImage(img, 0, 0, img.naturalWidth, 4, 0, 0, 64, 2);
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
    const a = nearestReady(i);
    if (a < 0) return;
    // cross-dissolve to the next frame for sub-frame smoothness
    let b = -1, f = 0;
    if (a === i && i < times.length - 1 && ready[i + 1]) {
      f = clamp((t - times[i]) / (times[i + 1] - times[i]), 0, 1);
      if (f > 0.02) b = i + 1;
    }
    const key = a + ':' + b + ':' + f.toFixed(2) + ':' + t.toFixed(2);
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    const img = frames[a];
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const pl = placement(iw, ih, t);
    if (pl.dy > 0.5) { ctx.fillStyle = '#C9C6DA'; ctx.fillRect(0, 0, cw, Math.ceil(pl.dy) + 1); }
    ctx.globalAlpha = 1;
    ctx.drawImage(img, pl.dx, pl.dy, iw * pl.s, ih * pl.s);
    if (b >= 0) { ctx.globalAlpha = f; ctx.drawImage(frames[b], pl.dx, pl.dy, iw * pl.s, ih * pl.s); }
    ctx.globalAlpha = 1;
    if (pl.dy > 0.5) { buildStrip(b >= 0 && f > 0.5 ? frames[b] : img, b >= 0 && f > 0.5 ? b : a); drawSky(pl, iw); }
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
    fadeEl.style.opacity = smooth(0.975, 1, progress).toFixed(3);

    chapters.forEach((el) => {
      const on = progress >= +el.dataset.from && progress < +el.dataset.to;
      el.classList.toggle('is-active', on);
    });
    let c = 0; CH_T.forEach((ct, n) => { if (t >= ct) c = n; });
    if (c !== lastActive) { railItems.forEach((li, n) => li.classList.toggle('is-active', n === c)); lastActive = c; }
    if (railFill) railFill.parentElement.style.setProperty('--p', progress.toFixed(3));
    hero.classList.toggle('is-started', progress > 0.03);
  }

  function setProgress(p) { progress = clamp(p, 0, 1); draw(); updateUI(); }

  // -------- preloading --------
  function loadFrames() {
    const portrait = innerWidth / innerHeight < 1;
    setKey = portrait ? 'm' : 'd';
    return fetch('frames/manifest.json').then((r) => r.json()).then((m) => {
      set = m.sets[setKey];
      times = set.t;
      frames = new Array(set.count);
      ready = new Array(set.count).fill(false);
      const n = set.count;
      // priority: opening frames → coarse pass across the whole film → the rest
      const order = [], seen = new Set();
      const push = (i) => { if (i >= 0 && i < n && !seen.has(i)) { seen.add(i); order.push(i); } };
      for (let i = 0; i < 12; i++) push(i);
      for (let i = 0; i < n; i += 24) push(i);
      const gate = order.length;
      for (let i = 0; i < n; i++) push(i);

      let loaded = 0, gateLoaded = 0, cursor = 0, released = false;
      const bar = $('#loaderBar'), pct = $('#loaderPct');
      return new Promise((resolve) => {
        const release = () => { if (!released) { released = true; resolve(); } };
        // after the gate, the rest of the film waits for the first sign of intent (or idle time)
        let resumed = false, parked = 0;
        const resume = () => { if (resumed) return; resumed = true; const k = Math.max(parked, 4); parked = 0; for (let c = 0; c < k; c++) next(); };
        ['scroll', 'wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => addEventListener(ev, resume, { once: true, passive: true }));
        setTimeout(resume, 6000);
        const next = () => {
          if (cursor >= order.length) return;
          if (cursor >= gate && !resumed) { parked++; return; }
          const idx = order[cursor];
          const isGate = cursor < gate;
          cursor++;
          const img = new Image();
          img.decoding = 'async';
          img.src = `frames/${setKey}/${String(idx + 1).padStart(4, '0')}.webp`;
          const done = (ok) => {
            if (ok) { frames[idx] = img; ready[idx] = true; }
            loaded++;
            if (isGate) {
              gateLoaded++;
              const p = gateLoaded / gate;
              bar.style.transform = `scaleX(${p})`;
              pct.textContent = Math.round(p * 100);
              if (gateLoaded === gate) release();
            }
            if (ok && Math.abs(interp(PACE, progress) - times[idx]) < 1.5) { lastDrawKey = ''; draw(); }
            next();
          };
          img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => done(true));
          img.onerror = () => done(false);
        };
        for (let c = 0; c < 6; c++) next();
        setTimeout(release, 12000); // never trap the visitor behind the loader
      });
    });
  }

  function hideLoader() {
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
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: reduced ? true : 0.9, invalidateOnRefresh: true },
        onUpdate: () => setProgress(proxy.p),
      });
    } else {
      // fallback: own eased scrub
      let target = 0, cur = 0;
      const measure = () => { const r = hero.getBoundingClientRect(); target = clamp(-r.top / (r.height - innerHeight), 0, 1); };
      const tick = () => { cur += (target - cur) * (reduced ? 1 : 0.12); if (Math.abs(target - cur) < 0.0002) cur = target; setProgress(cur); requestAnimationFrame(tick); };
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
    }).catch(() => { root.classList.add('no-sequence'); hideLoader(); });
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
    const heroEnd = hero.offsetTop + hero.offsetHeight - innerHeight * (root.classList.contains('no-sequence') ? 0.3 : 1);
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
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
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
  ['project', 'views', 'residences', 'floors', 'building', 'location', 'faq', 'contact'].forEach((id) => { const s = $('#' + id); if (s) io2.observe(s); });

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
  $$('.team__list > [data-reveal]').forEach((el, n) => el.style.setProperty('--d', `${n * 70}ms`));
  });

  /* =======================================================
     1 · Manifesto — the morning image opens from ~85% to full width
     ======================================================= */
  section("1 · Manifesto", () => {
  const mFig = $('#manifestoFig'), mFrame = $('.manifesto__frame');
  if (mFig && !reduced) {
    whileVisible(mFig, () => {
      const r = mFig.getBoundingClientRect(), vh = innerHeight;
      const p = clamp((vh - r.top) / (vh * 0.95), 0, 1);
      const e = 1 - Math.pow(1 - p, 2);
      const max = desktopMQ.matches ? 7.5 : 6;
      mFrame.style.setProperty('--inset', `${(max * (1 - e)).toFixed(2)}%`);
      mFrame.style.setProperty('--s', (1.08 - 0.08 * e).toFixed(4));
    });
  } else if (mFrame) { mFrame.style.setProperty('--inset', '0%'); mFrame.style.setProperty('--s', '1'); }
  });

  /* =======================================================
     3 · The view from your floor (3 / 7 / 12)
     ======================================================= */
  section("3 · The view from your floor (3 / 7 / 12)", () => {
  const viewImgs = $$('.views__img');
  const viewBtns = $$('.views__floors button');
  const viewCap = $('#viewsCap');
  const VIEW_CAPS = [
    'בגובה הצמרות: גגות הרעפים של הפיתוח, הדקלים, והים שמציץ ביניהם.',
    'מעל הגגות: רצועת החוף נפתחת, והמפרץ נמשך עד ההרים.',
    'מעל הכול: אופק פתוח, המפרץ כולו, והשמש נוגעת במים.',
  ];
  let viewIdx = 0;
  new IntersectionObserver(([en], obs) => {
    if (!en.isIntersecting) return;
    viewImgs.forEach((im) => { if (im.dataset.src) { im.srcset = im.dataset.srcset; im.src = im.dataset.src; delete im.dataset.src; } });
    obs.disconnect();
  }, { rootMargin: '800px 0px' }).observe($('#views'));
  function setView(i) {
    if (i === viewIdx) return;
    const up = i > viewIdx;
    const next = viewImgs[i], prev = viewImgs[viewIdx];
    next.style.transition = 'none';
    next.style.setProperty('--from', up ? '-1.8%' : '1.8%');
    next.offsetWidth; next.style.transition = '';
    prev.classList.remove('is-active'); next.classList.add('is-active');
    viewIdx = i;
    viewBtns.forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.i === i)));
    $('.views__floors').style.setProperty('--k', String(2 - i));
    viewCap.classList.add('is-swap');
    setTimeout(() => { viewCap.textContent = VIEW_CAPS[i]; viewCap.classList.remove('is-swap'); }, 220);
  }
  viewBtns.forEach((b) => {
    b.addEventListener('click', () => setView(+b.dataset.i));
    b.addEventListener('keydown', (e) => {
      const k = { ArrowUp: 1, ArrowLeft: 1, ArrowDown: -1, ArrowRight: -1 }[e.key];
      if (k) { e.preventDefault(); const n = clamp(viewIdx + k, 0, 2); setView(n); viewBtns.find((x) => +x.dataset.i === n).focus(); }
    });
  });
  });

  /* =======================================================
     4 · Residences — image-led tabs; the plan lives in a dialog
     ======================================================= */
  section("4 · Residences", () => {
  const R = (x, y, w, h, label, area) => ({ x, y, w, h, label, area });
  const srcs = (code, base = 'img/new/') => ({ src: `${base}${code}-1024.webp`, srcset: `${base}${code}-640.webp 640w, ${base}${code}-1024.webp 1024w, ${base}${code}-1672.webp 1672w` });
  const PLANS = [
    {
      name: 'דירת 4 חדרים', apt: '4 חדרים',
      img: srcs('P6'), alt: 'סלון דירת 4 חדרים: ספה בהירה, שולחן טרוורטין, פרקט אדרה ויציאה למרפסת מעוגלת מול הים',
      desc: 'בית מואר לזוג או למשפחה צעירה. הסלון והמרפסת פונים מערבה אל הים, וחדרי השינה שקטים ומופנים אל הגינה.',
      facts: [['שטח הדירה', '118 מ״ר'], ['מרפסת שמש', '14 מ״ר'], ['חדרי רחצה', '2'], ['כיווני אוויר', '3'], ['קומות', '2 עד 6']],
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
      facts: [['שטח הדירה', '146 מ״ר'], ['מרפסת שמש', '18 מ״ר'], ['חדרי רחצה', '2 + שירותי אורחים'], ['כיווני אוויר', '3'], ['קומות', '3 עד 10']],
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

  const tabs = $$('.res__tabs [role="tab"]');
  const resApp = $('#resApp');
  const tabBar = $('.res__tabs');
  const resImg = $('#resImg'), resInset = $('#resInset');
  const ind = document.createElement('span');
  ind.className = 'res__ind'; ind.setAttribute('aria-hidden', 'true');
  tabBar.appendChild(ind);
  let current = 0, firstPaint = true;
  function moveIndicator(i, instant) {
    const t = tabs[i];
    if (instant) ind.style.transition = 'none';
    ind.style.transform = `translate(${t.offsetLeft}px, ${t.offsetTop + t.offsetHeight - 2}px) scaleX(${t.offsetWidth / 100})`;
    if (instant) { ind.offsetWidth; ind.style.transition = ''; }
  }
  addEventListener('resize', () => moveIndicator(current, true));
  function applyPlan(p, i) {
    resImg.srcset = p.img.srcset; resImg.src = p.img.src; resImg.alt = p.alt;
    if (p.inset) { resInset.srcset = p.inset.srcset; resInset.src = p.inset.src; resInset.alt = p.insetAlt; resInset.sizes = '(min-width: 900px) 24vw, 44vw'; resInset.hidden = false; }
    else resInset.hidden = true;
    $('#resName').textContent = p.name;
    $('#resDesc').textContent = p.desc;
    $('#resFacts').innerHTML = p.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#resCta').dataset.apt = i;
    resApp.classList.remove('is-swapping');
  }
  // Keyboard-initiated switches are instant: no swap, no indicator travel.
  function showPlan(i, keyboard) {
    tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === i)); t.tabIndex = n === i ? 0 : -1; });
    $('#panel-res').setAttribute('aria-labelledby', tabs[i].id);
    if (keyboard) tabs[i].focus();
    moveIndicator(i, keyboard || firstPaint);
    if (i === current && !firstPaint) return;
    current = i;
    const instant = reduced || keyboard || firstPaint;
    firstPaint = false;
    if (instant) applyPlan(PLANS[i], i);
    else {
      resApp.classList.add('is-swapping');
      // warm the next image while the old one fades
      const pre = new Image(); pre.srcset = PLANS[i].img.srcset; pre.sizes = resImg.sizes; pre.src = PLANS[i].img.src;
      setTimeout(() => applyPlan(PLANS[i], i), 180);
    }
  }
  tabs.forEach((t, n) => {
    t.addEventListener('click', () => showPlan(n));
    t.addEventListener('keydown', (e) => {
      const k = e.key; let to = null;
      if (k === 'ArrowLeft') to = (n + 1) % tabs.length;
      if (k === 'ArrowRight') to = (n - 1 + tabs.length) % tabs.length;
      if (k === 'Home') to = 0;
      if (k === 'End') to = tabs.length - 1;
      if (to !== null) { e.preventDefault(); showPlan(to, true); }
    });
  });
  showPlan(0);
  $('#resCta').addEventListener('click', () => setApt(PLANS[+$('#resCta').dataset.apt || 0].apt));

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
    el('path', { d: `M${ex - 12} ${ey} h24`, stroke: '#F3EEE6', 'stroke-width': 4 }, planSvg);
    el('path', { d: `M${ex} ${ey + 20} v-13 m-4 4 l4 -4 l4 4`, class: 'pl-entry' }, planSvg);
    // fit the drawing; sea arrow points west (left)
    const boxes = [...p.outs, { x: ox, y: oy, w: ow, h: oh }, ...(p.pool ? [p.pool] : [])];
    const minX = Math.min(...boxes.map((b) => b.x)) - 8, maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 8;
    const minY = Math.min(...boxes.map((b) => b.y)) - 8, maxY = ey + 30;
    el('path', { d: `M${minX + 4} ${maxY - 6} h40 M${minX + 4} ${maxY - 6} l6 -3.5 M${minX + 4} ${maxY - 6} l6 3.5`, class: 'pl-sea' }, planSvg);
    planSvg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  }
  $('#planBtn').addEventListener('click', () => { renderPlan(PLANS[current]); openDlg(planDlg); });
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
     5 · Floor finder (demo availability)
     ======================================================= */
  section("5 · Floor finder (demo availability)", () => {
  const FLOORS = [
    { n: 1, y: [714, 858], type: 'דירת גן', size: '168 מ״ר + גינה 85 מ״ר', orient: 'מערב · דרום', s: 'free', apt: 'גן / מיני פנטהאוז' },
    { n: 2, y: [652, 714], type: '4 חדרים', size: '118 מ״ר', orient: 'מערב · צפון', s: 'free', apt: '4 חדרים' },
    { n: 3, y: [590, 652], type: '5 חדרים', size: '146 מ״ר', orient: 'מערב · דרום', s: 'free', apt: '5 חדרים' },
    { n: 4, y: [528, 590], type: '4 חדרים', size: '118 מ״ר', orient: 'מערב · צפון', s: 'free', apt: '4 חדרים' },
    { n: 5, y: [466, 528], type: '4 חדרים', size: '118 מ״ר', orient: 'מערב · דרום', s: 'held', apt: '4 חדרים' },
    { n: 6, y: [404, 466], type: '4 חדרים', size: '118 מ״ר', orient: 'מערב · צפון', s: 'free', apt: '4 חדרים' },
    { n: 7, y: [342, 404], type: '5 חדרים', size: '146 מ״ר', orient: 'מערב · דרום', s: 'free', apt: '5 חדרים' },
    { n: 8, y: [280, 342], type: '5 חדרים', size: '146 מ״ר', orient: 'מערב · צפון', s: 'sold', apt: '5 חדרים' },
    { n: 9, y: [218, 280], type: '5 חדרים', size: '146 מ״ר', orient: 'מערב · דרום', s: 'free', apt: '5 חדרים' },
    { n: 10, y: [156, 218], type: '5 חדרים', size: '146 מ״ר', orient: 'מערב · צפון', s: 'free', apt: '5 חדרים' },
    { n: 11, y: [94, 156], type: 'מיני פנטהאוז', size: '168 מ״ר + 85 מ״ר מרפסת', orient: 'מערב · דרום', s: 'held', apt: 'גן / מיני פנטהאוז' },
    { n: 12, y: [30, 94], type: 'פנטהאוז גג', size: '245 מ״ר + 160 מ״ר גג', orient: '360°', s: 'free', apt: 'פנטהאוז גג' },
  ];
  const STATUS = { free: 'פנויה', held: 'שמורה', sold: 'נמכרה' };
  const IMG_H = 941;
  // measured on the street image: lobby 714-858, ten typical floors 150-714, penthouse 30-150
  FLOORS.forEach((f) => { if (f.n >= 2 && f.n <= 11) { const h = (714 - 150) / 10, y1 = 714 - (f.n - 2) * h; f.y = [Math.round(y1 - h), Math.round(y1)]; } if (f.n === 12) f.y = [30, 150]; });
  const band = $('#floorsBand'), hits = $('#floorsHits'), flist = $('#floorsList');
  let floorSel = 7;
  function showFloor(n) {
    const f = FLOORS[n - 1];
    band.style.top = `${(f.y[0] / IMG_H) * 100}%`;
    band.style.height = `${((f.y[1] - f.y[0]) / IMG_H) * 100}%`;
    band.classList.add('is-on');
    band.classList.toggle('is-sold', f.s === 'sold');
    $('#fcNum').textContent = n === 1 ? 'קרקע' : n;
    $('#fcType').textContent = f.type;
    $('#fcSize').textContent = f.size;
    $('#fcOrient').textContent = f.orient;
    const st = $('#fcStatus'); st.textContent = STATUS[f.s]; st.dataset.s = f.s;
    const cta = $('#fcCta');
    cta.textContent = f.s === 'sold' ? 'לרשימת המתנה לקומה' : 'לתיאום פגישה על הקומה';
  }
  function selectFloor(n) {
    floorSel = n; showFloor(n);
    $$('button', flist).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
    $$('.floors__hit', hits).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
  }
  FLOORS.slice().reverse().forEach((f) => {
    const label = `קומה ${f.n === 1 ? 'קרקע' : f.n}: ${f.type}, ${f.size}, ${STATUS[f.s]}`;
    const b = document.createElement('button');
    b.className = 'floors__hit'; b.type = 'button'; b.dataset.n = f.n; b.setAttribute('aria-label', label);
    b.style.top = `${(f.y[0] / IMG_H) * 100}%`; b.style.height = `${((f.y[1] - f.y[0]) / IMG_H) * 100}%`;
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showFloor(f.n); });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') showFloor(floorSel); });
    b.addEventListener('click', () => selectFloor(f.n));
    b.addEventListener('focus', () => showFloor(f.n));
    hits.appendChild(b);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-n="${f.n}" aria-pressed="false"><b>${f.n === 1 ? 'ק' : f.n}</b><span>${f.type}</span><span class="sz">${f.size.split(' +')[0]}</span><span class="dot dot--${f.s}" title="${STATUS[f.s]}"></span></button>`;
    li.firstChild.setAttribute('aria-label', label);
    li.firstChild.addEventListener('click', () => { selectFloor(f.n); $('#floorsCard').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); });
    flist.appendChild(li);
  });
  hits.addEventListener('pointerleave', () => showFloor(floorSel));
  selectFloor(7);
  $('#fcCta').addEventListener('click', () => {
    const f = FLOORS[floorSel - 1];
    setApt(f.apt);
    $('#f-floor').value = String(f.n);
    $('#formFloorText').textContent = `התעניינות: קומה ${f.n === 1 ? 'קרקע' : f.n} · ${f.type}`;
    $('#formFloor').hidden = false;
  });
  $('#formFloorClear')?.addEventListener('click', () => { $('#formFloor').hidden = true; $('#f-floor').value = ''; });
  });

  /* =======================================================
     7 · The building — sticky image follows the text
     ======================================================= */
  section("7 · The building", () => {
  const bImgs = $$('.building__img');
  const amenities = $$('.amenity');
  const amIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      amenities.forEach((a) => a.classList.toggle('is-active', a === en.target));
      const i = +en.target.dataset.i;
      bImgs.forEach((im) => im.classList.toggle('is-active', +im.dataset.i === i));
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  amenities.forEach((a) => amIO.observe(a));
  amenities[0].classList.add('is-active');
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
     9 · Location — Leaflet + CARTO light, loaded only when near
     ======================================================= */
  section("9 · Location", () => {
  const mapEl = $('#map');
  const AURA_LL = [32.1668, 34.8072];
  const PLACES = {
    beach: { ll: [32.1712, 34.7996], name: 'חוף אכדיה' },
    marina: { ll: [32.1618, 34.7950], name: 'מרינה הרצליה' },
    biz: { ll: [32.1622, 34.8088], name: 'אזור התעסוקה פיתוח' },
    road2: { ll: [32.1700, 34.8172], name: 'כביש החוף (2)' },
    train: { ll: [32.1636, 34.8178], name: 'תחנת רכבת הרצליה' },
  };
  const loadAsset = (tag, attrs) => new Promise((res, rej) => { const n = document.createElement(tag); Object.assign(n, attrs); n.onload = res; n.onerror = rej; document.head.appendChild(n); });
  let map = null; const pins = {};
  function initMap() {
    const L = window.L;
    const touch = matchMedia('(pointer: coarse)').matches;
    map = L.map(mapEl, { center: AURA_LL, zoom: 14, maxZoom: 16, scrollWheelZoom: false, dragging: !touch, touchZoom: !touch, tap: false, zoomControl: true, attributionControl: true });
    // CARTO's free basemaps now answer with an "API key required" tile, so the keyless
    // Esri Light Gray Canvas (base + labels) is used instead, warmed with a CSS filter.
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    const base = L.tileLayer(ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16, attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    // until tiles arrive the static map shows through; if none arrive, it stays
    let tilesOk = 0;
    if (mapEl) base.on('tileload', () => { if (!tilesOk++) mapEl.classList.add('is-ready'); });
    setTimeout(() => { if (!tilesOk) mapEl.classList.add('is-failed'); }, 8000);
    L.tileLayer(ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'overlayPane' }).addTo(map);
    L.marker(AURA_LL, { icon: L.divIcon({ className: 'aura-pin', html: '<i></i><b>AURA</b>', iconSize: [16, 16] }), keyboard: false, title: 'AURA' }).addTo(map);
    Object.entries(PLACES).forEach(([k, v]) => {
      pins[k] = L.marker(v.ll, { icon: L.divIcon({ className: 'place-pin', html: '<i></i>', iconSize: [10, 10] }), keyboard: false })
        .bindTooltip(v.name, { direction: 'top', offset: [0, -8], className: 'place-tip' }).addTo(map);
    });
    map.fitBounds(L.latLngBounds([AURA_LL, ...Object.values(PLACES).map((p) => p.ll)]), { padding: [36, 36] });
    if (touch) {
      mapEl.classList.add('is-locked');
      $('#mapActivate').addEventListener('click', () => {
        map.dragging.enable(); map.touchZoom.enable(); mapEl.classList.remove('is-locked');
      });
    }
  }
  new IntersectionObserver(([en], obs) => {
    if (!en.isIntersecting) return;
    obs.disconnect();
    Promise.all([
      loadAsset('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }),
      loadAsset('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' }),
    ]).then(initMap).catch(() => mapEl.classList.add('is-failed'));
  }, { rootMargin: '600px 0px' }).observe(mapEl);
  $$('#places li').forEach((li) => {
    const k = li.dataset.pin;
    const on = () => { li.classList.add('is-hot'); const p = pins[k]; if (p) { p.getElement()?.classList.add('is-hot'); p.openTooltip(); } };
    const off = () => { li.classList.remove('is-hot'); const p = pins[k]; if (p) { p.getElement()?.classList.remove('is-hot'); p.closeTooltip(); } };
    li.addEventListener('pointerenter', on); li.addEventListener('pointerleave', off);
  });
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

})();
