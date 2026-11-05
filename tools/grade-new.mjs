// Colour-grades the new image set as one shoot and writes responsive WebP.
//  - saturation -10% on everything
//  - warmth matched: each image's red/blue balance is pulled ~45% of the way toward the
//    set median (capped, so blue-hour shots stay blue-hour)
//  - V1/V2/V3 (pixel-aligned views) share ONE correction and identical sizes/crops
// Usage: node tools/grade-new.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';

const SRC = 'assets/new', OUT = 'img/new';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
const mean = (f) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', join(SRC, f), '-vf', 'scale=64:-2,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [buf[0], buf[1], buf[2]];
};
const stats = files.map((f) => { const [r, g, b] = mean(f); return { f, code: parse(f).name, r, g, b, ratio: r / Math.max(b, 1) }; });
const ratios = stats.map((s) => s.ratio).sort((a, b) => a - b);
const median = ratios[Math.floor(ratios.length / 2)];

const gainFor = (ratio) => {
  // pull 45% toward the median in log space, cap at ±7%
  let k = Math.exp(0.45 * (Math.log(median) - Math.log(ratio)));
  k = Math.min(1.07, Math.max(0.93, k));
  return { rr: Math.sqrt(k), bb: 1 / Math.sqrt(k) };
};
const vRatio = Math.exp(stats.filter((s) => /^V\d/.test(s.code)).reduce((a, s) => a + Math.log(s.ratio), 0) / 3);

let total = 0;
for (const s of stats) {
  const g = gainFor(/^V\d/.test(s.code) ? vRatio : s.ratio);
  const portrait = /^M\d/.test(s.code);
  const widths = portrait ? [480, 800, 1122] : [640, 1024, 1672];
  const grade = `colorchannelmixer=rr=${g.rr.toFixed(4)}:bb=${g.bb.toFixed(4)},eq=saturation=0.9`;
  for (const w of widths) {
    const out = join(OUT, `${s.code}-${w}.webp`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(SRC, s.f), '-vf', `${grade},scale=${w}:-2:flags=lanczos`,
      '-c:v', 'libwebp', '-quality', w > 1100 ? '74' : '72', '-compression_level', '6', '-preset', 'photo', out]);
    total += statSync(out).size;
  }
  console.log(`${s.code}  R/B ${s.ratio.toFixed(2)} → gain r×${g.rr.toFixed(3)} b×${g.bb.toFixed(3)}`);
}
console.log(`median R/B ${median.toFixed(2)} · ${files.length} images · ${(total / 1048576).toFixed(1)} MB`);
