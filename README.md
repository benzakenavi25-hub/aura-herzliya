# AURA · Herzliya Pituach

A demo website for a fictional luxury boutique tower by the sea. It is a static site in Hebrew, laid out right-to-left, with no build step.

The hero is a scroll-scrubbed WebP image sequence drawn on a `<canvas>`, driven by GSAP ScrollTrigger. The site uses one frame set for landscape screens and a centre-cropped set for portrait screens.

## Run locally

```bash
node tools/serve.mjs 5173
```

Then open http://localhost:5173.

## Rebuild media

The source files (`assets/aura.mp4` and the PNG stills) are not committed. Put them in `./assets`, install ffmpeg, then run:

```bash
node tools/extract-frames.mjs 55 58   # frames/d, frames/m, frames/manifest.json
node tools/optimize-images.mjs        # img/*.webp, OG image, poster
```

`extract-frames.mjs` samples the video densely where the camera moves fast and sparsely during the static construction time-lapse. Scroll pacing is set separately, in the `PACE` table in `js/main.js`.

## Screenshots (Playwright)

```bash
npm i && npx playwright install chromium webkit
node tools/shots.mjs http://localhost:5173/
```

## Deploy

GitHub Pages serves the site from the `main` branch root (`/`).
