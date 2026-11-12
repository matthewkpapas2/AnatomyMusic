#!/usr/bin/env node
// Continuous listening (web/js/app.js handoff()): the real microphone path in headless Chromium, fed a looping
// WAV of the two demo songs through Chromium's fake capture device, kept running past several handoffs.
//
//   node tests/live-handoff.mjs            real constants (10-minute sessions): about 21 minutes, 2+ handoffs
//   node tests/live-handoff.mjs --fast     100-second sessions (the constants are rewritten as the page loads
//                                          app.js; nothing in web/ changes): about 6 minutes, 3+ handoffs
//   --seconds N                            run length
//
// Passes when: no page error; still listening at the end; the listening clock matches the wall clock; every
// handoff leaves the beat locked at the same tempo and keeps the picture's particles; the JS heap is level from
// one session to the next; onset shards keep firing; and stopping reports how much the Analysis covers.
// Needs Playwright Chromium (see docs/testing.md). Writes tests/out/live-handoff.json.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { server } from '../server/index.mjs';
import { ROOT, Demo } from './lib/anatomy.mjs';

const args = process.argv.slice(2), fast = args.includes('--fast');
const num = (flag, d) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : d; };
const SECONDS = num('--seconds', fast ? 330 : 1230), WANT = fast ? 3 : 2;
const OUT = join(ROOT, 'tests', 'out'); mkdirSync(OUT, { recursive: true });

// the two demo songs back to back, 16-bit stereo; Chromium loops the file
const SR = 48000, songs = ['a', 'b'].map((id) => Demo.render(SR, id));
const n = songs.reduce((s, x) => s + x.L.length, 0), wav = Buffer.alloc(44 + n * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(n * 4, 40);
let o = 44; const s16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
for (const x of songs) for (let i = 0; i < x.L.length; i++) { wav.writeInt16LE(s16(x.L[i]), o); wav.writeInt16LE(s16(x.R[i]), o + 2); o += 4; }
const wavPath = join(OUT, 'live-handoff-input.wav'); writeFileSync(wavPath, wav);

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}`, '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
if (fast) await page.route('**/js/app.js', async (route) => {
  const res = await route.fetch(); let body = await res.text();
  const swap = (a, b) => { if (!body.includes(a)) throw new Error(`live-handoff --fast: "${a}" is no longer in app.js`); body = body.replace(a, b); };
  swap('const MAX_SEC = 600;', 'const MAX_SEC = 100;'); swap('const WARM_LEAD = 150, WARM_MIN = 60;', 'const WARM_LEAD = 50, WARM_MIN = 20;');
  await route.fulfill({ response: res, body });
});
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.__live && window.__vz);
// a per-frame watcher: what the picture held on the last frame before and the first frame after each handoff.
// Headless Chromium draws Visuals in software at a few frames a second, so particles fade a lot between two frames;
// a picture that was wiped instead (what a new session does) comes back with almost none (measured: 1-2, docs/testing.md).
await page.evaluate(() => {
  const w = window.__watch = { seams: [], prev: null, frames: 0 };
  const tick = () => {
    const L = window.__live(), C = window.__vz.count(); w.frames++;
    const now = { handoffs: L.handoffs, parts: C.parts, rings: C.rings, locked: L.locked, bpm: L.bpm, t: L.t, total: L.total, wall: performance.now() / 1000 };
    if (w.prev && now.handoffs > w.prev.handoffs) w.seams.push({ before: w.prev, after: now });
    w.prev = now; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.click('#vz-mic');
await page.waitForFunction(() => window.__live().mode === 'listening', null, { timeout: 15000 });
const t0 = Date.now(), samples = [];
while ((Date.now() - t0) / 1000 < SECONDS) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => ({ ...window.__live(), heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, frames: window.__watch.frames, hits: window.__vz.S.hits.length }));
  s.wall = (Date.now() - t0) / 1000; samples.push(s);
  if (samples.length % 6 === 0) console.log(`  ${s.wall.toFixed(0)} s: listened ${s.total.toFixed(0)} s, session ${s.t.toFixed(0)} s, handoffs ${s.handoffs}, ${s.locked ? `locked ${s.bpm.toFixed(1)}` : 'no beat lock'}, heap ${s.heapMB?.toFixed(0)} MB`);
}
const seams = await page.evaluate(() => window.__watch.seams);
const last = samples[samples.length - 1];
await page.click('#tab-analysis'); await page.click('#stop');
await page.waitForFunction(() => window.__live().mode === 'stopped');
const status = await page.textContent('#status-text');
await browser.close(); server.close();

// --- checks -------------------------------------------------------------
const checks = []; const ok = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}: ${detail}`); };
ok('no page errors', errors.length === 0, errors.length ? errors.join(' | ') : '0');
ok('still listening at the end', last.mode === 'listening', last.mode);
ok(`handoffs (need ${WANT}+)`, last.handoffs >= WANT, String(last.handoffs));
ok('listening clock follows the wall clock', Math.abs(last.total - last.wall) < 8, `${last.total.toFixed(1)} s listened in ${last.wall.toFixed(1)} s`);
ok('the session never outgrows the cap', samples.every((s) => s.t <= (fast ? 100 : 600) + 1), `longest ${Math.max(...samples.map((s) => s.t)).toFixed(0)} s`);
for (const [i, s] of seams.entries()) {
  ok(`handoff ${i + 1}: beat stays locked`, s.before.locked && s.after.locked && Math.abs(s.before.bpm - s.after.bpm) < 1, `${s.before.bpm.toFixed(1)} → ${s.after.bpm.toFixed(1)} BPM, session clock ${s.before.t.toFixed(0)} → ${s.after.t.toFixed(0)} s`);
  ok(`handoff ${i + 1}: the picture is kept`, s.before.parts < 40 || s.after.parts >= 0.25 * s.before.parts, `${s.before.parts} particles on the frame before, ${s.after.parts} on the frame after`);
  const dClock = s.after.total - s.before.total, dWall = s.after.wall - s.before.wall;
  ok(`handoff ${i + 1}: the listening clock doesn't jump`, Math.abs(dClock - dWall) < 0.25, `${s.before.total.toFixed(2)} → ${s.after.total.toFixed(2)} s over ${dWall.toFixed(2)} s between the two frames`);
}
const firstCycle = samples.filter((s) => s.handoffs === 1), lastCycle = samples.filter((s) => s.handoffs === last.handoffs);
const peak = (a) => Math.max(...a.map((s) => s.heapMB || 0));
if (firstCycle.length && lastCycle.length && last.handoffs > 1) ok('memory is level across sessions', peak(lastCycle) < peak(firstCycle) * 1.25 + 20, `peak heap ${peak(firstCycle).toFixed(0)} MB after handoff 1, ${peak(lastCycle).toFixed(0)} MB after handoff ${last.handoffs}`);
const after = samples.filter((s) => s.handoffs > 0), withHits = after.filter((s) => s.hits > 0).length;
ok('onset shards keep firing after a handoff', after.length > 0 && withHits >= after.length / 2, `${withHits} of ${after.length} samples after a handoff saw hits in the last 2.5 s`);
ok('stopping says what the Analysis covers', /of listening\. Analysis and replay cover the last/.test(status), status);
writeFileSync(join(OUT, 'live-handoff.json'), JSON.stringify({ fast, seconds: SECONDS, errors, checks, seams, samples, status }, null, 1));
const failed = checks.filter((c) => !c.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall live-handoff checks passed');
process.exit(failed ? 1 : 0);
