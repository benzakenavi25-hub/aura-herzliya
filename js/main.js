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
  if (reduced) root.classList.add('reduced');

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
      for (let i = 0; i < 18; i++) push(i);
      for (let i = 0; i < n; i += 12) push(i);
      const gate = order.length;
      for (let i = 0; i < n; i++) push(i);

      let loaded = 0, gateLoaded = 0, cursor = 0, released = false;
      const bar = $('#loaderBar'), pct = $('#loaderPct');
      return new Promise((resolve) => {
        const release = () => { if (!released) { released = true; resolve(); } };
        const next = () => {
          if (cursor >= order.length) return;
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

  if (!reduced) {
    document.body.classList.add('is-loading');
    sizeCanvas();
    addEventListener('resize', sizeCanvas);
    loadFrames().then(() => {
      sizeCanvas(); setProgress(0);
      hideLoader();
      initScrub();
    }).catch(() => { root.classList.add('reduced'); hideLoader(); });
  } else {
    loader.remove();
  }

  /* =======================================================
     Header / floating contact / mobile nav
     ======================================================= */
  const header = $('#header');
  const wa = $('.wa');
  const menuBtn = $('#menuBtn');
  const mnav = $('#mobileNav');
  let lastY = scrollY;
  // Floating contact: hidden in the hero, while the form or footer is on screen,
  // and (on phones) while scrolling down through content — it returns when scrolling up
  // or when the page comes to rest, so it never parks on top of text being read.
  let waBlocked = false, waScrollingDown = matchMedia('(max-width: 760px)').matches, waIdle = null;
  const narrow = matchMedia('(max-width: 760px)');
  const waIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { en.target._inView = en.isIntersecting; });
    waBlocked = [$('#contact'), $('.footer')].some((n) => n._inView);
    onScroll();
  }, { rootMargin: '0px 0px -10% 0px' });
  waIO.observe($('#contact')); waIO.observe($('.footer'));
  function onScroll() {
    const y = scrollY;
    const heroEnd = hero.offsetTop + hero.offsetHeight - innerHeight * (reduced ? 0.3 : 1);
    const past = y > heroEnd;
    header.classList.toggle('is-visible', past);
    const menuOpen = menuBtn.getAttribute('aria-expanded') === 'true';
    header.classList.toggle('is-hidden-by-scroll', past && y > lastY + 4 && y > heroEnd + 400 && !menuOpen);
    if (y < lastY - 4) header.classList.remove('is-hidden-by-scroll');
    if (narrow.matches) {
      // phones: appears on scroll-up (intent), tucks away again when reading resumes
      if (y > lastY + 2) waScrollingDown = true;
      else if (y < lastY - 2) {
        waScrollingDown = false;
        clearTimeout(waIdle);
        waIdle = setTimeout(() => { waScrollingDown = true; wa.classList.remove('is-visible'); }, 3200);
      }
    } else waScrollingDown = false;
    wa.classList.toggle('is-visible', past && !waBlocked && !waScrollingDown);
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
  menuBtn.addEventListener('click', (e) => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true', false, e.detail === 0));
  $$('a', mnav).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mnav.classList.contains('is-open')) setMenu(false, true); });
  matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });

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

  // Active section in nav
  const navLinks = $$('.header__nav a');
  const io2 = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navLinks.forEach((l) => l.setAttribute('aria-current', String(l.getAttribute('href') === '#' + en.target.id)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['project', 'residences', 'specs', 'location', 'progress', 'gallery', 'contact'].forEach((id) => io2.observe($('#' + id)));

  /* =======================================================
     Reveals + count-up
     ======================================================= */
  $$('[data-reveal-lines] > span').forEach((s) => { const inner = document.createElement('span'); inner.innerHTML = s.innerHTML; s.innerHTML = ''; s.appendChild(inner); });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
      $$('[data-count]', en.target).forEach(countUp);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  $$('[data-reveal], [data-reveal-lines]').forEach((el) => io.observe(el));
  // Stagger siblings that enter together (stats, specs, timeline, gallery): 70 ms apart, capped.
  ['.stats', '.specs__grid', '.timeline', '.gal'].forEach((sel) => {
    $$(`${sel} > [data-reveal]`).forEach((el, n) => el.style.setProperty('--d', `${Math.min(n, 5) * 70}ms`));
  });

  function countUp(el) {
    const end = +el.dataset.count;
    if (reduced) { el.textContent = end; return; }
    const dur = 1800, t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  /* =======================================================
     Residences — selector + schematic SVG plans
     ======================================================= */
  const R = (x, y, w, h, label, area) => ({ x, y, w, h, label, area });
  const PLANS = [
    {
      name: 'דירת 4 חדרים', short: '4 חדרים',
      desc: 'בית מואר לזוג או למשפחה צעירה. הסלון והמרפסת פונים מערבה, אל הים, וחדרי השינה שקטים ומופנים אל הגינה.',
      facts: [['שטח הדירה', '118 מ״ר'], ['מרפסת שמש', '14 מ״ר'], ['חדרי רחצה', '2'], ['כיווני אוויר', '3'], ['קומות', '2 עד 6']],
      outer: [60, 40, 400, 280],
      outs: [R(20, 70, 40, 220, 'מרפסת', '14')],
      rooms: [
        R(60, 40, 190, 160, 'סלון ופינת אוכל', '42'), R(250, 40, 90, 100, 'מטבח', '13'),
        R(340, 40, 120, 120, 'ממ״ד', '12'), R(250, 140, 90, 70, 'רחצה', ''),
        R(340, 160, 120, 160, 'חדר', '13'), R(60, 200, 140, 120, 'יחידת הורים', '17'),
        R(200, 200, 50, 120, 'רחצה', ''), R(250, 210, 90, 110, 'מבואה', ''),
      ],
      entry: [295, 320],
    },
    {
      name: 'דירת 5 חדרים', short: '5 חדרים',
      desc: 'חלל ציבורי רחב עם מטבח פתוח, יחידת הורים עם חדר ארונות, ושלושה חדרים נוספים. נוף פתוח לים מכל החלל המרכזי.',
      facts: [['שטח הדירה', '146 מ״ר'], ['מרפסת שמש', '18 מ״ר'], ['חדרי רחצה', '2 + שירותי אורחים'], ['כיווני אוויר', '3'], ['קומות', '3 עד 10']],
      outer: [40, 40, 440, 280],
      outs: [R(8, 60, 32, 240, 'מרפסת', '18')],
      rooms: [
        R(40, 40, 200, 150, 'סלון', '38'), R(240, 40, 110, 110, 'מטבח ופינת אוכל', '20'),
        R(350, 40, 130, 110, 'ממ״ד', '12'), R(350, 150, 130, 90, 'חדר', '11'),
        R(350, 240, 130, 80, 'חדר', '11'), R(40, 190, 150, 130, 'יחידת הורים', '18'),
        R(190, 190, 50, 70, 'רחצה', ''), R(190, 260, 50, 60, 'ארונות', ''),
        R(240, 150, 60, 70, 'רחצה', ''), R(300, 150, 50, 70, 'כביסה', ''),
        R(240, 220, 110, 100, 'מבואה', ''),
      ],
      entry: [295, 320],
    },
    {
      name: 'דירת גן · מיני פנטהאוז', short: 'גן / מיני פנטהאוז',
      desc: 'בקומת הקרקע עם גינה פרטית, או בקומה 11 עם מרפסת גג רחבה. אותו תכנון, שני אופני חיים — בשניהם החוץ הוא חלק מהבית.',
      facts: [['שטח הדירה', '168 מ״ר'], ['גינה / מרפסת גג', '85 מ״ר'], ['חדרי רחצה', '2 + שירותי אורחים'], ['כיווני אוויר', '4'], ['קומות', 'קרקע · 11']],
      outer: [150, 40, 330, 280],
      outs: [R(20, 40, 130, 280, 'גינה / מרפסת גג', '85')],
      rooms: [
        R(150, 40, 180, 160, 'סלון ופינת אוכל', '46'), R(330, 40, 70, 90, 'מטבח', '14'),
        R(400, 40, 80, 90, 'ממ״ד', '12'), R(400, 130, 80, 95, 'חדר', '12'),
        R(400, 225, 80, 95, 'חדר', '12'), R(150, 200, 130, 120, 'יחידת הורים', '20'),
        R(280, 200, 50, 60, 'רחצה', ''), R(280, 260, 50, 60, 'ארונות', ''),
        R(330, 130, 70, 70, 'רחצה', ''), R(330, 200, 70, 120, 'מבואה', ''),
      ],
      entry: [365, 320],
    },
    {
      name: 'פנטהאוז גג', short: 'פנטהאוז גג',
      desc: 'הבית היחיד בקומה העליונה. סוויטת הורים, חדר עבודה ומבואה פרטית מהמעלית — ומרפסת גג עם פרגולת ברונזה ובריכת אינסוף פרטית.',
      facts: [['שטח הדירה', '245 מ״ר'], ['מרפסת גג', '160 מ״ר'], ['בריכה פרטית', '12 מ׳'], ['חדרי רחצה', '3 + שירותי אורחים'], ['קומה', '12 · יחידה אחת']],
      outer: [170, 30, 330, 310],
      outs: [R(10, 30, 160, 310, 'מרפסת גג', '160')],
      pool: R(26, 262, 128, 58, 'בריכה', ''),
      rooms: [
        R(170, 30, 170, 170, 'סלון ופינת אוכל', '58'), R(340, 30, 80, 100, 'חדר עבודה', '12'),
        R(420, 30, 80, 100, 'מטבח', '18'), R(420, 130, 80, 80, 'ממ״ד', '12'),
        R(420, 210, 80, 65, 'חדר', '13'), R(420, 275, 80, 65, 'חדר', '13'),
        R(170, 200, 140, 140, 'סוויטת הורים', '26'), R(310, 200, 50, 70, 'רחצה', ''),
        R(310, 270, 50, 70, 'ארונות', ''), R(340, 130, 80, 70, 'רחצה', ''),
        R(360, 200, 60, 140, 'מבואה פרטית', ''),
      ],
      entry: [390, 340],
    },
  ];

  const svg = $('#planSvg');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  function renderPlan(p, animate = true) {
    while (svg.lastChild && svg.lastChild.nodeName !== 'title') svg.removeChild(svg.lastChild);
    $('#planTitle').textContent = `תוכנית סכמטית: ${p.name}`;
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#9A7448', 'stroke-width': .6, opacity: .45 }, pat);

    const anim = !reduced && animate;
    const rectEl = (r, cls) => {
      const n = el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: cls + (anim ? ' plan__draw' : '') }, svg);
      if (anim) n.style.setProperty('--len', 2 * (r.w + r.h));
      return n;
    };
    p.outs.forEach((o) => rectEl(o, 'plan__out'));
    if (p.pool) rectEl(p.pool, 'plan__pool');
    const [ox, oy, ow, oh] = p.outer;
    p.rooms.forEach((r) => rectEl(r, 'plan__room'));
    rectEl({ x: ox, y: oy, w: ow, h: oh }, 'plan__outer');

    // Phones: the drawing is fitted to the screen and set in larger units (≥11px rendered);
    // service rooms get a one-letter key explained under the plan.
    const compact = compactMQ.matches;
    const FS = compact ? 17 : 11, FA = compact ? 16 : 10, FB = compact ? 18 : 12;
    const KEY = { 'רחצה': 'ר', 'ארונות': 'א', 'כביסה': 'כ' };
    const usedKeys = new Set();
    const fits = (txt, fs, w) => txt.length * fs * 0.56 <= w - 8;
    const label = (r, big) => {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const fs = big ? FB : FS;
      let text = r.label;
      if (compact && KEY[text]) { usedKeys.add(text); text = KEY[text]; }
      let lines = [text];
      if (!fits(text, fs, r.w) && text.includes(' ')) {
        const words = text.split(' '); const half = Math.ceil(words.length / 2);
        lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')];
      }
      const widest = Math.max(...lines.map((l) => l.length));
      const rotate = !fits('x'.repeat(widest), fs, r.w) && r.h > r.w * 1.6;
      const lh = fs * 1.15, areaH = r.area ? FA * 1.2 : 0;
      const blockH = lines.length * lh + areaH;
      const g = el('g', rotate ? { transform: `rotate(-90 ${cx} ${cy})` } : {}, svg);
      lines.forEach((ln, n) => {
        const t = el('text', { x: cx, y: cy - blockH / 2 + lh * (n + 0.78), class: 'plan__label', 'font-size': fs }, g);
        t.textContent = ln;
      });
      if (r.area) { const a = el('text', { x: cx, y: cy - blockH / 2 + lines.length * lh + FA * 0.95, class: 'plan__area', 'font-size': FA }, g); a.textContent = `${r.area} מ״ר`; }
    };
    p.rooms.forEach((r) => label(r));
    p.outs.forEach((r) => label(r, true));
    if (p.pool) label(p.pool);

    // fitted viewBox on phones so the drawing uses the full width
    const boxes = [...p.outs, { x: ox, y: oy, w: ow, h: oh }, ...(p.pool ? [p.pool] : [])];
    const minX = Math.min(...boxes.map((b) => b.x)) - 6, maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 6;
    const minY = Math.min(...boxes.map((b) => b.y)) - 6;
    const [ex, ey] = p.entry;
    const bottom = ey + (compact ? 56 : 40);
    svg.setAttribute('viewBox', compact ? `${minX} ${minY} ${maxX - minX} ${bottom - minY}` : '0 0 520 380');

    // entrance marker
    el('path', { d: `M${ex - 14} ${ey} h28`, stroke: '#F3EEE6', 'stroke-width': 5 }, svg);
    el('path', { d: `M${ex} ${ey + 22} v-14 m-5 5 l5 -5 l5 5`, class: 'plan__door' }, svg);
    const et = el('text', { x: ex, y: ey + 22 + FS, class: 'plan__label', 'font-size': FS }, svg); et.textContent = 'כניסה';

    // sea direction (west = left)
    const sx = compact ? minX + 4 : 4, sy = compact ? bottom - 12 : 362;
    el('path', { d: `M${sx} ${sy} h${compact ? 50 : 70}`, class: 'plan__seaLine' }, svg);
    el('path', { d: `M${sx} ${sy} l7 -4 m-7 4 l7 4`, class: 'plan__seaLine' }, svg);
    const s = el('text', { x: sx + (compact ? 58 : 76), y: sy + 4, class: 'plan__sea', 'text-anchor': 'end', 'font-size': FS }, svg); s.textContent = 'הים';

    planKey.textContent = [...usedKeys].map((k) => `${KEY[k]} — ${k}`).join('  ·  ');
    planKey.hidden = !usedKeys.size;
  }
  const compactMQ = matchMedia('(max-width: 760px)');
  const planKey = document.createElement('p');
  planKey.className = 'res__key'; planKey.hidden = true;
  svg.after(planKey);
  compactMQ.addEventListener('change', () => renderPlan(PLANS[current], false));

  const tabs = $$('.res__tabs [role="tab"]');
  const resApp = $('#resApp');
  const tabBar = $('.res__tabs');
  // One indicator that slides between tabs (spatially consistent), moved with transform only.
  const ind = document.createElement('span');
  ind.className = 'res__ind'; ind.setAttribute('aria-hidden', 'true');
  tabBar.appendChild(ind);
  function moveIndicator(i, instant) {
    const t = tabs[i];
    if (instant) ind.style.transition = 'none';
    ind.style.transform = `translate(${t.offsetLeft}px, ${t.offsetTop + t.offsetHeight - 2}px) scaleX(${t.offsetWidth / 100})`;
    if (instant) { ind.offsetWidth; ind.style.transition = ''; }
  }
  addEventListener('resize', () => moveIndicator(current, true));
  let current = 0;
  // Keyboard-initiated switches are instant: no swap, no indicator travel, no drawing.
  function showPlan(i, keyboard) {
    const p = PLANS[i];
    tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === i)); t.tabIndex = n === i ? 0 : -1; });
    $('#panel-res').setAttribute('aria-labelledby', tabs[i].id);
    if (keyboard) tabs[i].focus();
    moveIndicator(i, keyboard || svg.childElementCount <= 1);
    const instant = reduced || keyboard;
    const apply = () => {
      renderPlan(p, !instant);
      $('#resName').textContent = p.name;
      $('#resDesc').textContent = p.desc;
      $('#resFacts').innerHTML = p.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      $('#resCta').dataset.apt = i;
      resApp.classList.remove('is-swapping');
    };
    if (i === current && svg.childElementCount > 1) return;
    current = i;
    if (instant || svg.childElementCount <= 1) apply();
    else { resApp.classList.add('is-swapping'); setTimeout(apply, 180); }
  }
  tabs.forEach((t, n) => {
    t.addEventListener('click', () => showPlan(n));
    t.addEventListener('keydown', (e) => {
      // RTL: ArrowLeft moves forward
      const k = e.key;
      let to = null;
      if (k === 'ArrowLeft') to = (n + 1) % tabs.length;
      if (k === 'ArrowRight') to = (n - 1 + tabs.length) % tabs.length;
      if (k === 'Home') to = 0;
      if (k === 'End') to = tabs.length - 1;
      if (to !== null) { e.preventDefault(); showPlan(to, true); }
    });
  });
  showPlan(0);
  // CTA pre-selects the apartment in the form
  $('#resCta').addEventListener('click', () => {
    const radios = $$('input[name="apt"]');
    const r = radios[+$('#resCta').dataset.apt || 0];
    if (r) r.checked = true;
  });

  /* =======================================================
     Location — list ↔ map highlight
     ======================================================= */
  $$('.places li').forEach((li) => {
    const pin = li.dataset.pin;
    const lab = $(`.map__labels [data-pin="${pin}"]`);
    const on = () => { li.classList.add('is-hot'); lab && lab.classList.add('is-hot'); };
    const off = () => { li.classList.remove('is-hot'); lab && lab.classList.remove('is-hot'); };
    li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off);
  });

  /* =======================================================
     Gallery lightbox
     ======================================================= */
  const GAL = [
    { src: 'img/08-terrace-1672.webp', alt: 'מרפסת הגג בשעת דמדומים: פרגולת ברונזה, עצי זית, ספה לבנה ובריכה מוארת', cap: 'מרפסת הגג · הדמיה' },
    { src: 'img/07-rooftop-1672.webp', alt: 'הפנטהאוז בראש המגדל בשקיעה, עם בריכת אינסוף ונוף לים', cap: 'הפנטהאוז · הדמיה' },
    { src: 'img/09-living-room-1672.webp', alt: 'סלון הפנטהאוז עם רצפת עץ, ספות בהירות וקיר זכוכית פתוח אל המרפסת והים', cap: 'הסלון · הדמיה' },
    { src: 'img/06-drone-1672.webp', alt: 'מבט אווירי על הקומות העליונות של המגדל, מרפסות מוארות והשמש שוקעת בים', cap: 'מבט מהאוויר · הדמיה' },
  ];
  const lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbCount = $('#lbCount');
  let li = 0, opener = null;
  function lbShow(i) {
    li = (i + GAL.length) % GAL.length;
    const g = GAL[li];
    lbImg.classList.add('is-swap');
    const pre = new Image(); pre.src = g.src;
    const set = () => { lbImg.src = g.src; lbImg.alt = g.alt; lbCap.textContent = g.cap; lbCount.textContent = `${String(li + 1).padStart(2, '0')} / ${String(GAL.length).padStart(2, '0')}`; requestAnimationFrame(() => lbImg.classList.remove('is-swap')); };
    pre.decode ? pre.decode().then(set, set) : (pre.onload = set);
  }
  $$('.gal__item').forEach((b) => b.addEventListener('click', () => {
    opener = b; lbShow(+b.dataset.index);
    lb.showModal(); document.body.style.overflow = 'hidden';
  }));
  lb.addEventListener('close', () => { document.body.style.overflow = ''; opener && opener.focus(); });
  $('#lbClose').addEventListener('click', () => lb.close());
  $('#lbNext').addEventListener('click', () => lbShow(li + 1));
  $('#lbPrev').addEventListener('click', () => lbShow(li - 1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lightbox__fig')) lb.close(); });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') lbShow(li + 1);
    if (e.key === 'ArrowRight') lbShow(li - 1);
  });
  let tx = null;
  lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) lbShow(li + (dx > 0 ? 1 : -1)); // RTL: swipe right → next
  });

  /* =======================================================
     Lead form (demo only — nothing is sent)
     ======================================================= */
  const form = $('#leadForm');
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
    const field = input.closest('.field');
    field.classList.toggle('has-error', !!msg);
    input.setAttribute('aria-invalid', String(!!msg));
    $('#e-' + input.name).textContent = msg;
    return !msg;
  }
  $$('input', form).forEach((inp) => {
    inp.addEventListener('blur', () => { if (inp.value || inp.type === 'checkbox') check(inp); });
    inp.addEventListener('input', () => { if (inp.closest('.field').classList.contains('has-error')) check(inp); });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputs = ['name', 'phone', 'email', 'consent'].map((n) => form.elements[n]);
    const bad = inputs.filter((i) => !check(i));
    if (bad.length) { bad[0].focus(); return; }
    const btn = $('.btn', form);
    btn.disabled = true; btn.firstElementChild.textContent = 'שולח…';
    setTimeout(() => {
      $('#successName').textContent = form.elements.name.value.trim().split(/\s+/)[0];
      form.hidden = true;
      const s = $('#success'); s.hidden = false; s.focus();
    }, 900);
  });
})();
