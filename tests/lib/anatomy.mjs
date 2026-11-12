// Load the shipped web/js scripts into Node and analyze audio exactly the way the
// Mix tab does (web/js/app.js, MX pump()): an Engine at the file's sample rate with
// pitchEvery 6, fed 4096-sample stereo chunks, finalized, then AnatomyMix.profile
// with the audio attached. Capped at MAX_SEC like the page.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const Engine = require(join(ROOT, 'web/js/engine.js'));
export const Demo = require(join(ROOT, 'web/js/demo.js'));
export const Mix = require(join(ROOT, 'web/js/mix.js'));

export const MAX_SEC = 600;   // web/js/app.js MAX_SEC: Mix decks analyze at most 10 minutes
const CH = 4096;

export function analyze({ L, R, sr }, meta = {}) {
  const n = L.length > MAX_SEC * sr ? Math.floor(MAX_SEC * sr) : L.length;
  const e = new Engine.Engine(sr, { maxSec: n / sr + 2, pitchEvery: 6 });
  for (let k = 0; k < n; k += CH) { const b = Math.min(n, k + CH); e.push(L.subarray(k, b), R.subarray(k, b)); }
  e.finalize();
  const profile = Mix.profile(e, { ...meta, audio: { L: L.subarray(0, n), R: R.subarray(0, n), sr } });
  return { engine: e, profile, truncated: n < L.length };
}

export function demoAudio(id, sr = 44100) {
  const s = Demo.render(sr, id);
  return { L: s.L, R: s.R, sr: s.sr };
}

// --- small formatting helpers shared by the reports -------------------------
export const mmss = (t) => { if (t == null) return '—'; const r = Math.round(t); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
export const keyName = (k) => k == null || k < 0 ? '—' : Engine.keyName(k);
export const pct = (v) => v == null ? '—' : Math.round(v * 100);
