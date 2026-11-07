// Extracts the hero image sequence from assets/aura.mp4 into WebP frame sets.
// Frame density varies with camera speed (measured with tblend/signalstats):
// static time-lapse stretches are sampled sparsely, fast camera moves densely.
// Usage: node tools/extract-frames.mjs [quality-desktop] [quality-mobile]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets/aura.mp4';
const DURATION = 31;
const qD = +(process.argv[2] || 70), qM = +(process.argv[3] || 43);

// [startSec, endSec, samplesPerSec]
const SETS = {
  d: {
    vf: 'scale=1280:-2',
    q: qD,
    segs: [[0, 11, 3], [11, 13, 14], [13, 21, 4], [21, 25, 7], [25, 26, 3], [26, 30, 7], [30, 31, 3]],
  },
  // Portrait set: centre crop scaled to 720 wide, extra frames where the camera moves fast (~140 frames, <=3.5 MB).
  m: {
    vf: 'crop=1000:1098:460:0,scale=720:-2',
    q: qM,
    segs: [[0, 11, 3], [11, 13, 14], [13, 21, 3.5], [21, 25, 6], [25, 26, 3], [26, 30, 5], [30, 31, 3]],
  },
};

const manifest = { duration: DURATION, sets: {} };
for (const [key, cfg] of Object.entries(SETS)) {
  const dir = join('frames', key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const times = [];
  for (const [a, b, r] of cfg.segs) {
    const n = Math.round((b - a) * r);
    const start = times.length + 1;
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-ss', String(a), '-i', SRC, '-t', String(b - a),
      '-vf', `fps=${r}:round=near,${cfg.vf}`, '-frames:v', String(n),
      '-c:v', 'libwebp', '-quality', String(cfg.q), '-compression_level', '6', '-preset', 'photo',
      '-start_number', String(start), join(dir, '%04d.webp'),
    ], { stdio: 'inherit' });
    const made = readdirSync(dir).length - (start - 1);
    for (let k = 0; k < made; k++) times.push(+(a + k / r).toFixed(3));
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  const bytes = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  manifest.sets[key] = { count: files.length, t: times };
  console.log(`${key}: ${files.length} frames, ${(bytes / 1048576).toFixed(1)} MB, avg ${(bytes / files.length / 1024).toFixed(0)} KB`);
}
writeFileSync('frames/manifest.json', JSON.stringify(manifest));
