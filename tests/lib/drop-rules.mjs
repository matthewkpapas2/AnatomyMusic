// A test-side mirror of findDrops() in web/js/mix.js: the same bar-by-bar measurements and the same three rules,
// but keeping every number and every candidate (with the reason it was dropped), so a missed drop can be explained.
// findDrops() itself only returns the winners.
//
// This duplicates the measurement part of findDrops() (tech debt #41). It guards itself: mirror() also returns
// `agrees`, which is false unless the mirror's winners are exactly the app's non-gap drops (same bars, same kinds).
// tests/drops-vs-ear.mjs refuses to report when that check fails. Remove this file once findDrops() returns its
// own bar table.

export const RULES = {
  gate: 'post-drop bass within 4.5 dB of the song\'s loudest 10% of bars',
  full: 'full drop: bass up >= 9 dB on the 4 bars before',
  hit: 'hit: bass up >= 6 dB on the bar before and >= 2 dB on the 8 bars before',
  riser: 'riser drop: highs climbed >= 8 dB, fall >= 4 dB at the drop, lows or mids up >= 1.5 dB'
};
const T = { gate: 4.5, full: 9, hitJ1: 6, hitJ8: 2, rise: 8, fall: 4, body: 1.5 };

const db = (x) => 10 * Math.log10(x + 1e-12);
const mean = (a, i, j) => { let s = 0, c = 0; for (let k = Math.max(0, i); k < Math.min(a.length, j); k++) { s += a[k]; c++; } return c ? s / c : NaN; };

// mix.js phraseAt(): 3 = section start, 2 = 8 bars in, 1 = 4 bars in, 0 = not on a phrase line
function phraseAt(P, t, starts) {
  const g = P.grid, k = Math.round((t - g.bars[0]) / g.bar);
  if (Math.abs(g.bars[0] + k * g.bar - t) > 0.15 * g.bar) return 0;
  let s0 = 0; for (const b of starts) if (b <= k) s0 = b;
  const d = k - s0; return d === 0 ? 3 : d % 8 === 0 ? 2 : d % 4 === 0 ? 1 : 0;
}

// Bar curves, exactly as findDrops computes them. Small enough to cache as JSON.
export function barCurves(P) {
  const g = P.grid, f = P.feat;
  const band = (E, t0, t1) => { const a = Math.max(0, Math.floor(t0 / f.hop)), b = Math.min(E.length, Math.ceil(t1 / f.hop)); let s = 0; for (let i = a; i < b; i++) s += E[i]; return b > a ? s / (b - a) : 0; };
  const bars = Array.from(g.bars), bar = g.bar;
  return {
    bars, bar, beat: g.beat,
    lo: bars.map((t) => db(band(f.eLo, t, t + bar))), kick: bars.map((t) => band(f.kick, t, t + bar)),
    hi: bars.map((t) => db(band(f.eHi, t, t + bar))), mid: bars.map((t) => db(band(f.eMid, t, t + bar))),
    // findDrops runs before sections snap onto drops, so the phrase positions it sees are the pre-snap ones;
    // profile() only keeps the post-snap starts. Phrase only nudges ranking (0.15 per level), and `agrees` checks it.
    ph: bars.map((t) => phraseAt(P, t, P.phrase ? P.phrase.starts : [0]))
  };
}

// Every rule's numbers at bar k (also for bars where nothing fired).
export function rulesAt(C, k) {
  const { lo, hi, mid, kick } = C, nb = lo.length;
  const srt = (a) => a.slice().sort((x, y) => x - y), loTop = srt(lo)[Math.floor(nb * 0.9)];
  const post = mean(lo, k, k + 4);
  const r = {
    k, t: C.bars[k], post, gateNeed: loTop - T.gate, gate: post >= loTop - T.gate,
    j1: post - lo[k - 1], j4: post - mean(lo, k - 4, k), j8: post - mean(lo, k - 8, k),
    kickUp: mean(kick, k, k + 4) / Math.max(1e-6, mean(kick, k - 2, k)),
    rise: hi[k - 1] - mean(hi, k - 5, k - 2), fall: hi[k - 1] - mean(hi, k, k + 2),
    body: Math.max(mean(lo, k, k + 4) - mean(lo, k - 4, k), mean(mid, k, k + 4) - mean(mid, k - 4, k))
  };
  r.full = k >= 2 && k < nb - 4 && r.gate && r.j4 >= T.full;
  r.hit = k >= 2 && k < nb - 4 && r.gate && !r.full && r.j1 >= T.hitJ1 && r.j8 >= T.hitJ8;
  r.riser = k >= 5 && k < nb - 4 && r.gate && r.rise >= T.rise && r.fall >= T.fall && r.body >= T.body;
  return r;
}

// What blocks bar k, in words, rule by rule (for a missed drop).
export function whyNot(r) {
  const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  const out = [];
  if (!r.gate) out.push(`gate: bass after it is ${(r.gateNeed - r.post).toFixed(1)} dB short of the song's top bars`);
  if (r.j4 < T.full) out.push(`full: bass up ${f(r.j4)} dB over 4 bars (needs 9)`);
  if (!(r.j1 >= T.hitJ1 && r.j8 >= T.hitJ8)) out.push(`hit: ${f(r.j1)} dB over 1 bar (needs 6), ${f(r.j8)} over 8 (needs 2)`);
  if (!(r.rise >= T.rise && r.fall >= T.fall && r.body >= T.body)) out.push(`riser: highs climbed ${f(r.rise)} (needs 8), fell ${f(r.fall)} (needs 4), body ${f(r.body)} (needs 1.5)`);
  return out;
}

// The whole of findDrops' selection, keeping the losers. Returns { winners, cands, agrees }.
export function mirror(C, appDrops) {
  const nb = C.lo.length, cand = [];
  if (nb < 12) return { winners: [], cands: [], agrees: !appDrops.some((d) => d.kind !== 'gap') };
  for (let k = 2; k < nb - 4; k++) {
    const r = rulesAt(C, k);
    if (!r.full && !r.hit) continue;
    cand.push({ k, rule: r.full ? 'full' : 'hit', s: (r.full ? 1 : 0.6) * (Math.min(r.j4, 24) / 12 + Math.min(r.j1, 18) / 18) + 0.15 * C.ph[k] + 0.2 * Math.min(2, Math.log2(Math.max(1, r.kickUp))) });
  }
  for (let k = 5; k < nb - 4; k++) {
    const r = rulesAt(C, k);
    if (r.riser) cand.push({ k, rule: 'riser', s: 1.2 + Math.min(r.rise, 20) / 20 + 0.15 * C.ph[k] });
  }
  for (const c of cand) if (c.rule !== 'riser' && cand.some((r) => r.rule === 'riser' && r.k > c.k && r.k - c.k <= 8)) c.dropped = 'starts a riser build (a riser drop follows within 8 bars)';
  const live = cand.filter((c) => !c.dropped).sort((a, b) => b.s - a.s), winners = [];
  for (const c of live) {
    const w = winners.find((o) => Math.abs(o.k - c.k) < 8);
    if (w) { c.dropped = `a stronger drop ${w.k - c.k > 0 ? w.k - c.k + ' bars later' : c.k - w.k + ' bars earlier'} (one drop per 8 bars)`; continue; }
    winners.push(c);
  }
  winners.sort((a, b) => a.k - b.k);
  const real = appDrops.filter((d) => d.kind !== 'gap').sort((a, b) => a.t - b.t);
  const agrees = real.length === winners.length && real.every((d, i) => Math.abs(d.t - C.bars[winners[i].k]) < 1e-6 && d.kind === (winners[i].rule === 'hit' ? 'hit' : 'drop'));
  return { winners, cands: cand, agrees };
}
