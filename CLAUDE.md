# AURA · Herzliya Pituach — static RTL Hebrew demo site (no build step, GitHub Pages from `main` root)

## Reading rules (keep context small)
- Read only the files and sections a task needs. Locate code with Grep, then Read with offset/limit.
- Never open `frames/`, `assets/`, `img/` binaries or `frames/manifest.json` (huge one-line JSON).
- Never read `js/main.js` in full (~1170 lines). Grep the section banner or function name below, read that range only.
- Same for `css/style.css` (~1140 lines) and `index.html` (~650 lines). Line numbers are approximate; grep to confirm.

## Files
- `index.html` — whole page; `privacy.html`, `terms.html`, `accessibility.html` legal pages.
- `css/style.css`, `js/main.js` — single stylesheet / single script (GSAP ScrollTrigger, Leaflet loaded lazily).
- `tools/` — `serve.mjs` (local server), `bump-version.mjs`, `shots.mjs` + `check-*.mjs` (Playwright), media scripts.

## Sections (index.html id → CSS banner → main.js banner / key functions)
Each block in CSS and JS starts with a `/* ====` banner; grep the title.
- Loader/header/menu: `#header`, `#mbar` → CSS "header" ~113 → JS "Header / floating contact / mobile nav" ~337: `onScroll`, `setMenu`, `whileVisible`
- Hero `#top` → "HERO" ~170 → JS "HERO" ~27: `loadFrames`, `initScrub`, `draw`, `placement`, `drawSky`, `updateUI`, `setProgress`, `hideLoader`; scroll pacing in `PACE` table
- Descent `#views` (+ elevator `#lift`) → "1 · THE DESCENT" ~361 → JS "1 · The descent" ~444: `render`, `goFloor`, `setBase`, `animateExtra`, `camera`
- Project `#project` → "2 · PROJECT" ~454
- Residences `#residences` → "4 · RESIDENCES" ~475 → JS ~582: `showPlan`, `applyPlan`, `moveIndicator`, `renderPlan`
- Floor finder `#floors` → "5 · FLOOR FINDER" ~516 → JS ~772: data `FLOORS`/`BANDS`, `light`, `drawPlate`, `openPlan`, `closePlan`, `showCard`, `closeCard`
- Materials `#materials` → "6 · MATERIALS" ~693
- Building `#building` → "7 · THE BUILDING" ~724 → JS ~1009
- Day `#day` → "8 · A DAY AT AURA" ~750 → JS ~1027: `setDay`, `dayDesktop`
- Location `#location` → "9 · LOCATION" ~784 → JS ~1063: `initMap`
- Team `#team` ~821, FAQ `#faq` ~840 (CSS only)
- Contact `#contact` → "CONTACT" ~859 → JS "Forms" ~1122: `wireForm`, `check`, `normPhone`; dialogs JS ~761
- Shared CSS (reveals, buttons, dialogs) ~280; footer ~940; "POLISH PASS" overrides ~976 (check here before editing a section's rules)

## Media
- `frames/d/` (landscape, 254) and `frames/m/` (portrait crop, 244): `0001.webp`… hero sequence; timings in `frames/manifest.json`.
- `img/new/<CODE>-{640,1024,1672}.webp` (codes A1…V3, referenced via `srcs(code)` in main.js); `img/` also has older stills, `map-static.webp`, `poster.webp`, `og-aura.jpg`.
- `assets/` = untracked source video/PNGs; regenerate with `tools/extract-frames.mjs` / `optimize-images.mjs` (see README).

## Version bump + deploy
1. `node tools/bump-version.mjs` — stamps `?v=YYYYMMDDHHMM` on style.css/main.js links in every HTML page (always before committing).
2. Verify light: `node tools/serve.mjs 5173`, one Playwright screenshot per viewport (desktop + iPhone), check page errors.
3. `git commit` then `git push origin main` — GitHub Pages redeploys from the `main` root.
