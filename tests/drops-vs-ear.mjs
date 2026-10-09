#!/usr/bin/env node
// Matt's by-ear drop marks (the `ear` field in tests/songs.manifest.json) against findDrops(), per song and overall.
//
//   node tests/drops-vs-ear.mjs [--jobs 2] [id ...]    analyze the songs (cached in tests/out/drops/), then report
//   node tests/drops-vs-ear.mjs --report               re-report from the cache: instant after editing the ear marks
//   options: --tol 2   a hit is within this many beats of the ear mark (ear marks are to the nearest second, ~2 beats)
//            --near 8  beyond --tol but within this many beats: "misplaced" (counted as neither hit nor miss)
//
// `ear` is a list of "m:ss" times where a drop is heard; [] means "listened, no drop"; no field means not marked yet.
// Writes tests/out/drops-vs-ear.md and .json.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, ROOT, mmss } from './lib/anatomy.mjs';
import { decode } from './lib/decode.mjs';
import { allSongs, song } from './lib/songs.mjs';
import { barCurves, rulesAt, whyNot, mirror, RULES } from './lib/drop-rules.mjs';

const OUT = join(ROOT, 'tests/out'), CACHE = join(OUT, 'drops');
const SELF = fileURLToPath(import.meta.url);
const LOW_CONF = 0.6;   // same cut as tests/profile-songs.mjs

export const parseTime = (s) => { const m = String(s).trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/); if (!m) throw new Error(`bad ear mark "${s}" (use m:ss)`); return 60 * Number(m[1]) + Number(m[2]); };

// --- one song (child process): the drops and the bar curves ------------------------
async function oneSong(id) {
  const s = song(id);
  if (!s.present) return { id, missing: s.path };
  const audio = await decode(s.path);
  const { profile: P, truncated } = analyze(audio, { name: `${s.artist} - ${s.title}`, source: 'file' });
  if (!P.grid || !P.feat) return { id, error: 'no beat grid' };
  return {
    id, dur: audio.L.length / audio.sr, truncated, bpm: P.bpm,
    drops: P.drops.map((d) => ({ t: d.t, kind: d.kind, conf: d.conf, impact: d.impact, gap: d.gap })),
    curves: barCurves(P)
  };
}

// --- matching -------------------------------------------------------------------------
// Greedy by distance: each ear mark and each detection is used at most once.
function match(ear, det, beat, tol, near) {
  const pairs = [];
  for (let i = 0; i < ear.length; i++) for (let j = 0; j < det.length; j++) pairs.push({ i, j, d: (det[j].t - ear[i]) / beat });
  pairs.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  const ue = new Set(), ud = new Set(), hits = [], misplaced = [];
  for (const p of pairs) {
    if (ue.has(p.i) || ud.has(p.j) || Math.abs(p.d) > near) continue;
    ue.add(p.i); ud.add(p.j);
    (Math.abs(p.d) <= tol ? hits : misplaced).push({ ear: ear[p.i], det: det[p.j], beats: p.d });
  }
  return { hits, misplaced, misses: ear.filter((_, i) => !ue.has(i)), falses: det.filter((_, j) => !ud.has(j)) };
}

function songReport(r, s, tol, near) {
  const C = r.curves, beat = C.beat, ear = s.ear.map(parseTime).sort((a, b) => a - b);
  const m = mirror(C, r.drops);
  const ruleOf = (t) => { const w = m.winners.find((x) => Math.abs(C.bars[x.k] - t) < 1e-6); return w ? w.rule : 'gap'; };
  const real = r.drops.filter((d) => d.kind !== 'gap').map((d) => ({ ...d, rule: ruleOf(d.t) }));
  const gaps = r.drops.filter((d) => d.kind === 'gap');
  const M = match(ear, real, beat, tol, near);
  // ear marks no real drop caught: what each rule measured at the nearest bars, and whether a gap-only entry sits there
  const kNear = (t) => { let k = 0; for (let j = 1; j < C.bars.length; j++) if (Math.abs(C.bars[j] - t) < Math.abs(C.bars[k] - t)) k = j; return k; };
  const misses = M.misses.map((t) => {
    const k0 = kNear(t), rows = [];
    for (let k = Math.max(2, k0 - 1); k <= Math.min(C.bars.length - 5, k0 + 1); k++) rows.push(rulesAt(C, k));
    const fired = m.cands.filter((c) => Math.abs(c.k - k0) <= 1);
    // the bar that came closest: fewest failing rules' worth of shortfall, judged on the full-drop rule (the usual one)
    const best = rows.slice().sort((a, b) => (b.gate - a.gate) || (b.j4 - a.j4))[0];
    const gap = gaps.find((g) => Math.abs(g.t - t) / beat <= near);
    return { t, bar: k0 + 1, fired: fired.map((c) => ({ rule: c.rule, at: C.bars[c.k], dropped: c.dropped || null })), closest: best, why: best ? whyNot(best) : [], gapOnly: gap ? gap.t : null };
  });
  const gapOnEar = gaps.filter((g) => ear.some((t) => Math.abs(g.t - t) / beat <= tol));
  return {
    id: r.id, ear, agrees: m.agrees, beat, n: { ear: ear.length, det: real.length, gaps: gaps.length },
    hits: M.hits.map((h) => ({ ear: h.ear, t: h.det.t, beats: h.beats, rule: h.det.rule, conf: h.det.conf })),
    misplaced: M.misplaced.map((h) => ({ ear: h.ear, t: h.det.t, beats: h.beats, rule: h.det.rule, conf: h.det.conf })),
    misses, falses: M.falses.map((d) => ({ t: d.t, rule: d.rule, kind: d.kind, conf: d.conf })),
    gapOnly: { total: gaps.length, onEar: gapOnEar.length, onMissedEar: misses.filter((x) => x.gapOnly != null).length }
  };
}

const sgn = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);
const ruleName = { full: 'full drop', hit: 'hit', riser: 'riser drop', gap: 'gap-only' };

function render(reps, skipped, tol, near) {
  const L = [];
  const sum = (f) => reps.reduce((s, r) => s + f(r), 0);
  const H = sum((r) => r.hits.length), E = sum((r) => r.n.ear), D = sum((r) => r.n.det), MP = sum((r) => r.misplaced.length);
  const MS = sum((r) => r.misses.length), F = sum((r) => r.falses.length);
  const errs = reps.flatMap((r) => r.hits.map((h) => h.beats)), med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  L.push(`# Drops: ear vs. findDrops`, '');
  L.push(`Hit = a detected drop or hit within ${tol} beats of the ear mark; misplaced = ${tol}–${near} beats away (the right moment, the wrong bar or a bad grid); miss = nothing within ${near} beats; false = a detection with no ear mark within ${near} beats. Timing error = detector − ear, in beats (+ = the detector is late). Gap-only entries are matched separately.`, '');
  if (!reps.length) { L.push('**No song has ear marks yet.** Add an `ear` list to the songs in `tests/songs.manifest.json` and run `node tests/drops-vs-ear.mjs --report`.'); }
  else {
    L.push('## Overall', '');
    L.push('| Songs | Ear marks | Detected | Hits | Misplaced | Misses | False | Recall | Precision | Timing error (beats): median, worst |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    const worst = errs.length ? errs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
    L.push(`| ${reps.length} | ${E} | ${D} | ${H} | ${MP} | ${MS} | ${F} | ${E ? Math.round(100 * H / E) : '—'}% | ${D ? Math.round(100 * H / D) : '—'}% | ${errs.length ? `${sgn(med(errs))}, ${sgn(worst)}` : '—'} |`, '');
    // by rule
    L.push('### By rule', '');
    L.push('| Rule | Fired | Hits | Misplaced | False | Of the false: low confidence |', '|---|---|---|---|---|---|');
    for (const rule of ['full', 'hit', 'riser']) {
      const h = sum((r) => r.hits.filter((x) => x.rule === rule).length), mp = sum((r) => r.misplaced.filter((x) => x.rule === rule).length), f = reps.flatMap((r) => r.falses.filter((x) => x.rule === rule));
      L.push(`| ${ruleName[rule]} | ${h + mp + f.length} | ${h} | ${mp} | ${f.length} | ${f.filter((x) => x.conf < LOW_CONF).length} |`);
    }
    const G = sum((r) => r.gapOnly.total), GE = sum((r) => r.gapOnly.onEar), GM = sum((r) => r.gapOnly.onMissedEar);
    L.push('', `**Gap-only entries** (confidence 0.30, impact 0): ${G} in these songs; ${GE} sit on an ear mark; ${GM} sit near an ear mark that no real drop caught; ${G - GE} don't match any ear mark.`, '');
    // misses by blocking rule
    const blocks = {};
    for (const r of reps) for (const x of r.misses) { const key = x.fired.length ? 'fired, then dropped' : !x.closest ? 'no bars' : !x.closest.gate ? 'gate (bass after it not loud enough)' : 'thresholds (passed the gate, no rule reached its threshold)'; (blocks[key] = blocks[key] || []).push(`${r.id} ${mmss(x.t)}`); }
    if (MS) { L.push('### What blocked the misses', ''); for (const [k, v] of Object.entries(blocks)) L.push(`- **${k}:** ${v.length} (${v.join(', ')})`); L.push(''); }
    // per song
    L.push('## Per song', '');
    L.push('| Song | Ear | Detected | Hits | Misplaced | Misses | False | Gap-only (on ear / all) | Timing error (beats) |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of reps) L.push(`| ${r.id} | ${r.n.ear} | ${r.n.det} | ${r.hits.length} | ${r.misplaced.length} | ${r.misses.length} | ${r.falses.length} | ${r.gapOnly.onEar} / ${r.gapOnly.total} | ${r.hits.map((h) => sgn(h.beats)).join(', ') || '—'} |`);
    L.push('');
    for (const r of reps) {
      const lines = [];
      for (const h of r.misplaced) lines.push(`- misplaced: ear ${mmss(h.ear)}, detector ${mmss(h.t)} (${ruleName[h.rule]}, conf ${h.conf.toFixed(2)}), ${sgn(h.beats)} beats`);
      for (const x of r.misses) {
        const fired = x.fired.map((c) => `${ruleName[c.rule]} at ${mmss(c.at)} fired but was dropped: ${c.dropped}`);
        lines.push(`- **miss** ${mmss(x.t)} (bar ${x.bar})${x.gapOnly != null ? `, a gap-only entry at ${mmss(x.gapOnly)}` : ''}: ${fired.length ? fired.join('; ') : x.why.join('; ')}`);
      }
      for (const d of r.falses) lines.push(`- false: ${mmss(d.t)} ${ruleName[d.rule]} (conf ${d.conf.toFixed(2)}${d.conf < LOW_CONF ? ', low' : ''})`);
      if (lines.length) L.push(`**${r.id}**`, ...lines, '');
    }
  }
  if (skipped.length) L.push(`Not marked yet (no \`ear\` field): ${skipped.join(', ')}.`, '');
  L.push('Rules: ' + Object.values(RULES).join('; ') + '.');
  return L.join('\n') + '\n';
}

function report(tol, near) {
  const reps = [], skipped = [], broken = [];
  for (const s of allSongs()) {
    const f = join(CACHE, `${s.id}.json`), r = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    // the mirror is checked on every analyzed song, marked or not, so drift can't hide behind missing marks
    if (r && r.curves && !mirror(r.curves, r.drops).agrees) { broken.push(`${s.id}: the test mirror no longer reproduces findDrops (tests/lib/drop-rules.mjs is out of date)`); continue; }
    if (!Array.isArray(s.ear)) { skipped.push(s.id); continue; }
    if (!r) { broken.push(`${s.id}: not analyzed yet (run without --report)`); continue; }
    if (r.missing || r.error) { broken.push(`${s.id}: ${r.missing ? 'file not found' : r.error}`); continue; }
    reps.push(songReport(r, s, tol, near));
  }
  for (const b of broken) console.error('SKIP ' + b);
  const md = render(reps, skipped, tol, near);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'drops-vs-ear.md'), md);
  writeFileSync(join(OUT, 'drops-vs-ear.json'), JSON.stringify({ tol, near, songs: reps, skipped, broken }, null, 1));
  console.log(md);
  if (broken.some((b) => b.includes('mirror'))) process.exitCode = 1;
}

// --- main ---------------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args.splice(i, 2)[1]) : dflt; };
const tol = opt('--tol', 2), near = opt('--near', 8), jobs = opt('--jobs', 2);
if (args[0] === '--one') {
  oneSong(args[1]).then((r) => process.stdout.write(JSON.stringify(r)), (e) => process.stdout.write(JSON.stringify({ id: args[1], error: e.message })));
} else if (args[0] === '--report') {
  report(tol, near);
} else {
  const ids = args.length ? args : allSongs().map((s) => s.id);
  mkdirSync(CACHE, { recursive: true });
  let next = 0;
  const runOne = () => {
    const i = next++; if (i >= ids.length) return Promise.resolve();
    return new Promise((res) => {
      const ch = spawn(process.execPath, [SELF, '--one', ids[i]], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = '';
      ch.stdout.on('data', (c) => { out += c; });
      ch.on('close', () => {
        let r; try { r = JSON.parse(out); } catch { r = { id: ids[i], error: 'child crashed' }; }
        writeFileSync(join(CACHE, `${ids[i]}.json`), JSON.stringify(r));
        console.error(`${r.error ? 'ERR ' : r.missing ? 'MISS' : 'done'}  ${ids[i]}`);
        res();
      });
    }).then(runOne);
  };
  Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, runOne)).then(() => report(tol, near));
}
