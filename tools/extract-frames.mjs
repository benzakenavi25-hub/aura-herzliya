// Extracts the hero image sequences into WebP frame sets:
//   d = landscape, from assets/aura.mp4 (16:9 film)
//   v = portrait,  from assets/vertical/aura-vertical.mp4 (9:16 film, the 7 joined clips)
// Frame density varies with camera speed (measured with tblend/signalstats):
// static time-lapse stretches are sampled sparsely, fast camera moves densely.
// Usage: node tools/extract-frames.mjs [quality-desktop] [quality-portrait] [only-set, e.g. v]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const qD = +(process.argv[2] || 62), qM = +(process.argv[3] || 66);
const ONLY = process.argv[4] || '';

// [startSec, endSec, samplesPerSec]
const SETS = {
  d: {
    src: 'assets/aura.mp4',
    vf: 'scale=1920:-2',
    q: qD,
    segs: [[0, 11, 6], [11, 13, 16], [13, 21, 6], [21, 25, 12], [25, 26, 6], [26, 30, 12], [30, 31, 6]],
  },
  // Portrait set: native 768w; 6–10 fps on the time-lapse, 18 fps where the drone moves (20.5–30 s, 31–35 s).
  // The film's very last frame is always appended: it is the descent's first panel.
  v: {
    src: 'assets/vertical/aura-vertical.mp4',
    vf: 'scale=768:-2',   // the film's native width: no downscale
    q: qM,
    segs: [[0, 6, 6], [6, 15.5, 8], [15.5, 20.5, 10], [20.5, 30, 18], [30, 31, 10], [31, 35, 18], [35, 36, 6]],
    last: true,
  },
};

// re-exporting one set keeps the other set's files and manifest entry untouched
const manifest = ONLY ? JSON.parse(readFileSync('frames/manifest.json', 'utf8')) : { sets: {} };
for (const k of Object.keys(manifest.sets)) if (!SETS[k]) delete manifest.sets[k];   // drop retired sets
for (const [key, cfg] of Object.entries(SETS)) {
  if (ONLY && key !== ONLY) continue;
  const dir = join('frames', key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const times = [];
  for (const [a, b, r] of cfg.segs) {
    const n = Math.round((b - a) * r);
    const start = times.length + 1;
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-ss', String(a), '-i', cfg.src, '-t', String(b - a),
      '-vf', `fps=${r}:round=near,${cfg.vf}`, '-frames:v', String(n),
      '-c:v', 'libwebp', '-quality', String(cfg.q), '-compression_level', '6', '-preset', 'photo',
      '-start_number', String(start), join(dir, '%04d.webp'),
    ], { stdio: 'inherit' });
    const made = readdirSync(dir).length - (start - 1);
    for (let k = 0; k < made; k++) times.push(+(a + k / r).toFixed(3));
  }
  if (cfg.last) {
    // the film's final frame, exactly
    const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', cfg.src]).toString();
    const n = readdirSync(dir).length + 1;
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-sseof', '-0.5', '-i', cfg.src, '-f', 'image2', '-update', '1', '-vf', cfg.vf,
      '-c:v', 'libwebp', '-quality', String(cfg.q), '-compression_level', '6', '-preset', 'photo',
      join(dir, String(n).padStart(4, '0') + '.webp'),
    ], { stdio: 'inherit' });
    times.push(+(dur - 1 / 24).toFixed(3));
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  const bytes = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  manifest.sets[key] = { count: files.length, t: times };
  console.log(`${key}: ${files.length} frames, ${(bytes / 1048576).toFixed(1)} MB, avg ${(bytes / files.length / 1024).toFixed(0)} KB`);
}
writeFileSync('frames/manifest.json', JSON.stringify(manifest));
