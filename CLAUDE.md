# AURA · Herzliya Pituach — static RTL Hebrew demo site (no build step, GitHub Pages from `main` root)

## Reading rules (keep context small)
- Read only the files and sections a task needs. Locate code with Grep, then Read with offset/limit.
- Never open `frames/`, `assets/`, `img/` binaries or `frames/manifest.json` (huge one-line JSON).
- Never read `js/main.js` in full (~1150 lines). Grep the section banner or function name below, read that range only.
- Same for `css/style.css` (~1010 lines) and `index.html` (~530 lines). Line numbers are approximate; grep to confirm.

## Files
- `index.html` — whole page; `privacy.html`, `terms.html`, `accessibility.html` legal pages.
- `css/style.css`, `js/main.js` — single stylesheet / single script (GSAP ScrollTrigger + Lenis 1.1.13 from CDN, no other libs).
- Scrolling: Lenis runs only on mouse/trackpad devices (touch = native). Scroll programmatically with `scrollToY(y, immediate)`, never `window.scrollTo` (Lenis would pull it back mid-glide). Inner scroll areas need `data-lenis-prevent`.
- Motion: JS "Motion layer" (last section) + CSS "MOTION" (end of file): `[data-split]` word masks, `mediaReveal` image masks, `.tone` day blend, `.progress` + `#secCount`, `.marquee`, cursor (`[data-cursor]` view/drag), drift, magnetic buttons, drag on horizontal sections. GSAP owns `transform` on revealed images; drift/magnetic use the separate `translate` property.
- `tools/` — `serve.mjs` (local server), `bump-version.mjs`, `shots.mjs` + `check-*.mjs` (Playwright), media scripts.

## Sections (index.html id → CSS banner → main.js banner / key functions)
Page order: hero → views → interlude → residences → contact → footer (floors, day, location removed). Each block in CSS and JS starts with a `/* ====` banner; grep the title.
- Palette: `:root` tokens (`--bg`, `--panel`, `--text`, `--text-2`, `--bronze`; legacy `--stone`/`--ink` = light text). `.hero, .loader` keep the old light tokens.
- Loader/header/menu: `#header`, `#mbar` → CSS "header" ~120 → JS "Header / floating contact / mobile nav" ~338: `onScroll`, `setMenu`, `whileVisible`
- Hero `#top` → "HERO" ~182 → JS "HERO" ~28: `loadFrames`, `initScrub`, `draw`, `placement`, `drawSky`, `updateUI`, `setProgress`, `hideLoader`; scroll pacing in `PACE` table
- Descent `#views` (+ elevator `#lift`; floor-12 caption holds the project line + facts) → "1 · THE DESCENT" ~374 → JS "1 · The descent" ~444: `render`, `goFloor`, `setBase`, `animateExtra`, `camera`
- Residences `#residences` (4 full-screen `.rpanel`s in `#resTrack`, pinned via `#resScroll` on desktop / snap carousel on phones; materials strip `.mats` below) → "4 · RESIDENCES" ~468 → JS ~582: `PLANS` data, `resDesktop`, `markRes`, `renderPlan`; `[data-plan]` opens `#planDlg`, `[data-apt]` pre-selects the form type
- Floor finder `#floors` → "5 · FLOOR FINDER" ~509 → JS ~772: data `FLOORS`/`BANDS`, `light`, `drawPlate`, `openPlan`, `closePlan`, `showCard`, `closeCard`
- Interlude `#interlude` (between views and residences; overlaps the descent's last screen and opens on its V3 frame, pinned 150vh: blur crossfade `V3-blur.webp`, warm vignette, two lines, bg veil; residences overlap its last 50vh; descent fades `--out` + `.is-handed` at the hand-off; header/contact stay hidden until it ends) → CSS "INTERLUDE" → JS "Interlude"; check: `tools/check-interlude.mjs`
- Location `#location` (full-bleed N1, 5 `.lpin`s lit by scroll, `#locList` = SR list / phone list, "לניווט" Google Maps link; no map library) → "9 · LOCATION" ~748 → JS ~1029: `locProgress`, `locPins`
- Finale `#contact` (N2 at night, `.finale__line`, form on light `.finale__card`, `#brochureBtn`) → CSS "CONTACT" (form rules) + "FINALE" → JS "Forms": `wireForm`, `check`, `normPhone`; dialogs JS ~761
- Footer: one row (logo, legal links, demo line) → CSS "FOOTER"
- Full spec lives in `<dialog id="specDlg">` (opened by `#specBtn` in the materials strip) → CSS "SPEC"
- Shared CSS (reveals, buttons, dialogs) ~292; footer ~846; "POLISH PASS" overrides ~882 (check here before editing a section's rules)

## Media
- `frames/d/` (landscape 1920w, 254, ~19.5 MB) and `frames/m/` (portrait crop 1000×1098, 274, ~12.7 MB): `0001.webp`… hero sequence; timings in `frames/manifest.json` (re-export one set: `node tools/extract-frames.mjs 62 60 m`). Desktop holds frames as `<img>`, GSAP `scrub: 0.9`. Touch (`TOUCH`/`USE_BMP` in JS "HERO"): own rAF lerp (0.15) toward the ScrollTrigger progress; frames kept as Blobs, only a window around the playhead decoded to ImageBitmaps (`planDecode`/`pump`, ~18 live), in-between frames decoded first on long flicks; sky/ground extensions cached offscreen. Check: `tools/check-scrub-touch.mjs [url] [webkit|chromium]`. Page images use native `loading="lazy"` (no data-src).
- `img/new/<CODE>-{640,1024,1672}.webp` (codes A1…V3, referenced via `srcs(code)` in main.js); `img/` also has older stills, `map-static.webp`, `poster.webp`, `og-aura.jpg`.
- `assets/` = untracked source video/PNGs; regenerate with `tools/extract-frames.mjs` / `optimize-images.mjs` (see README).

## Version bump + deploy
1. `node tools/bump-version.mjs` — stamps `?v=YYYYMMDDHHMM` on style.css/main.js links in every HTML page (always before committing).
2. Verify light: `node tools/serve.mjs 5173`, one Playwright screenshot per viewport (desktop + iPhone), check page errors.
3. `git commit` then `git push origin main` — GitHub Pages redeploys from the `main` root.
