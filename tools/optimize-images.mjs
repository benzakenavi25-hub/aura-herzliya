// Builds responsive WebP stills, the Open Graph image and the favicon PNGs
// from the source PNGs in assets/ (source files stay out of git).
// Usage: node tools/optimize-images.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'assets', OUT = 'img';
const WIDTHS = [640, 1024, 1672];
mkdirSync(OUT, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

for (const f of readdirSync(SRC).filter((x) => x.endsWith('.png'))) {
  const name = basename(f, '.png');
  for (const w of WIDTHS) {
    ff(['-i', join(SRC, f), '-vf', `scale=${w}:-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', w > 1100 ? '72' : '70',
      '-compression_level', '6', '-preset', 'photo', join(OUT, `${name}-${w}.webp`)]);
  }
}

// Open Graph 1200x630 from the rooftop at sunset (centre-cropped).
ff(['-i', join(SRC, '06-drone.png'), '-vf', 'scale=1200:-2:flags=lanczos,crop=1200:630:0:(ih-630)/2', '-q:v', '3', join(OUT, 'og-aura.jpg')]);
// Hero poster for reduced motion / no-JS (the empty lot = the film's first frame).
ff(['-i', join(SRC, '01-lot.png'), '-vf', 'scale=1672:-2', '-c:v', 'libwebp', '-quality', '72', join(OUT, 'poster.webp')]);

let total = 0;
for (const f of readdirSync(OUT)) total += statSync(join(OUT, f)).size;
console.log(`img/: ${readdirSync(OUT).length} files, ${(total / 1048576).toFixed(1)} MB`);
