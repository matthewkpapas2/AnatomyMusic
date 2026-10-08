#!/usr/bin/env node
// Run the v7 profiler and drop detector on every song in the manifest (or the ids given) and compare
// tempo and key with the published values.
//
//   node tests/profile-songs.mjs [--jobs 2] [id ...]
//   node tests/profile-songs.mjs --report        re-render profiles.md from the saved profiles.json
//
// Writes tests/out/profiles.json (full results) and tests/out/profiles.md (the report table).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, Mix, ROOT, mmss, keyName } from './lib/anatomy.mjs';
import { decode } from './lib/decode.mjs';
import { allSongs, song } from './lib/songs.mjs';

const OUT = join(ROOT, 'tests/out');
const SELF = fileURLToPath(import.meta.url);

// --- one song (child process) -------------------------------------------------
async function profileOne(id) {
  const s = song(id);
  if (!s.present) return { id, missing: s.path };
  const audio = await decode(s.path);
  const t0 = Date.now();
  const { profile: P, truncated } = analyze(audio, { name: `${s.artist} - ${s.title}`, source: 'file' });
  return {
    id, file: s.file, secs: (Date.now() - t0) / 1000, dur: audio.L.length / audio.sr, truncated,
    bpm: P.bpm, home: P.home, key: keyName(P.home), camelot: P.home >= 0 ? Mix.camelot(P.home) : null, homeShare: P.homeShare,
    lufs: P.lufs, sung: P.sung, mono: P.mono,
    grid: P.grid ? { steady: P.grid.steady, driftMs: P.grid.driftMs, barConf: P.grid.barConf, flipped: P.grid.flipped } : null,
    drops: P.drops.map((d) => ({ t: d.t, kind: d.kind, impact: d.impact, conf: d.conf, buildBars: d.buildBars, built: d.built, riser: d.riser, roll: d.roll, gap: d.gap != null ? d.gap : null, vox: d.vox, phrase: d.phrase })),
    gaps: (P.gaps || []).map((g) => (typeof g === 'number' ? g : g.t)),
    sections: P.secs.map((x) => ({ t0: x.t0, name: Mix.secName(x) }))
  };
}

// --- comparisons with the published values --------------------------------------
const PCS = { C: 0, 'C♯': 1, 'D♭': 1, D: 2, 'D♯': 3, 'E♭': 3, E: 4, F: 5, 'F♯': 6, 'G♭': 6, G: 7, 'G♯': 8, 'A♭': 8, A: 9, 'A♯': 10, 'B♭': 10, B: 11 };
function parseKey(txt) {
  if (!txt) return [];
  return txt.split('/').map((p) => p.trim().match(/^([A-G][♯♭]?)\s+(major|minor)$/)).filter(Boolean).map((m) => PCS[m[1]] + (m[2] === 'minor' ? 12 : 0));
}
function keyVerdict(measured, publishedTxt) {
  const pub = parseKey(publishedTxt);
  if (measured == null || measured < 0) return 'no clear key';
  if (!pub.length) return 'not published';
  if (pub.includes(measured)) return 'match';
  const rel = pub.map((k) => Mix.keyRelation(measured, k).word);
  if (rel.includes('relative keys')) return 'relative (same notes)';
  const sameTonic = pub.some((k) => k % 12 === measured % 12);
  if (sameTonic) return 'parallel (same tonic, other mode)';
  if (rel.includes('neighbors')) return 'neighbor (one step on the wheel)';
  return 'different';
}
function bpmVerdict(measured, pub, alt) {
  if (!measured) return 'no steady beat';
  if (!pub) return 'not published';
  const cands = [pub, alt].filter(Boolean);
  for (const p of cands) for (const [r, word] of [[1, ''], [2, ' (at double time)'], [0.5, ' (at half time)'], [1.5, ' (3:2)'], [2 / 3, ' (2:3)']]) {
    const d = measured / (p * r) - 1;
    if (Math.abs(d) < 0.01) return `match${word}${p === alt ? ` (vs the ${alt} listing)` : ''}`;
  }
  return `off by ${((measured / pub - 1) * 100).toFixed(1)}%`;
}

// Drops and chorus hits are what to check by ear. Gap-only entries (the engine's silence-before-impact moments with no
// bass return, conf 0.30, impact 0) are counted separately: on house tracks they fire at most 8-bar phrase ends.
const isGapOnly = (d) => d.kind === 'gap';
const LOW_CONF = 0.6;
function report(results) {
  const rows = [], earlist = [];
  rows.push('| Song | Length | BPM measured / published | Key measured / published | LUFS | Sung | Drops and hits (mm:ss; ? = low confidence) | Gap-only |');
  rows.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = song(r.id);
    if (r.missing) { rows.push(`| ${s.artist} – ${s.title} | — | file not found | | | | | |`); continue; }
    if (r.error) { rows.push(`| ${s.artist} – ${s.title} | — | **analysis failed:** ${r.error} | | | | | |`); continue; }
    const pub = s.published || {};
    const bpm = `${r.bpm ? r.bpm.toFixed(1) : '—'} / ${pub.bpm ?? '—'}${pub.bpmAlt ? ` (or ${pub.bpmAlt})` : ''}: ${bpmVerdict(r.bpm, pub.bpm, pub.bpmAlt)}`;
    const key = `${r.key} (${r.camelot ?? '—'}) / ${pub.key ?? '—'}: ${keyVerdict(r.home, pub.key)}`;
    const real = r.drops.filter((d) => !isGapOnly(d)), gaps = r.drops.filter(isGapOnly);
    const fmt = (d) => `${mmss(d.t)} ${d.kind}${d.conf < LOW_CONF ? '?' : ''}`;
    rows.push(`| ${s.artist} – ${s.title} | ${mmss(r.dur)}${r.truncated ? ' (cut at 10:00)' : ''} | ${bpm} | ${key} | ${r.lufs != null ? r.lufs.toFixed(1) : '—'} | ${r.sung != null ? Math.round(r.sung * 100) + '%' : r.mono ? 'mono' : '—'} | ${real.length ? real.map(fmt).join(', ') : 'none'} | ${gaps.length || ''} |`);
    earlist.push(`- **${s.artist} – ${s.title}:** ${real.length ? real.map((d) => `${mmss(d.t)}${d.conf < LOW_CONF ? ' (low confidence)' : ''}`).join(', ') : 'nothing detected; note where you hear the bass come back'}`);
  }
  return `${rows.join('\n')}\n\n### Timestamps to check by ear\nDrops and chorus hits only. Write down every drop you hear, including ones missing here.\n${earlist.join('\n')}\n`;
}

// --- main -------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args[0] === '--report') {
  const md = report(JSON.parse(readFileSync(join(OUT, 'profiles.json'), 'utf8')));
  writeFileSync(join(OUT, 'profiles.md'), md); console.log(md);
} else if (args[0] === '--one') {
  profileOne(args[1]).then((r) => process.stdout.write(JSON.stringify(r)), (e) => { process.stdout.write(JSON.stringify({ id: args[1], error: e.message })); });
} else {
  const jIdx = args.indexOf('--jobs'), jobs = jIdx >= 0 ? Number(args.splice(jIdx, 2)[1]) : 2;
  const ids = args.length ? args : allSongs().map((s) => s.id);
  const results = new Array(ids.length); let next = 0;
  const runOne = () => {
    const i = next++; if (i >= ids.length) return Promise.resolve();
    return new Promise((res) => {
      const ch = spawn(process.execPath, [SELF, '--one', ids[i]], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = '';
      ch.stdout.on('data', (c) => { out += c; });
      ch.on('close', () => {
        try { results[i] = JSON.parse(out); } catch { results[i] = { id: ids[i], error: 'child crashed' }; }
        const r = results[i]; console.error(`${r.error ? 'ERR ' : r.missing ? 'MISS' : 'done'}  ${ids[i]}${r.secs ? ` (${r.secs.toFixed(0)} s)` : ''}`);
        res();
      });
    }).then(runOne);
  };
  Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, runOne)).then(() => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'profiles.json'), JSON.stringify(results, null, 1));
    const md = report(results);
    writeFileSync(join(OUT, 'profiles.md'), md);
    console.log(md);
  });
}
