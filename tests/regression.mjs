#!/usr/bin/env node
// Engine + mixer regression on the two synthesized demo songs (known answers, no audio files needed).
// Run before and after any change to web/js/engine.js, demo.js or mix.js:  node tests/regression.mjs
// Expected values are the v7 baseline (docs/status.md, "Verified state").
import { analyze, demoAudio, Demo, Mix } from './lib/anatomy.mjs';

let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const A = analyze(demoAudio('a'), { name: 'Demo 1' }).profile;
const B = analyze(demoAudio('b'), { name: 'Demo 2' }).profile;

for (const [P, T, nm] of [[A, Demo.TRUTH, 'Demo 1'], [B, Demo.TRUTH_B, 'Demo 2']]) {
  const beat = 60 / T.bpm;
  const err = P.grid.beats.map((b) => Math.abs(b - Math.round(b / beat) * beat) * 1000);
  const meanErr = err.reduce((s, x) => s + x, 0) / err.length;
  check(near(P.bpm, T.bpm, 0.05), `${nm}: tempo ${P.bpm.toFixed(2)} BPM (truth ${T.bpm})`);
  check(meanErr < 1, `${nm}: beat grid mean error ${meanErr.toFixed(3)} ms (< 1 ms)`);
  const secOk = P.secs.length === T.sections.length && P.secs.every((s, i) => near(s.t0, T.sections[i].t0, 0.05));
  check(secOk, `${nm}: ${P.secs.length} sections on the known boundaries`);
  for (const d of T.drops) check(P.drops.some((x) => near(x.t, d, 0.05)), `${nm}: drop found at ${d.toFixed(2)} s`);
}

const m = Mix.match(A, B);
check(m.T.ease === 'ok', `demo pair: tempo ease "${m.T.ease}" (expect ok)`);
check(m.K.rel.word === 'neighbors', `demo pair: key relation "${m.K.rel.word}" (expect neighbors)`);
check(near(A.sung, 0.02, 0.01) && near(B.sung, 0.41, 0.02), `demo pair: sung ${A.sung.toFixed(2)} / ${B.sung.toFixed(2)} (expect 0.02 / 0.41)`);
const counts = [1, 2, 3].map((l) => m.byLevel[l].length);
check(counts.join('/') === '8/8/4', `demo pair: ideas per level ${counts.join(' / ')} (expect 8 / 8 / 4)`);
check(m.ideas.every((x) => x.check.rows.length === 6), 'demo pair: every idea has 6 sound-check rows');
check(Math.round(m.compat.v * 100) === 93, `demo pair: compatibility ${Math.round(m.compat.v * 100)} (expect 93)`);

console.log(fails ? `\n${fails} check(s) failed` : '\nall regression checks passed');
process.exit(fails ? 1 : 0);
