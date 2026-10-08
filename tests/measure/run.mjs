#!/usr/bin/env node
// Preview measurement harness: loads two songs into the real page (headless Chromium, the page's own decoder and
// analysis), takes every idea the Mix tab suggests, renders its preview mixed and with each deck solo, and
// measures it (tests/measure/meas_page.js).
//
//   node tests/measure/run.mjs                      every test pair in the manifest, both directions
//   node tests/measure/run.mjs --one-way            test pairs, Track 1 -> Track 2 only
//   node tests/measure/run.mjs --reference          the v7 reference pairs (incl. the demo pair)
//   node tests/measure/run.mjs a-id:b-id ...        specific pairs ("demo:0" and "demo:1" are the demo songs)
//   --jobs N    pairs measured in parallel (default 1; each runs its own browser page)
//
// Needs: npm install (playwright) and `npx playwright install chromium` once.
// Writes tests/out/pairs/<a>__<b>.json and tests/out/pairs.md.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { server } from '../../server/index.mjs';
import { ROOT, mmss } from '../lib/anatomy.mjs';
import { manifest, song } from '../lib/songs.mjs';

const OUT = join(ROOT, 'tests/out/pairs');
const MEAS = readFileSync(join(ROOT, 'tests/measure/meas_page.js'), 'utf8');
const ANALYZE_TIMEOUT = 15 * 60e3;

async function loadDeck(page, i, id) {
  if (id.startsWith('demo:')) { await page.evaluate(([i, w]) => window.__mx.loadDemo(i, w), [i, Number(id.slice(5))]); return; }
  const s = song(id);
  if (!s.present) throw new Error(`missing audio for ${id}: ${s.path}`);
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`#deck-${i} button`, { hasText: /Choose a file|Replace|Try another file/ }).first().click();
  await (await chooser).setFiles(s.path);
}

async function measurePair(browser, base, a, b) {
  const page = await browser.newPage();
  // Harness-only: the Visuals page keeps a WebGL animation running behind the Mix tab, which costs about half a CPU
  // in headless Chromium. Throttle requestAnimationFrame to ~4 fps. Mix analysis (setTimeout chunks) and preview
  // rendering (OfflineAudioContext) don't use it, so measured results are unaffected; the product code is untouched.
  await page.addInitScript(() => { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 250); });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?debug`);
  await page.waitForFunction(() => !!window.__mx);
  await page.click('#tab-mix');
  await loadDeck(page, 0, a);
  await page.waitForFunction(() => window.__mx.decks[0] && window.__mx.decks[0].status !== 'loading', null, { timeout: ANALYZE_TIMEOUT, polling: 500 });
  await loadDeck(page, 1, b);
  await page.waitForFunction(() => window.__mx.decks[1] && window.__mx.decks[1].status !== 'loading', null, { timeout: ANALYZE_TIMEOUT, polling: 500 });
  const st = await page.evaluate(() => window.__mx.decks.map((d) => ({ status: d.status, error: d.error, note: d.note, sr: d.sr })));
  if (st.some((d) => d.status !== 'ready')) { await page.close(); return { a, b, error: st.map((d) => d.error).filter(Boolean).join('; ') || 'a deck failed to analyze', pageErrors: errors }; }
  await page.addScriptTag({ content: MEAS });
  const head = await page.evaluate(() => {
    const r = window.__mx.result, c = r.compat;
    const deck = (P) => ({ bpm: P.bpm, key: P.home, sung: P.sung, drops: P.drops.map((d) => ({ t: d.t, kind: d.kind })) });
    return {
      compat: Math.round(c.v * 100), word: c.word, parts: c.parts.map((p) => ({ k: p.k, v: Math.round(p.v * 100), text: p.text })),
      tempo: { ease: r.T.ease, pct: r.T.pct, r: r.T.r }, key: r.K.rel.word, shift: r.K.shift,
      counts: [1, 2, 3].map((L) => r.byLevel[L].length),
      skipped: r.skipped.map((s) => ({ level: s.level, name: s.name, check: s.check != null ? Math.round(s.check * 100) : null, why: s.why })),
      A: deck(r.A), B: deck(r.B)
    };
  });
  const ideas = [];
  for (const L of [1, 2, 3]) for (let i = 0; i < head.counts[L - 1]; i++) ideas.push(await page.evaluate(([L, i]) => window.__measureIdea(L, i), [L, i]));
  await page.close();
  return { a, b, decks: st, ...head, ideas, pageErrors: errors };
}

function summarize(r) {
  if (r.error) return { line: `| ${r.a} → ${r.b} | **failed:** ${r.error} | | | | |`, flags: [] };
  const lv = [1, 2, 3].map((L) => r.ideas.filter((x) => x.level === L));
  const avg = (xs) => xs.length ? Math.round(xs.reduce((s, x) => s + x.score, 0) / xs.length) : null;
  const mn = (xs) => xs.length ? Math.min(...xs.map((x) => x.score)) : null;
  const cell = (xs) => xs.length ? `${xs.length} · ${avg(xs)} (min ${mn(xs)})` : '0';
  const worst = r.ideas.slice().sort((x, y) => x.score - y.score).slice(0, 2).filter((x) => x.score < 90)
    .map((x) => `${x.name} [L${x.level}] ${x.score}: ${x.why.slice(0, 2).join(', ')}`).join('; ') || 'nothing under 90';
  const flags = [];
  if (lv[2].length <= 1) flags.push(`Advanced is thin (${lv[2].length} idea${lv[2].length === 1 ? '' : 's'})`);
  // 3-point tolerance: the score rule is new and uncalibrated, so a 1-2 point gap is not treated as a finding
  if (lv[2].length && lv[0].length && avg(lv[2]) <= avg(lv[0]) - 3) flags.push(`Advanced measures worse than Beginner (${avg(lv[2])} vs ${avg(lv[0])})`);
  return { line: `| ${r.a} → ${r.b} | ${r.compat} ${r.word} | ${cell(lv[0])} | ${cell(lv[1])} | ${cell(lv[2])} | ${worst}${flags.length ? ` **⚑ ${flags.join('; ')}**` : ''} |`, flags };
}

// --- main ------------------------------------------------------------------------------
const args = process.argv.slice(2);
const jIdx = args.indexOf('--jobs'), jobs = jIdx >= 0 ? Number(args.splice(jIdx, 2)[1]) : 1;
let pairs;
if (args.includes('--reference')) pairs = manifest.referencePairs.pairs.map((p) => [p.a, p.b]);
else if (args.some((x) => x.includes(':') && !x.startsWith('--'))) pairs = args.filter((x) => !x.startsWith('--')).map((x) => { const m = x.match(/^(demo:\d|[^:]+):(demo:\d|[^:]+)$/); return [m[1], m[2]]; });
else pairs = manifest.pairs.flatMap((p) => args.includes('--one-way') ? [[p.a, p.b]] : [[p.a, p.b], [p.b, p.a]]);

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
mkdirSync(OUT, { recursive: true });
let next = 0;
const worker = async () => {
  for (let i = next++; i < pairs.length; i = next++) {
    const [a, b] = pairs[i], t0 = Date.now();
    let r; try { r = await measurePair(browser, base, a, b); } catch (e) { r = { a, b, error: e.message.split('\n')[0] }; }
    writeFileSync(join(OUT, `${a.replace(':', '')}__${b.replace(':', '')}.json`), JSON.stringify(r, null, 1));
    console.error(`${r.error ? 'ERR ' : 'done'}  ${a} → ${b}  (${((Date.now() - t0) / 1000).toFixed(0)} s)${r.error ? '  ' + r.error : `  compat ${r.compat}, ideas ${r.counts.join('/')}`}`);
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, pairs.length) }, worker));
await browser.close(); server.close();

// the table covers every result file present for the pairs asked for
const rows = pairs.map(([a, b]) => join(OUT, `${a.replace(':', '')}__${b.replace(':', '')}.json`)).filter(existsSync).map((f) => summarize(JSON.parse(readFileSync(f, 'utf8'))));
const md = `| Pair (Track 1 → Track 2) | Compatibility | Beginner: ideas · avg (min) | Intermediate | Advanced | Worst measured problems |\n|---|---|---|---|---|---|\n${rows.map((x) => x.line).join('\n')}\n`;
writeFileSync(join(ROOT, 'tests/out', args.includes('--reference') ? 'reference.md' : 'pairs.md'), md);
console.log(md);
