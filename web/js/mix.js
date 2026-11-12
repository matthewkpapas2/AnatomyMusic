/* ============================================================
   ANATOMY MIX — transition ideas for two analyzed songs.
   Pure JS, no DOM (runs in Node). It reads what the engine
   measured, rebuilds a steady beat/bar grid, profiles each
   section, then searches for places and ways the two songs
   could meet. It suggests; it never mixes on its own.
   Track 1 ("A" in code) plays out, Track 2 ("B") comes in.
   ============================================================ */
const AnatomyMix = (() => {
  'use strict';
  const EN = typeof AnatomyEngine !== 'undefined' ? AnatomyEngine : require('./engine.js');
  const { PC, keyName, chordName, family, fmtTime, BLOCK, KK_MAJ, KK_MIN } = EN;
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const mod = (a, n) => ((a % n) + n) % n;
  const dbAvg = (arr) => { let p = 0, n = 0; for (const v of arr) if (v > -99) { p += Math.pow(10, v / 10); n++; } return n ? 10 * Math.log10(p / n) : -100; };
  function median(a) { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; }
  function pearson(a, b) {
    const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
    return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
  }
  function keyCorr(ch) {
    const out = new Float64Array(24), rot = new Float64Array(12);
    for (let t = 0; t < 12; t++) { for (let i = 0; i < 12; i++) rot[i] = ch[(i + t) % 12]; out[t] = pearson(rot, KK_MAJ); out[t + 12] = pearson(rot, KK_MIN); }
    return out;
  }

  /* ---------------- music-theory helpers ---------------- */
  const MAJ_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const scaleOf = (k) => { const t = family(k); return MAJ_STEPS.map(s => (t + s) % 12); };
  const sharedNotes = (k1, k2) => { if (k1 < 0 || k2 < 0) return 0; const a = scaleOf(k1), b = new Set(scaleOf(k2)); return a.filter(p => b.has(p)).length; };
  const transposeKey = (k, s) => k < 0 ? -1 : k < 12 ? mod(k + s, 12) : 12 + mod(k - 12 + s, 12);
  const transposeChord = transposeKey;
  const camelot = (k) => { if (k < 0) return '—'; const maj = k < 12 ? k : (k - 12 + 3) % 12; return `${mod(maj * 7, 12) === 0 ? 8 : mod(mod(maj * 7, 12) + 7, 12) + 1}${k < 12 ? 'B' : 'A'}`; };
  const camelotNum = (k) => parseInt(camelot(k), 10);
  const chordNotes = (c) => c < 0 ? [] : [c % 12, (c % 12 + (c < 12 ? 4 : 3)) % 12, (c % 12 + 7) % 12];
  const chordShare = (c1, c2) => { const b = new Set(chordNotes(c2)); return chordNotes(c1).filter(p => b.has(p)).length; };
  const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  const roman = (c, k) => { if (c < 0 || k < 0) return '?'; const r = ROMAN[mod(c % 12 - k % 12, 12)]; return c >= 12 ? r.toLowerCase() : r; };
  // triads that belong to a key (plus the major V that minor keys borrow from harmonic minor)
  function diatonic(k) {
    const t = family(k), out = [t, (t + 5) % 12, (t + 7) % 12, 12 + (t + 2) % 12, 12 + (t + 4) % 12, 12 + (t + 9) % 12];
    if (k >= 12) out.push((k - 12 + 7) % 12);
    return out;
  }
  const semis = (s) => `${s > 0 ? '+' : s < 0 ? '−' : '±'}${Math.abs(s)} semitone${Math.abs(s) === 1 ? '' : 's'}`;
  const pctTxt = (p) => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1)}%`;
  function keyRelation(ka, kb) {
    if (ka < 0 || kb < 0) return { word: 'unknown', text: 'No clear key in one of the tracks.', shared: 0, good: 0.5 };
    const sh = sharedNotes(ka, kb), ca = camelotNum(ka), cb = camelotNum(kb), la = ka < 12 ? 'B' : 'A', lb = kb < 12 ? 'B' : 'A';
    const d = mod(cb - ca, 12), dd = d > 6 ? d - 12 : d;
    let word, text;
    if (ka === kb) { word = 'same key'; text = 'Same key: every note agrees.'; }
    else if (family(ka) === family(kb)) { word = 'relative keys'; text = 'Relative keys: the same seven notes with a different home note.'; }
    else if (Math.abs(dd) === 1) { word = la === lb ? 'neighbors' : 'diagonal neighbors'; text = `Neighbors on the Camelot wheel: they share ${sh} of 7 notes.`; }
    else if (dd === 2 && la === lb) { word = 'a whole step up'; text = `Two steps round the wheel: Track 2 sits a whole step higher (${sh} of 7 notes shared). Mixed well it feels like a lift.`; }
    else if (dd === -2 && la === lb) { word = 'a whole step down'; text = `Two steps round the wheel: Track 2 sits a whole step lower (${sh} of 7 notes shared).`; }
    else if (dd === -5 && la === lb) { word = 'a half step up'; text = `Track 2 sits a half step higher. The notes clash (${sh} of 7 shared) but a hard cut can feel like a key-change lift.`; }
    else { word = 'distant keys'; text = `Distant keys: only ${sh} of 7 notes in common, so long overlaps will clash.`; }
    const good = sh >= 7 ? 1 : sh === 6 ? 0.85 : sh === 5 ? 0.5 : sh === 4 ? 0.25 : 0.1;
    return { word, text, shared: sh, good, steps: dd };
  }

  /* ---------------- beat & bar grid ---------------- */
  // The engine's beats follow the music as it plays; a mix needs one steady grid over the whole song,
  // precise enough not to drift over minutes, plus which beat starts each bar.
  // the engine reports chord changes about 0.3 s late (its chord chroma is smoothed over 0.3 s); measured on both demo songs
  const CHORD_LAG = 0.3;
  // v6: the grid is fitted to onsets measured from the audio itself (audioFeatures), so the kick decides where
  // the beat is. v5 used the engine's full-band onsets, which put a house track's grid on its off-beats.
  function fitGrid(feat, bpm0, dur) {
    const { hop, F, kick, snare } = feat, A = new Float32Array(F);
    // full-band onsets minus a 1 s moving average, so steady noise doesn't count as beats
    { const w = Math.round(0.5 / hop); let s = 0, c = 0;
      for (let f = 0; f < Math.min(F, w); f++) { s += feat.all[f]; c++; }
      for (let f = 0; f < F; f++) { const add = f + w; if (add < F) { s += feat.all[add]; c++; } const rem = f - w - 1; if (rem >= 0) { s -= feat.all[rem]; c--; } A[f] = Math.max(0, feat.all[f] - s / c); } }
    const oi = (X, x) => { const i = Math.floor(x); if (i < 0 || i >= F - 1) return 0; const u = x - i; return X[i] * (1 - u) + X[i + 1] * u; };
    const comb = (X, P, phi) => { let s = 0, c = 0; for (let x = phi; x < F - 1; x += P) { s += oi(X, x); c++; } return c ? s / c : 0; };
    const bestPhase = (X, P, step, lo, hi) => { let bp = lo, bs = -1; for (let phi = lo; phi < hi; phi += step) { const s = comb(X, P, phi); if (s > bs) { bs = s; bp = phi; } } return { phi: bp, s: bs }; };
    let best = { bpm: bpm0, phi: 0, s: -1 };
    for (let b = bpm0 * 0.985; b <= bpm0 * 1.015; b += 0.02) { const P = 60 / b / hop, r = bestPhase(A, P, 1, 0, P); if (r.s > best.s) best = { bpm: b, phi: r.phi, s: r.s }; }
    for (let b = best.bpm - 0.03; b <= best.bpm + 0.03; b += 0.002) { const P = 60 / b / hop, r = bestPhase(A, P, 0.2, best.phi - 2, best.phi + 2); if (r.s > best.s) best = { bpm: b, phi: r.phi, s: r.s }; }
    let P = 60 / best.bpm / hop, phi = mod(best.phi, P);
    // half-beat check: off-beat hats, claps and bass lines are strong in dance music; the kick is on the beat
    // (the full-band comb already favours the beat; flip only if kick AND snare/clap both say it landed on off-beats)
    const kOn = comb(kick, P, phi), kOff = comb(kick, P, phi + P / 2), sOn = comb(snare, P, phi), sOff = comb(snare, P, phi + P / 2);
    const flipped = kOff > kOn * 1.3 && sOff > sOn;
    if (flipped) phi = bestPhase(A, P, 0.2, phi + P / 2 - 2, phi + P / 2 + 2).phi;
    // final phase: kick and full-band together, to a fraction of a hop
    { const K2 = new Float32Array(F); for (let f = 0; f < F; f++) K2[f] = A[f] + kick[f]; phi = mod(bestPhase(K2, P, 0.1, phi - 1.5, phi + 1.5).phi, P); }
    // a hop's onset sits at its center; the band filters and the onset measure add ~3 ms (measured on both demo songs)
    const beatSec = 60 / best.bpm, t0 = (phi + 0.5) * hop - 0.003;
    // how steady: the best local phase in each quarter of the song against the global grid
    let drift = 0;
    for (let q = 0; q < 4; q++) {
      const a = Math.floor(F * q / 4), b = Math.floor(F * (q + 1) / 4); let bs = -1, bd = 0;
      for (let d = -0.2 * P; d <= 0.2 * P; d += 0.25) { let s = 0; const k0 = Math.ceil((a - phi - d) / P); for (let x = phi + d + k0 * P; x < b; x += P) s += oi(A, x); if (s > bs) { bs = s; bd = d; } }
      drift = Math.max(drift, Math.abs(bd * hop) * 1000);
    }
    const beats = []; { let t = mod(t0, beatSec); for (; t < dur; t += beatSec) beats.push(t); }
    // which beat starts a bar. Three cues vote, each judged against the other beat positions in the bar:
    //  harmony: chords change most on beat 1; accent: kick on 1 and 3, snare/clap on 2 and 4 (only tells 1/3 from 2/4)
    const nb = beats.length, H = [0, 0, 0, 0], Hn = [0, 0, 0, 0], K = [0, 0, 0, 0], S = [0, 0, 0, 0];
    let prev = null;
    for (let k = 0; k < nb; k++) {
      const t = beats[k], c = chromaIn(feat, t, t + beatSec);
      let tot = 0; for (let p = 0; p < 12; p++) tot += c[p];
      if (prev && tot > 0) { H[k % 4] += 1 - cosSim(prev, c); Hn[k % 4]++; }
      prev = tot > 0 ? c : null;
      K[k % 4] += envAt(kick, hop, t); S[k % 4] += envAt(snare, hop, t);
    }
    for (let m = 0; m < 4; m++) H[m] = Hn[m] ? H[m] / Hn[m] : 0;
    const norm = (v) => { const mx = Math.max(...v), mn = Math.min(...v); return v.map(x => mx > mn ? (x - mn) / (mx - mn) : 0); };
    const Hs = norm(H), Kp = norm([0, 1, 2, 3].map(m => K[m] + K[(m + 2) % 4] - K[(m + 1) % 4] - K[(m + 3) % 4])), Sp = norm([0, 1, 2, 3].map(m => S[(m + 1) % 4] + S[(m + 3) % 4] - S[m] - S[(m + 2) % 4]));
    const hSpread = Math.max(...H) - Math.min(...H), hMean = H.reduce((x, y) => x + y, 0) / 4;
    const wH = clamp(hSpread / Math.max(1e-6, hMean) / 0.5, 0.2, 1);   // trust harmony when its pattern is clear
    const tot = [0, 1, 2, 3].map(m => wH * Hs[m] + 0.5 * (Kp[m] + Sp[m]) * 0.8);
    let m0 = 0; for (let m = 1; m < 4; m++) if (tot[m] > tot[m0]) m0 = m;
    const sorted = [...tot].sort((x, y) => y - x);
    const barConf = sorted[0] > 0 ? clamp((sorted[0] - sorted[1]) / sorted[0] * 2) : 0;
    const bars = []; for (let k = m0; k < nb; k += 4) bars.push(beats[k]);
    return { bpm: best.bpm, beat: beatSec, bar: 4 * beatSec, beats, bars, driftMs: drift, steady: drift < 35, barConf, fit: best.s, flipped, votes: { H: Hs, K: Kp, S: Sp } };
  }

  /* ---------------- profile: everything the mixer needs from one analyzed song ---------------- */
  function profile(e, meta = {}) {
    const sum = e.summary(), labels = e.displayLabels(), fr = e.fr, nB = e.nB, lag = e.N1 / 2 / e.sr;
    const dur = sum.dur;
    // per-block features (0.5 s)
    const chroma = e.bChroma.slice(0, nB * 12), timb = e.bTimb.slice(0, nB * 7), level = Float32Array.from(e.bLevel.subarray(0, nB)), silent = e.bSilent.slice(0, nB);
    const bands = new Float32Array(nB * 6).fill(-100), lock = new Float32Array(nB), bpw = new Float64Array(nB * 6), cnt = new Uint16Array(nB);
    for (let f = 0; f < e.nF; f++) {
      const b = Math.min(nB - 1, Math.floor((f / fr) / BLOCK)); if (b < 0) continue;
      cnt[b]++; if (e.confF[f] > 0) lock[b]++;
      if (e.activeF[f]) for (let k = 0; k < 6; k++) bpw[b * 6 + k] += Math.pow(10, e.bands[f * 6 + k] / 10);
    }
    for (let b = 0; b < nB; b++) { if (cnt[b]) lock[b] /= cnt[b]; if (!silent[b]) for (let k = 0; k < 6; k++) bands[b * 6 + k] = 10 * Math.log10(bpw[b * 6 + k] / Math.max(1, cnt[b]) + 1e-12); }
    const act = []; for (let b = 0; b < nB; b++) if (!silent[b]) act.push(b);
    const medLevel = median(act.map(b => level[b]));
    const loud = dbAvg(act.map(b => level[b]));
    const bandMean = [0, 1, 2, 3, 4, 5].map(k => dbAvg(act.map(b => bands[b * 6 + k])));
    // rhythm, beat-level harmony and loudness from the audio itself; likely vocals too (v6: the grid needs the audio)
    const feat = meta.audio ? audioFeatures(meta.audio.L, meta.audio.R, meta.audio.sr) : null;
    const grid = sum.bpm && feat ? fitGrid(feat, sum.bpm, dur) : null;
    let vocal = null, mono = false, vocF = null;
    if (meta.audio) { const V = vocalMap(meta.audio.L, meta.audio.R, meta.audio.sr, nB); vocal = V.v; mono = V.mono; vocF = { v: V.fine, hop: V.fineHop }; }
    // home key: the key the engine displayed for the longest time
    const tally = new Float64Array(24), kt = e.keyTimeline;
    for (let i = 0; i < kt.length; i++) tally[kt[i].key] += (i + 1 < kt.length ? kt[i + 1].t : dur) - kt[i].t;
    let home = -1; for (let k = 0; k < 24; k++) if (tally[k] > 0 && (home < 0 || tally[k] > tally[home])) home = k;
    const homeShare = home >= 0 ? tally[home] / Math.max(1e-9, tally.reduce((x, y) => x + y, 0)) : 0;
    // sections: boundaries first (moved onto phrase lines when the grid allows), then each one's measurements
    const secs = sum.segments.map((s, i) => ({ i, t0: s.t0, t1: s.t1, rawT0: s.t0, snapped: false, letter: labels[s.label] || '?', shift: s.shift || 0, role: null }));
    for (let i = 0; i < secs.length; i++) secs[i].t1 = i + 1 < secs.length ? secs[i + 1].t0 : dur;
    const P = { dur, nB, grid, feat, secs, silent, timb, level, bands, vocal };
    refineSections(P);
    for (const s of secs) {
      const b0 = clamp(Math.round(s.t0 / BLOCK), 0, nB - 1), b1 = clamp(Math.round(s.t1 / BLOCK), b0 + 1, nB), ch = new Float64Array(12); let lk = 0, n = 0, vs = 0;
      const lv = [], bd = [[], [], [], [], [], []];
      for (let b = b0; b < b1; b++) { lk += lock[b]; n++; if (vocal) vs += vocal[b]; if (silent[b]) continue; lv.push(level[b]); for (let k = 0; k < 12; k++) ch[k] += chroma[b * 12 + k]; for (let k = 0; k < 6; k++) bd[k].push(bands[b * 6 + k]); }
      const kc = keyCorr(ch); let lk2 = 0; for (let k = 1; k < 24; k++) if (kc[k] > kc[lk2]) lk2 = k;
      const secBands = bd.map(dbAvg);
      Object.assign(s, {
        level: dbAvg(lv), bands: secBands, chroma: Array.from(ch), key: lk2, keyR: kc[lk2], lock: n ? lk / n : 0,
        low: Math.max(secBands[0], secBands[1]) - Math.max(bandMean[0], bandMean[1]),
        mids: dbAvg([secBands[3], secBands[4]]) - dbAvg([bandMean[3], bandMean[4]]),
        vocal: vocal ? vs / Math.max(1, b1 - b0) : null
      });
    }
    // roles, from measurements only
    const lvls = secs.map(s => s.level).sort((a, b) => a - b), p75 = lvls[Math.floor(lvls.length * 0.75)] || 0;
    const chorusLetter = sum.chorus ? labels[sum.chorus] : null;
    secs.forEach((s, i) => {
      const len = s.t1 - s.t0;
      if (i === 0 && (s.level < medLevel - 1.5 || s.lock < 0.5 || s.low < -4) && secs.length > 1) s.role = 'intro';
      else if (i === secs.length - 1 && secs.length > 2 && (s.level < medLevel - 1.5 || s.low < -4)) s.role = 'outro';
      else if (chorusLetter && s.letter === chorusLetter) s.role = 'chorus';
      else if (i > 0 && i < secs.length - 1 && (s.lock < 0.35 || (s.low < -6 && s.level < medLevel - 2)) && len > 6) s.role = 'breakdown';
      else if (s.level >= p75 && secs.length > 2) s.role = 'peak';
    });
    // sections that are mostly a detected build-up
    for (const s of secs) if (!s.role || s.role === 'peak') for (const m of e.moments) if (m.type === 'build') { const o = Math.min(s.t1, (m.t1 || m.t) + lag) - Math.max(s.t0, m.t + lag); if (o > 0.5 * (s.t1 - s.t0)) s.role = 'build'; }
    // moments worth mixing around
    const builds = e.moments.filter(m => m.type === 'build').map(m => ({ t0: m.t + lag, t1: (m.t1 || m.t + 5) + lag }));
    const drops = e.moments.filter(m => m.type === 'drop').map(m => ({ t: m.t + lag, gap: m.gap || 0, built: m.title === 'The drop' }));
    const chords = e.chordSegs.map(c => ({ t0: Math.max(0, c.t0 + lag - CHORD_LAG), t1: c.t1 + lag - CHORD_LAG, chord: c.chord }));
    const firstSound = act.length ? act[0] * BLOCK : 0;
    const out = {
      name: meta.name || 'Untitled', source: meta.source || 'file', dur, sr: e.sr,
      bpm: grid ? grid.bpm : null, grid, lockedFrac: sum.lockedFrac, looseness: sum.looseness,
      home, homeShare, keys: sum.keys.map(k => ({ t: k.t, key: k.key })),
      loud, medLevel, bandMean, secs, builds, drops, chords, firstSound,
      nB, chroma, timb, level, silent, bands, lock, vocal, mono, vocF, feat, lufs: feat ? feat.lufs : null, phrase: P.phrase || null,
      sung: vocal ? Array.from(vocal).filter(v => v > 0.4).length / Math.max(1, nB) : null
    };
    // v7: drops come from the audio, bar by bar; the engine's silence-before-impact moments are kept as "gaps" and
    // attached to the drop they precede (the silence switch uses them)
    out.gaps = drops;
    if (grid && feat) {
      out.drops = findDrops(out);
      for (const gp of drops) { const d = out.drops.find(x => Math.abs(x.t - gp.t) < 0.6 * grid.bar); if (d) d.gap = gp.gap; else if (gp.gap >= 0.12) out.drops.push({ t: snap(out, gp.t), kind: 'gap', impact: 0, j1: 0, j4: 0, build0: snap(out, gp.t) - grid.bar, buildBars: 1, built: gp.built, sustainBars: 0, phrase: phraseAt(out, snap(out, gp.t)), vox: 0, conf: 0.3, gap: gp.gap }); }
      out.drops.sort((a, b) => a.t - b.t);
      // a confident drop is the strongest phrase line there is: a section boundary within 2 bars moves onto it
      // (pop choruses hit a bar or two after where the slower section analysis puts them)
      let moved = false;
      for (const d of out.drops) {
        if (d.kind === 'gap' || d.conf < 0.35) continue;
        const s = out.secs.find((x, i) => i > 0 && Math.abs(x.t0 - d.t) <= 2.2 * grid.bar && Math.abs(x.t0 - d.t) > 0.05);
        if (s && !out.secs.some(x => Math.abs(x.t0 - d.t) < 0.05)) { s.t0 = d.t; s.bar = d.k; s.snapped = true; moved = true; }
      }
      if (moved) {
        out.secs.sort((a, b) => a.t0 - b.t0);
        out.secs.forEach((x, i) => { x.i = i; x.t1 = i + 1 < out.secs.length ? out.secs[i + 1].t0 : out.dur; });
        out.phrase.starts = out.secs.map(x => x.bar || 0);
        for (const d of out.drops) d.phrase = phraseAt(out, d.t);
      }
    }
    return out;
  }
  /* ---------------- phrases (v6) ----------------
     DJs change songs on phrase lines: every 4, 8 or 16 bars. The engine finds sections from 0.5 s blocks, so its
     boundaries can be a bar or two off, and v5 only snapped them to the nearest bar. Here each bar gets a
     "how much changes at this bar line" score from bar-by-bar harmony, tone, loudness, drums and vocals, and each
     section start moves to the strongest nearby bar line, preferring the song's own 4-bar phrase positions. */
  function barNovelty(P) {
    const g = P.grid, feat = P.feat, bars = g.bars, nb = bars.length, bar = g.bar;
    const blk = (t0, t1, fn) => { const [a, b] = range(P, t0, t1); let s = 0, c = 0; for (let i = a; i < b; i++) { if (P.silent[i]) continue; s += fn(i); c++; } return c ? s / c : 0; };
    const F = [];
    for (let k = 0; k < nb; k++) {
      const t0 = bars[k], t1 = t0 + bar;
      const tim = []; for (let j = 0; j < 7; j++) tim.push(blk(t0, t1, i => P.timb[i * 7 + j]));
      let kk = 0, ss = 0, c = 0; for (let t = t0; t < t1; t += g.beat) { kk += envAt(feat.kick, feat.hop, t); ss += envAt(feat.snare, feat.hop, t); c++; }
      F.push({ ch: chromaIn(feat, t0, t1), tim, lv: blk(t0, t1, i => P.level[i]), low: blk(t0, t1, i => Math.max(P.bands[i * 6], P.bands[i * 6 + 1])), voc: P.vocal ? blk(t0, t1, i => P.vocal[i]) : 0, dr: c ? (kk + ss) / c : 0 });
    }
    const W = 2, parts = [[], [], [], [], []];
    const avg = (a, b, fn) => { let s = 0, c = 0; for (let k = Math.max(0, a); k < Math.min(nb, b); k++) { s += fn(F[k]); c++; } return c ? s / c : 0; };
    const avgV = (a, b, fn, n) => { const o = new Float64Array(n); for (let k = Math.max(0, a); k < Math.min(nb, b); k++) { const v = fn(F[k]); for (let j = 0; j < n; j++) o[j] += v[j]; } return o; };
    for (let k = 0; k < nb; k++) {
      if (k < 1 || k > nb - 2) { for (const p of parts) p.push(0); continue; }
      parts[0].push(1 - cosSim(avgV(k - W, k, f => f.ch, 12), avgV(k, k + W, f => f.ch, 12)));
      const ta = avgV(k - W, k, f => f.tim, 7), tb = avgV(k, k + W, f => f.tim, 7); let d = 0; for (let j = 0; j < 7; j++) d += (ta[j] - tb[j]) ** 2; parts[1].push(Math.sqrt(d));
      parts[2].push(Math.abs(avg(k - W, k, f => f.lv) - avg(k, k + W, f => f.lv)) + 0.5 * Math.abs(avg(k - W, k, f => f.low) - avg(k, k + W, f => f.low)));
      parts[3].push(Math.abs(avg(k - W, k, f => f.voc) - avg(k, k + W, f => f.voc)));
      parts[4].push(Math.abs(avg(k - W, k, f => f.dr) - avg(k, k + W, f => f.dr)));
    }
    // each measure in units of its own typical size, so none dominates by scale
    const nov = new Float32Array(nb), wts = [1, 0.8, 1, 0.8, 0.6];
    parts.forEach((p, j) => { const s = Array.from(p).filter(x => x > 0).sort((x, y) => x - y), md = s.length ? s[Math.floor(s.length * 0.75)] : 1; for (let k = 0; k < nb; k++) nov[k] += wts[j] * Math.min(3, p[k] / (md || 1)); });
    return nov;
  }
  function refineSections(P) {
    const g = P.grid; if (!g || !P.feat || g.bars.length < 8) return;
    const nov = barNovelty(P), bars = g.bars, near = (t) => { let k = 0; for (let j = 1; j < bars.length; j++) if (Math.abs(bars[j] - t) < Math.abs(bars[k] - t)) k = j; return k; };
    // Each boundary may move up to 2 bars early or 3 late. A dynamic program picks all of them together:
    // strong bar-line change scores well, and so does a section length that is a whole number of 4-bar phrases
    // (pop songs add 2-bar tags, so phrase positions are judged section by section, not from bar 1).
    const cands = P.secs.map((s, i) => { if (i === 0) return [0]; const k0 = near(s.rawT0 - 0.4 * g.bar), out = []; for (let k = Math.max(1, k0 - 2); k <= Math.min(bars.length - 2, k0 + 3); k++) out.push(k); return out; });
    const node = (i, k) => i === 0 ? 0 : nov[k] - 0.35 * Math.abs(k - near(P.secs[i].rawT0 - 0.4 * g.bar));
    const link = (k1, k2) => k2 <= k1 ? -1e9 : (k2 - k1) % 4 === 0 ? 2.5 : (k2 - k1) % 2 === 0 ? 1 : 0;
    let prev = cands[0].map(k => ({ k, v: 0, from: null }));
    const trail = [prev];
    for (let i = 1; i < cands.length; i++) {
      const cur = cands[i].map(k => { let best = null; for (const p of prev) { const v = p.v + link(p.k, k) * (i === 1 ? 0.5 : 1) + node(i, k); if (!best || v > best.v) best = { k, v, from: p }; } return best; });
      trail.push(cur); prev = cur;
    }
    let end = prev.reduce((x, y) => y.v > x.v ? y : x, prev[0]); const chosen = [];
    for (let x = end; x; x = x.from) chosen.unshift(x.k);
    P.secs.forEach((s, i) => { if (i === 0) return; const k = chosen[i]; s.t0 = bars[k]; s.bar = k; s.snapped = true; s.phrase = (k - chosen[i - 1]) % 4 === 0; });
    // sections that collapsed onto the same bar, or shrank below 2 bars, merge into the one before
    for (let i = P.secs.length - 1; i > 0; i--) if (P.secs[i].t0 - P.secs[i - 1].t0 < 1.9 * g.bar) { P.secs[i - 1].t1 = P.secs[i].t1; P.secs.splice(i, 1); }
    P.secs.forEach((s, i) => { s.i = i; s.t1 = i + 1 < P.secs.length ? P.secs[i + 1].t0 : P.dur; });
    P.phrase = { starts: P.secs.map(s => s.bar || 0), nov };
  }
  // how strong a phrase line time t is, counting 4-bar phrases from the start of the section it's in:
  // 3 = a section start, 2 = 8 bars in (or 16, 24…), 1 = 4 bars in (12, 20…), 0 = not on a phrase line
  function phraseAt(P, t) {
    if (!P.grid || !P.phrase) return 0; const g = P.grid, k = Math.round((t - g.bars[0]) / g.bar);
    if (Math.abs(g.bars[0] + k * g.bar - t) > 0.15 * g.bar) return 0;
    const st = P.phrase.starts; let s0 = 0; for (const b of st) if (b <= k) s0 = b;
    const d = k - s0; return d === 0 ? 3 : d % 8 === 0 ? 2 : d % 4 === 0 ? 1 : 0;
  }
  /* ---------------- drops (v7) ----------------
     A drop is the moment the bass and kick come back at full strength after the song took them away (a breakdown or a
     build-up), landing on a phrase line. In pop the same thing happens on a smaller scale: the chorus hits after a
     one-bar stop. v6 relied on the engine's moments, which only fire after a silence gap or a detected riser, so it
     found no drops at all in a house track whose bass slams back four times. This works bar by bar from the audio:
     the kick band's level (below 130 Hz) and the kick's onset strength, against the song's own loudest bars. */
  function findDrops(P) {
    const g = P.grid, f = P.feat; if (!g || !f || g.bars.length < 12) return [];
    const bars = g.bars, nb = bars.length, bar = g.bar, db = (x) => 10 * Math.log10(x + 1e-12);
    const band = (E, t0, t1) => { const a = Math.max(0, Math.floor(t0 / f.hop)), b = Math.min(E.length, Math.ceil(t1 / f.hop)); let s = 0; for (let i = a; i < b; i++) s += E[i]; return b > a ? s / (b - a) : 0; };
    const lo = bars.map(t => db(band(f.eLo, t, t + bar))), kick = bars.map(t => band(f.kick, t, t + bar)), hi = bars.map(t => db(band(f.eHi, t, t + bar))), sn = bars.map(t => band(f.snare, t, t + bar));
    const srt = (a) => a.slice().sort((x, y) => x - y), loTop = srt(lo)[Math.floor(nb * 0.9)], kTop = srt(kick)[Math.floor(nb * 0.9)] || 1;
    const mean = (a, i, j) => { let s = 0, c = 0; for (let k = Math.max(0, i); k < Math.min(a.length, j); k++) { s += a[k]; c++; } return c ? s / c : NaN; };
    const cand = [];
    for (let k = 2; k < nb - 4; k++) {
      const post = mean(lo, k, k + 4), before1 = lo[k - 1], before4 = mean(lo, k - 4, k), before8 = mean(lo, k - 8, k);
      if (!(post >= loTop - 4.5)) continue;
      const j1 = post - before1, j4 = post - before4, kickUp = mean(kick, k, k + 4) / Math.max(1e-6, mean(kick, k - 2, k));
      // a full drop: the low end was gone for bars; a hit: a short stop (a bar or less) right before a bigger section
      const full = j4 >= 9, hit = !full && j1 >= 6 && post - before8 >= 2;
      if (!full && !hit) continue;
      const ph = phraseAt(P, bars[k]);
      cand.push({ k, j1, j4, kickUp, full, ph, s: (full ? 1 : 0.6) * (Math.min(j4, 24) / 12 + Math.min(j1, 18) / 18) + 0.15 * ph + 0.2 * Math.min(2, Math.log2(Math.max(1, kickUp))) });
    }
    // the other shape: a riser climbs for bars with the bass still there, then stops dead as the drop lands
    // (the highs fall back while the low end and mids get fuller)
    const mid = bars.map(t => db(band(f.eMid, t, t + bar)));
    for (let k = 5; k < nb - 4; k++) {
      const rise = hi[k - 1] - mean(hi, k - 5, k - 2), fall = hi[k - 1] - mean(hi, k, k + 2);
      const body = Math.max(mean(lo, k, k + 4) - mean(lo, k - 4, k), mean(mid, k, k + 4) - mean(mid, k - 4, k));
      if (rise >= 8 && fall >= 4 && body >= 1.5 && mean(lo, k, k + 4) >= loTop - 4.5) {
        const ph = phraseAt(P, bars[k]);
        cand.push({ k, j1: body, j4: body, kickUp: 1, full: true, riserDrop: true, rise, ph, s: 1.2 + Math.min(rise, 20) / 20 + 0.15 * ph });
      }
    }
    // a bass return that only starts a riser build (the riser drop follows within 8 bars) is the build's start
    for (const c of cand) if (!c.riserDrop && cand.some(r => r.riserDrop && r.k > c.k && r.k - c.k <= 8)) c.s = -1;
    for (let i = cand.length - 1; i >= 0; i--) if (cand[i].s < 0) cand.splice(i, 1);
    // strongest first; one drop per 8 bars
    cand.sort((a, b) => b.s - a.s);
    const out = [];
    for (const c of cand) {
      if (out.some(o => Math.abs(o.k - c.k) < 8)) continue;
      const k = c.k, post = mean(lo, k, k + 4);
      // the build: the bars before the drop whose low end sits well under it (a breakdown or build), up to 32 bars
      let b0 = k; while (b0 > 0 && k - b0 < 32 && lo[b0 - 1] <= post - 7) b0--;
      // a riser build starts where the highs began to climb
      if (c.riserDrop) { b0 = k - 1; while (b0 > 0 && k - b0 < 16 && hi[b0 - 1] < hi[b0] - 0.5) b0--; }
      if (b0 === k) b0 = Math.max(0, k - (c.full ? 4 : 1));
      // tension in the last 4 bars before it: the highs rising (a riser, an opening filter) or the snare busier (a roll)
      const riser = mean(hi, k - 2, k) - mean(hi, k - 6, k - 2), roll = mean(sn, k - 2, k) / Math.max(1e-6, mean(sn, k - 6, k - 2));
      let sus = 0; while (k + sus < nb && sus < 32 && lo[k + sus] >= post - 5) sus++;
      const t = bars[k], v = P.vocF ? (() => { const V = P.vocF, a = Math.floor(t / V.hop), b = Math.min(V.v.length, Math.floor((t + 4 * bar) / V.hop)); let s = 0; for (let i = a; i < b; i++) s += V.v[i]; return b > a ? s / (b - a) : 0; })() : 0;
      const conf = c.riserDrop ? clamp(0.55 + 0.03 * c.rise + 0.1 * (c.ph >= 1 ? 1 : 0)) : clamp(0.35 * clamp(c.j4 / 15) + 0.25 * clamp(c.j1 / 12) + 0.2 * clamp(Math.log2(Math.max(1, c.kickUp)) / 1.5) + 0.1 * (c.ph >= 1 ? 1 : 0) + 0.1 * clamp(sus / 16));
      out.push({ t, k, kind: c.full ? 'drop' : 'hit', impact: c.riserDrop ? Math.max(6, c.j4 + c.rise / 2) : Math.max(c.j4, c.j1), j1: c.j1, j4: c.j4, build0: bars[b0], buildBars: k - b0, built: riser > 1.5 || roll > 1.3 || k - b0 >= 4, riser, roll, sustainBars: sus, phrase: c.ph, vox: v, conf, gap: 0 });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  function nearestIn(arr, t) { let lo = 0, hi = arr.length - 1; if (hi < 0) return t; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m; else hi = m; } return Math.abs(arr[lo] - t) <= Math.abs(arr[hi] - t) ? arr[lo] : arr[hi]; }

  /* ---------------- reading a profile ---------------- */
  const barLen = (P) => P.grid ? P.grid.bar : 2;
  const beatLen = (P) => P.grid ? P.grid.beat : 0.5;
  const snap = (P, t) => P.grid ? nearestIn(P.grid.bars, t) : t;
  function barNo(P, t) {
    if (!P.grid || !P.grid.bars.length) return null;
    const b = P.grid.bars; let best = 0; for (let i = 1; i < b.length; i++) if (Math.abs(b[i] - t) < Math.abs(b[best] - t)) best = i;
    return best + 1;
  }
  // cue times get tenths of a second: cueing is precise work
  const fmtT = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - 60 * m; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
  const where = (P, t) => { const n = barNo(P, t); return n ? `${fmtT(t)} (bar ${n})` : fmtT(t); };
  const range = (P, t0, t1) => { const a = clamp(Math.floor(t0 / BLOCK), 0, P.nB - 1), b = clamp(Math.ceil(t1 / BLOCK), a + 1, P.nB); return [a, b]; };
  function energy(P, t0, t1) { const [a, b] = range(P, t0, t1), v = []; for (let i = a; i < b; i++) if (!P.silent[i]) v.push(P.level[i]); return v.length ? dbAvg(v) : -100; }
  function lowRel(P, t0, t1) { const [a, b] = range(P, t0, t1), v = []; for (let i = a; i < b; i++) if (!P.silent[i]) v.push(Math.max(P.bands[i * 6], P.bands[i * 6 + 1])); return v.length ? dbAvg(v) - Math.max(P.bandMean[0], P.bandMean[1]) : -20; }
  function lockIn(P, t0, t1) { const [a, b] = range(P, t0, t1); let s = 0; for (let i = a; i < b; i++) s += P.lock[i]; return s / (b - a); }
  function chordAt(P, t) { for (const c of P.chords) if (c.t0 <= t && t < c.t1) return c.chord; return -1; }
  function secAt(P, t) { for (const s of P.secs) if (t >= s.t0 - 0.05 && t < s.t1 - 0.05) return s; return P.secs[P.secs.length - 1] || null; }
  // a section's own key only when it's long enough to judge (short sections, like a 4-bar build, borrow chords)
  const keyAt = (P, t) => { const s = secAt(P, t); return s && s.keyR >= 0.8 && s.t1 - s.t0 >= 12 ? s.key : P.home; };
  const ROLE = { intro: 'intro', outro: 'outro', chorus: 'chorus', breakdown: 'breakdown', peak: 'high-energy section', build: 'build-up' };
  function secName(s) {
    if (!s) return 'section';
    const L = `section ${s.letter}${s.shift ? (s.shift > 0 ? ' +' : ' −') + Math.abs(s.shift) : ''}`;
    if (s.role === 'chorus') return `${L} (likely the chorus)`;
    return s.role ? `${ROLE[s.role]} (${L})` : L;
  }
  const secShort = (s) => !s ? 'section' : s.role === 'chorus' ? 'chorus' : s.role === 'peak' ? 'peak' : s.role ? ROLE[s.role] : `section ${s.letter}`;
  function firstBar(P) { if (!P.grid) return P.firstSound; const t = P.grid.bars.find(b => b >= P.firstSound - 0.15); return t != null ? t : P.grid.bars[0]; }
  const T1 = 'Track 1', T2 = 'Track 2';
  const dB = (x) => { const r = Math.round(x); return r === 0 ? '0 dB' : `${r > 0 ? '+' : '−'}${Math.abs(r)} dB`; };
  const tempoWhy = (C) => C.T.r === 1 ? `The tempos are ${C.A.bpm.toFixed(1)} and ${C.B.bpm.toFixed(1)} BPM, so ${T2} only needs a ${pctTxt(C.T.pct)} nudge to lock in.` : C.T.text;

  /* ---------------- tempo: how Track 2 can meet Track 1 ---------------- */
  function tempoRelation(A, B) {
    if (!A.bpm || !B.bpm) return { ease: 'none', fit: 0, rate: 1, r: 1, pct: null, text: `${!A.bpm ? T1 : T2} has no steady beat, so beatmatching is off the table. Cuts and echoes still work.` };
    const RS = [[1, 0, '1:1'], [2, 0.01, '2:1'], [0.5, 0.01, '1:2'], [1.5, 0.05, '3:2'], [2 / 3, 0.05, '2:3']];
    let best = null;
    for (const [r, pen, name] of RS) { const rate = A.bpm * r / B.bpm, pct = rate - 1, cost = Math.abs(pct) + pen; if (pen >= 0.05 && Math.abs(pct) > 0.025) continue; if (!best || cost < best.cost) best = { r, rate, pct, cost, name }; }
    const ap = Math.abs(best.pct);
    const ease = ap <= 0.03 ? 'easy' : ap <= 0.08 ? 'ok' : ap <= 0.16 ? 'stretch' : 'none';
    const fit = ease === 'easy' ? 1 : ease === 'ok' ? 1 - 0.25 * (ap - 0.03) / 0.05 : ease === 'stretch' ? 0.4 : 0;
    const target = B.bpm * best.rate;
    let text;
    if (ease === 'none') text = `${A.bpm.toFixed(1)} vs ${B.bpm.toFixed(1)} BPM: even counting half- or double-time they're ${(ap * 100).toFixed(0)}% apart, too far to beatmatch cleanly. Transitions that reset the beat (cuts, echoes, silences) work best.`;
    else {
      const how = best.r === 1 ? '' : best.r === 2 ? ` Track 2's beat runs about twice as fast, so match it at double time.` : best.r === 0.5 ? ` Track 2's beat is about half as fast, so match it at half time.` : ` They lock ${best.name.replace(':', ' beats against ')}: a polyrhythm, not a straight match.`;
      text = `Set ${T2} to ${target.toFixed(1)} BPM (pitch ${pctTxt(best.pct)}).${how}` + (ease === 'easy' ? ' That is a small nudge.' : ease === 'ok' ? ' Within a normal pitch fader (±8%).' : ' That needs a wide pitch range (±16%) and changes its feel.');
    }
    return { ...best, ease, fit, target, semis: 12 * Math.log2(best.rate), text };
  }

  /* ---------------- how alike any two half-seconds of the two songs are ---------------- */
  function crossSim(A, B, rot) {
    const nA = A.nB, nB = B.nB, X = new Float32Array(nA * nB).fill(-1);
    let s1 = 0, s2 = 0, n = 0;
    for (let i = 0; i < nA; i++) {
      if (A.silent[i]) continue;
      const ca = i * 12, ta = i * 7, la = A.level[i] - A.medLevel;
      for (let j = 0; j < nB; j++) {
        if (B.silent[j]) continue;
        const cb = j * 12, tb = j * 7;
        let cc = 0; for (let p = 0; p < 12; p++) cc += A.chroma[ca + (p + rot) % 12] * B.chroma[cb + p];
        let td = 0; for (let k = 0; k < 7; k++) { const d = A.timb[ta + k] - B.timb[tb + k]; td += d * d; }
        const v = 0.55 * cc + 0.3 * Math.exp(-td / 0.3) + 0.15 * Math.exp(-Math.abs(la - (B.level[j] - B.medLevel)) / 6);
        X[i * nB + j] = v; s1 += v; s2 += v * v; n++;
      }
    }
    const mean = n ? s1 / n : 0.5, std = n ? Math.sqrt(Math.max(1e-6, s2 / n - mean * mean)) : 0.1;
    return { X, nA, nB, mean, std, rot };
  }

  /* ---------------- building a plan (what the preview plays and the diagram draws) ---------------- */
  // Plan time 0 is the start of the preview. Each deck lists clips of its song, played at a rate
  // (1 = original speed; a ramp goes from rate to rate1), plus automation: fader gain, bass EQ (dB),
  // high-/low-pass filters (Hz) and an echo send.
  // v6: the bass EQ became a 3-band isolator, like a club mixer's kill EQ: lo (below ~200 Hz), mid, hi (above
  // ~2.5 kHz), each a gain from 0 (killed) to 1 (flat). v5 had one −26 dB low shelf, which let both basslines through.
  function newPlan(len) { const deck = () => ({ clips: [], gain: [], lo: [], mid: [], hi: [], hpf: [], lpf: [], echo: [], echoTime: 0.5, verb: [], verbTime: 3, keylock: true, shift: 0, trim: 0, loops: [] }); return { len, decks: [deck(), deck()], marks: [] }; }
  // The standard EQ blend, top-down: Track 2 comes in with only its highs (hats, shakers), the mids swap on the
  // phrase line (so only one voice or lead is ever up), the bass swaps in the same downbeat in one move (never two
  // basslines), then Track 1's remaining highs fade out. tIn: Track 2's fader starts; tSwap: the swap downbeat.
  function eqBlend(a, b, tIn, tSwap, tEnd, beat, rise) {
    const e = 0.02;
    b.gain.push([tIn, 0], [tIn + rise, 1]);
    b.lo.push([tIn, 0], [tSwap - e, 0], [tSwap, 1]);
    b.mid.push([tIn, 0], [tSwap - beat, 0], [tSwap, 1]);
    a.lo.push([0, 1], [tSwap - e, 1], [tSwap, 0]);
    a.mid.push([0, 1], [tSwap - beat, 1], [tSwap, 0]);
    a.gain.push([0, 1], [tSwap, 1], [tSwap + 0.5 * (tEnd - tSwap), 0.6], [tEnd, 0]);
  }
  // opt: { rev: true } plays backwards from `from`
  function clip(d, at, from, dur, rate = 1, rate1, opt) { if (dur > 0.01) d.clips.push(Object.assign({ at, from, dur, rate, rate1: rate1 == null ? rate : rate1 }, opt)); }
  const mark = (plan, t, text) => plan.marks.push({ t, text });
  // song time a deck is playing at plan time t (null if silent)
  function songTime(d, t) {
    for (const c of d.clips) if (t >= c.at && t < c.at + c.dur) { const u = t - c.at, adv = c.rate * u + (c.rate1 - c.rate) * u * u / (2 * c.dur); return c.rev ? c.from - adv : c.from + adv; }
    return null;
  }

  /* ---------------- listening for the singer (v6) ----------------
     Research on DJ practice agrees: never let two lead vocals overlap, don't cut a singer off mid-word, and let
     the next song's pickup (the words sung just before its downbeat) through. These read the ~23 ms vocal curve. */
  function vocF(P, t0, t1) {
    if (!P.vocF) return 0; const V = P.vocF, a = Math.max(0, Math.floor(t0 / V.hop)), b = Math.min(V.v.length, Math.ceil(t1 / V.hop));
    let s = 0; for (let f = a; f < b; f++) s += V.v[f]; return b > a ? s / (b - a) : 0;
  }
  // 1 when cutting the song at t chops nothing, 0 when t falls mid-word. v7: what decides it is whether the singer
  // would have kept singing right after t (that's the part a cut removes); singing right before only makes it worse.
  // (v6 looked only at the ¾ beat before t, and missed cuts where a line runs straight across the phrase line.)
  const lineEnds = (P, t) => 1 - clamp((vocF(P, t + 0.03, t + 0.4) - 0.12) / 0.35) * (0.5 + 0.5 * clamp((vocF(P, t - 0.75 * beatLen(P), t - 0.03) - 0.12) / 0.35));
  // how early (seconds, in half-beat steps up to 2 beats) the singer starts before the downbeat t
  // v7: up to a full bar (pop and EDM vocals often start a bar before the drop); v6 stopped at 2 beats and chopped them
  function pickupAt(P, t) {
    const b = beatLen(P); let lead = 0;
    for (let k = 1; k <= 8; k++) { if (vocF(P, t - k * b / 2, t - (k - 1) * b / 2) > 0.3) lead = k * b / 2; else break; }
    return lead;
  }
  const phraseWord = (n) => n === 3 ? 'a section start' : n === 2 ? 'an 8-bar phrase line' : n === 1 ? 'a 4-bar phrase line' : 'off the phrase';

  /* ---------------- the ideas ---------------- */
  const TECH = {
    blend: { level: 1, name: 'Blend into the drop', hook: 'The house DJ\'s standard, aimed at a payoff: Track 2\'s build-up slides in under Track 1 with only its highs, the mids swap halfway, the bass drains out, and Track 2\'s bass arrives on its own drop.' },
    riser: { level: 1, name: 'Filter riser', hook: 'Turn Track 1\'s filter up over its last 8 bars so its bass drains away like a build-up, then land Track 2\'s drop on the one.' },
    cut: { level: 1, name: 'Cut to the drop', hook: 'No overlap: Track 1 ends its phrase and Track 2 starts exactly on its drop.' },
    echo: { level: 1, name: 'Echo into the drop', hook: 'Track 1\'s last beat repeats and fades for one bar, then Track 2\'s drop lands. No tempo matching needed.' },
    brake: { level: 1, name: 'Tape stop', hook: 'Stop Track 1 like a turntable losing power, then hit Track 2\'s drop on the one. Works at any tempo.' },
    swap: { level: 2, name: 'Drop swap', hook: 'Let Track 1 build all the tension, then land on Track 2\'s drop instead of its own.' },
    double: { level: 2, name: 'Double drop', hook: 'Both drops hit on the same downbeat, one song\'s bass under the other\'s melody, then the new song takes over.' },
    roll: { level: 2, name: 'Loop roll', hook: 'Stutter Track 1\'s last bar into shorter and shorter loops, then release into Track 2\'s drop.' },
    spin: { level: 2, name: 'Spinback', hook: 'Throw Track 1 into reverse off a big moment and drop Track 2 as the rewind dies away.' },
    wash: { level: 2, name: 'Wash-out', hook: 'Dissolve Track 1 into a long reverb while its filter closes, and land Track 2\'s drop inside the wash.' },
    lift: { level: 2, name: 'Key lift', hook: 'Land Track 2\'s drop a step higher in key than Track 1, so it feels like the next level.' },
    layer: { level: 2, name: 'Loop & layer', hook: 'Loop a singer-free groove from Track 1, lay Track 2\'s build-up on top, and release the loop on Track 2\'s drop.' },
    chord: { level: 2, name: 'Shared-chord drop', hook: 'Switch where the harmony already agrees, landing on Track 2\'s drop.' },
    halftime: { level: 2, name: 'Half-time drop', hook: 'The tempos lock at 2:1, so Track 2\'s drop halves or doubles the groove while the beat stays in step.' },
    accel: { level: 2, name: 'Speed ramp', hook: 'Push Track 1 up to Track 2\'s tempo with key lock off, so the speed-up becomes the riser before the drop.' },
    fakeout: { level: 3, name: 'Fake-out drop', hook: 'Track 1 builds, its drop never comes (just an echo), and Track 2\'s drop lands one bar late.' },
    escalator: { level: 3, name: 'Build into build', hook: 'Just as Track 1 should drop, cut into Track 2\'s build-up instead: twice the tension, one release.' },
    hijack: { level: 3, name: 'Silence switch', hook: 'Use a silence built into one song as the switch point. The silence resets the ear, so the other song\'s drop lands clean.' },
    wormhole: { level: 3, name: 'Wormhole', hook: 'A spot where both songs sound nearly identical. Jump between them on a phrase line and the switch is almost invisible.' },
    modulate: { level: 3, name: 'Harmonic key change', hook: 'The keys don\'t match, but one chord belongs to both. Change songs on that chord, the way composers change key.' },
    keylock: { level: 3, name: 'Key-lock-off blend', hook: 'Turn key lock off on purpose: the tempo change also shifts Track 2\'s pitch, and that shift fixes the key.' },
    ride: { level: 3, name: 'Tempo ride', hook: 'The tempos are far apart, so glide Track 1\'s tempo to Track 2\'s over a long stretch, then blend into Track 2\'s first drop.' },
    trade: { level: 3, name: 'Trade phrases', hook: 'Run both tracks in sync and alternate them every two bars, like two players trading lines, before Track 2 takes over.' }
  };
  const LEVEL_NAME = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
  // no idea is suggested below this sound check (Matt's rule for v7: creativity can't buy back bad sound). It rises a
  // little with the level, so a more creative level can never be the worse-sounding one.
  const SOUND_FLOOR = 0.7, floorOf = (L) => SOUND_FLOOR + 0.025 * (L - 1);
  const CHECK_WORD = { rhythm: 'rhythm', phrase: 'phrase', voice: 'one voice', key: 'key', flow: 'flow', clean: 'clean audio' };

  function match(A, B) {
    const T = tempoRelation(A, B);
    const beatmatch = T.ease === 'easy' || T.ease === 'ok';
    const rB = beatmatch ? T.rate : 1;
    // one key shift (with key lock) that brings the home keys closest; small shifts only, they sound best
    let kShift = 0;
    if (A.home >= 0 && B.home >= 0) {
      const base = sharedNotes(A.home, B.home); let bestV = base;
      for (const s of [1, -1, 2, -2]) { const v = sharedNotes(A.home, transposeKey(B.home, s)); if (v > bestV && v >= 6) { bestV = v; kShift = s; } }
    }
    const K = { a: A.home, b: B.home, rel: keyRelation(A.home, B.home), shift: kShift, relShift: kShift ? keyRelation(A.home, transposeKey(B.home, kShift)) : null };
    const XS = crossSim(A, B, mod(-kShift, 12));
    const barA = barLen(A), beatA = beatLen(A);
    // v6: loudness matching uses each song's integrated loudness (LUFS, as streaming services measure it)
    const trim = clamp(A.lufs != null && B.lufs != null ? A.lufs - B.lufs : A.loud - B.loud, -9, 9);
    const warnGrid = [];
    for (const [P, nm] of [[A, T1], [B, T2]]) {
      if (P.grid && !P.grid.steady) warnGrid.push(`${nm}'s tempo drifts by about ${P.grid.driftMs.toFixed(0)} ms over the song (a live drummer or swung beat?), so keep an ear on the beatmatch.`);
      if (P.grid && P.grid.barConf < 0.5) warnGrid.push(`Where ${nm}'s bars start is an estimate with low confidence. Check the first beat of each bar by ear.`);
    }
    const C = { A, B, T, K, rB, beatmatch, barA, beatA, trim, XS };
    const all = [], skipped = [];
    const gens = { blend: genBlend, riser: genRiser, cut: genCut, echo: genEcho, brake: genBrake, swap: genSwap, double: genDouble, roll: genRoll, spin: genSpin, wash: genWash, lift: genLift, layer: genLayer, chord: genChords, halftime: genHalftime, accel: genAccel, fakeout: genFakeout, escalator: genEscalator, hijack: genHijack, wormhole: genWormholes, keylock: genKeylock, ride: genRide, trade: genTrade };
    for (const [tech, g] of Object.entries(gens)) {
      let out;
      try { out = g(C); } catch (err) { out = { skip: 'Could not evaluate: ' + err.message }; }
      if (out && out.skip) skipped.push({ tech, level: TECH[tech].level, name: TECH[tech].name, why: out.skip });
      else {
        let kept = 0, bestFail = null, deadFail = false;
        for (const idea of out || []) {
          const x = finish(C, idea);
          if (x.check.dead > 1.5 * C.beatA + 0.4) { deadFail = true; continue; }
          // v7: sound first. Nothing is suggested below the floor, at any level, however creative it is
          // and at the creative levels the singers must be kept cleaner too: one voice ≥ 0.45 (Intermediate), ≥ 0.6 (Advanced)
          const vRow = x.check.rows.find(r => r.k === 'voice'), vMin = x.level >= 3 ? 0.6 : x.level === 2 ? 0.45 : 0;
          if (x.check.total < floorOf(x.level) || (vRow && vRow.v < vMin)) { if (!bestFail || x.check.total > bestFail.check.total) bestFail = x; continue; }
          all.push(x); kept++;
        }
        if (!kept && bestFail) {
          const w = bestFail.check.rows.reduce((m, r) => r.v < m.v ? r : m), passTotal = bestFail.check.total >= floorOf(bestFail.level);
          skipped.push({ tech, level: bestFail.level, name: TECH[tech].name, check: bestFail.check.total, why: passTotal ? `Its best version sounds fine overall (${Math.round(bestFail.check.total * 100)}), but at this level the voices must stay cleaner: ${w.text}` : `Its best version scored ${Math.round(bestFail.check.total * 100)} on the sound check (the floor at this level is ${Math.round(floorOf(bestFail.level) * 100)}). Weakest part, ${CHECK_WORD[w.k]}: ${w.text}` });
        }
        else if (!kept && deadFail) skipped.push({ tech, level: TECH[tech].level, name: TECH[tech].name, why: 'The only places it fits would leave more than a beat of dead air.' });
      }
    }
    // shared-chord cuts between distant keys are reported as pivot-chord modulations
    if (!all.some(x => x.tech === 'modulate')) skipped.push({ tech: 'modulate', level: 3, name: TECH.modulate.name, why: K.rel.shared >= 6 ? 'The keys already agree, so there is nothing to modulate between (see the shared-chord cuts instead).' : 'No chord that belongs to both keys shows up at a usable spot in both songs.' });
    if (!all.some(x => x.tech === 'chord')) skipped.push({ tech: 'chord', level: 2, name: TECH.chord.name, why: K.rel.shared < 6 ? 'The keys are far apart, so matching chords are handled as pivot-chord modulations (Advanced).' : 'No phrase ending in Track 1 lines up harmonically with one of Track 2\'s drops.' });
    const byLevel = { 1: [], 2: [], 3: [] };
    for (const L of [1, 2, 3]) {
      const pool = all.filter(x => x.level === L).sort((a, b) => b.score - a.score), keep = [], per = {};
      for (const x of pool) {
        if ((per[x.tech] || 0) >= 2) continue;
        if (keep.some(y => y.tech === x.tech && Math.abs(y.cueA - x.cueA) < 4 && Math.abs(y.cueB - x.cueB) < 4)) continue;
        x.rankScore = x.score - 0.08 * (per[x.tech] || 0); keep.push(x); per[x.tech] = (per[x.tech] || 0) + 1;
      }
      const pick = keep.sort((a, b) => b.rankScore - a.rankScore);
      pick.forEach((x, i) => { x.rank = i + 1; });
      byLevel[L] = pick;
    }
    const compat = compatibility(C, all);
    return { A, B, T, K, trim, XS, warnGrid, ideas: all, byLevel, skipped, rB, compat };
  }
  /* ---------------- compatibility (v7): one number for the pair, with what it's made of ----------------
     How well two songs go together for a drop-focused mix: tempo (can they be beatmatched?), key (with the best small
     key shift), drops (does Track 2 have one to land early, and does Track 1 have a build or phrase ending to leave
     from?), loudness, vocals (can one voice be kept at a time?) and, weighted most, how good the best transition
     Anatomy actually found is. The weights are judgment calls until the dataset phase can fit them. */
  function compatibility(C, all) {
    const { A, B, T, K } = C;
    const tempo = T.ease === 'easy' ? 1 : T.ease === 'ok' ? 0.85 : T.ease === 'stretch' ? 0.4 : T.pct == null ? 0.3 : 0.15;
    const key = keyFit(A.home, transposeKey(B.home, K.shift)) - (K.shift ? 0.05 : 0);
    const Ls = landings(C), Os = launches(C), bestL = Ls.reduce((m, L) => Math.max(m, (L.kind === 'drop' ? 1 : L.kind === 'hit' ? 0.8 : 0.45) * (L.early ? 1 : 0.85)), 0);
    const drops = clamp(0.7 * bestL + 0.3 * (Os.some(o => o.kind === 'build') ? 1 : Os.length ? 0.6 : 0));
    const loud = clamp(1 - Math.max(0, Math.abs(C.trim) - 2) / 10);   // a trim knob fixes it, so it only costs a little
    const vox = A.sung != null && B.sung != null ? clamp(1 - Math.max(0, Math.min(A.sung, B.sung) - 0.35) / 0.5) : 0.7;
    const best = all.length ? Math.max(...all.map(x => x.score)) : 0;
    const parts = [
      { k: 'tempo', label: 'Tempo', v: tempo, text: T.pct == null ? 'No steady beat in one song.' : T.ease === 'easy' ? `Only ${Math.abs(T.pct * 100).toFixed(1)}% apart${T.r !== 1 ? ' (at half/double time)' : ''}.` : T.ease === 'ok' ? `${Math.abs(T.pct * 100).toFixed(1)}% apart: a normal pitch-fader move.` : `${Math.abs(T.pct * 100).toFixed(0)}% apart: transitions that reset the beat only.` },
      { k: 'key', label: 'Key', v: clamp(key), text: `${keyName(A.home)} → ${keyName(B.home)}${K.shift ? `, ${semis(K.shift)} on ${T2}` : ''}: ${sharedNotes(A.home, transposeKey(B.home, K.shift))} of 7 notes shared.` },
      { k: 'drops', label: 'Drops', v: drops, text: Ls.length ? `${T2} has ${Ls.filter(L => L.kind === 'drop').length || 'no'} drop${Ls.filter(L => L.kind === 'drop').length === 1 ? '' : 's'} to land on${Ls.some(L => L.kind === 'hit') ? ' plus chorus hits' : ''}; ${T1} ${Os.some(o => o.kind === 'build') ? 'has a build-up to leave from' : 'has phrase endings to leave from'}.` : `${T2} has no drop or chorus hit early enough to land on.` },
      { k: 'loud', label: 'Loudness', v: loud, text: Math.abs(C.trim) < 1.5 ? 'Equally loud.' : `${Math.abs(C.trim).toFixed(1)} dB apart (trim fixes it).` },
      { k: 'vocals', label: 'Vocals', v: vox, text: vox > 0.85 ? 'At least one song leaves room for the other\'s voice.' : 'Both are sung most of the time, so overlaps need care.' },
      { k: 'best', label: 'Best transition', v: best, text: all.length ? `The best one Anatomy found scores ${Math.round(best * 100)}.` : 'Nothing passed the sound check.' }
    ];
    const W = { tempo: 0.2, key: 0.15, drops: 0.18, loud: 0.05, vocals: 0.07, best: 0.35 };
    const v = clamp(parts.reduce((s, p) => s + W[p.k] * p.v, 0));
    return { v, word: v >= 0.85 ? 'Great match' : v >= 0.7 ? 'Good match' : v >= 0.55 ? 'Workable' : 'Tough pair', parts };
  }

  /* ---------------- sound check (v6) ----------------
     Every idea's plan is played through on paper, 10 times a second, to check the rules that decide whether a
     transition sounds clean: the beat locks (rhythm), both cue points sit on phrase lines (phrase), no two lead
     vocals overlap and nobody gets cut off mid-word (voice), and, only where both tracks overlap tonally, the keys
     agree (key). A Spotify study of automatic transitions found beat errors caused the bad ones and key clashes
     none, so rhythm and voice weigh most, and key only counts when there's a real overlap. */
  function envVal(pts, t, def) {
    if (!pts.length) return def; const P = pts.slice().sort((a, b) => a[0] - b[0]);
    if (t <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (t <= P[i][0]) { const [t0, v0] = P[i - 1], [t1, v1] = P[i]; return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1; }
    return P[P.length - 1][1];
  }
  function clipAt(d, t) { for (const c of d.clips) if (t >= c.at && t < c.at + c.dur) return c; return null; }
  function soundCheck(C, x) {
    const { A, B } = C, plan = x.plan, dt = 0.1, S = [A, B], rows = [];
    // what each deck contributes at plan time t: audible level, vocal audibility, song time
    const at = (k, t) => {
      const d = plan.decks[k], c = clipAt(d, t); if (!c) return null;
      const g = envVal(d.gain, t, 1), mid = envVal(d.mid, t, 1), lpf = envVal(d.lpf, t, 20000), hpf = envVal(d.hpf, t, 20);
      const st = songTime(d, t), filt = clamp((lpf - 400) / 1600) * clamp((2500 - hpf) / 2000);
      return { g, st, vox: g * mid * filt, full: g * (0.4 + 0.6 * mid) };
    };
    let ov = 0, clash = 0, cutMid = null, clipIn = null, loudA = null, firstB = null;
    for (let t = 0; t < plan.len; t += dt) {
      const a = at(0, t), b = at(1, t);
      if (a && b && a.g > 0.15 && b.g > 0.15) { ov += dt; clash += dt * Math.min(a.vox * vocF(A, a.st, a.st + dt), b.vox * vocF(B, b.st, b.st + dt)); }
      // Track 1's voice disappearing within ~0.7 s (a cut, a kill, a stop) while its singer is mid-line
      if (a && a.vox > 0.6) loudA = { t, st: a.st };
      else if (loudA && cutMid == null && (!a || a.vox < 0.1)) {
        if (t - loudA.t < 0.7) {
          // v7: a voice that ends inside an exit effect (echo, reverb, a roll, a brake or a spinback) trails off or
          // is mangled on purpose; it isn't chopped like a hard cut, so it costs much less
          const d0 = plan.decks[0], c0 = clipAt(d0, loudA.t), fx = envVal(d0.echo, loudA.t + dt, 0) > 0.3 || envVal(d0.verb, loudA.t + dt, 0) > 0.3 || (c0 && (c0.rev || Math.abs(c0.rate1 - c0.rate) > 0.05)) || d0.loops.some(l => loudA.t >= l.at - dt && loudA.t < l.at + l.dur);
          cutMid = (1 - lineEnds(A, loudA.st + 0.1)) * (fx ? 0.3 : 1);
        } else cutMid = 0;
      }
      // Track 2's voice appearing: does it clip a pickup or start mid-line?
      if (b && b.vox > 0.5 && firstB == null) { firstB = b.st; clipIn = clamp((vocF(B, b.st - 0.6 * beatLen(B), b.st - 0.02) - 0.12) / 0.35); }
    }
    // dead air: nothing audible (off either song's music, or both faders down) for more than a beat and a half
    let dead = 0, run = 0;
    const lastS = S.map(P => lastSoundOf(P));
    for (let t = 0; t < plan.len - 0.05; t += dt) {
      let live = false;
      for (let k = 0; k < 2; k++) { const d = plan.decks[k], c = clipAt(d, t); if (!c) { if ((d.echo.length && envVal(d.echo, t, 0) > 0.2) || (d.verb.length && envVal(d.verb, t, 0) > 0.2)) live = true; continue; } const st = songTime(d, t); if (envVal(d.gain, t, 1) > 0.05 && st >= S[k].firstSound - 0.2 && st <= lastS[k] + 0.2) live = true; }
      run = live ? 0 : run + dt; dead = Math.max(dead, run);
    }
    const clashN = ov > 0 ? clamp(clash / Math.max(ov, 2 * C.beatA) / 0.35) : 0;
    // rhythm
    const conf = (P) => P.grid ? (0.5 + 0.5 * P.grid.barConf) * (P.grid.steady ? 1 : 0.6) : 0;
    const beatOv = ov > 1.5 * C.beatA;
    let rhythm, rTxt;
    if (beatOv && x.sync !== 'free') {
      const rateFit = x.sync === 'match' || x.sync == null && C.beatmatch ? C.T.fit : x.rateFit != null ? x.rateFit : C.T.fit;
      rhythm = clamp(rateFit * Math.min(conf(A), conf(B)) * 1.1);
      rTxt = rhythm > 0.75 ? `Beats lock for the ${ov.toFixed(0)} s overlap: both grids are steady and the tempo change is ${C.T.pct == null ? 'none' : pctTxt(C.T.pct)}.` : `The overlap needs a ${C.T.pct == null ? 'big' : pctTxt(C.T.pct)} tempo change or a shaky grid, so the beats may flam.`;
    } else { rhythm = clamp(0.75 + 0.25 * Math.min(conf(A), conf(B))); rTxt = 'No beat overlap, so nothing can flam: the new beat simply takes over.'; }
    rows.push({ k: 'rhythm', v: rhythm, text: rTxt });
    // phrase
    const pA = phraseAt(A, x.cueA), pB = phraseAt(B, x.cueB);
    const phrase = clamp((Math.min(pA, 2) + Math.min(pB, 2)) / 4 + (pA && pB ? 0.1 : 0));
    rows.push({ k: 'phrase', v: phrase, text: `${T1}'s cue is ${phraseWord(pA)}; ${T2}'s is ${phraseWord(pB)}.` });
    // voice
    const vParts = [];
    if (clashN > 0.25) vParts.push(`two voices overlap for part of the ${ov.toFixed(0)} s blend`);
    if (cutMid != null && cutMid > 0.4) vParts.push(`${T1}'s singer gets cut off mid-line`);
    if (clipIn != null && clipIn > 0.4) vParts.push(`${T2} comes in mid-line`);
    const voice = clamp(1 - 0.9 * clashN - 0.5 * (cutMid || 0) - 0.4 * (clipIn || 0));
    rows.push({ k: 'voice', v: voice, text: A.vocF || B.vocF ? (vParts.length ? vParts.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : ov > 1 ? 'Only one lead voice at a time, and no line is cut off.' : 'No line is cut off: the handover falls between sung phrases.') : 'No vocal map for these tracks.' });
    // key: only where both are tonally present at once
    const kA = keyAt(A, x.cueA - 1), kB = transposeKey(keyAt(B, x.cueB + 1), x.shift || 0), kf = keyFit(kA, kB), wOv = clamp(ov / (8 * C.barA));
    const key = clamp(1 - wOv * (1 - kf) * 1.2);
    rows.push({ k: 'key', v: key, text: wOv > 0.1 ? `${Math.round(ov)} s of overlap in ${keyName(kA)} against ${keyName(kB)}: ${sharedNotes(kA, kB)} of 7 notes shared.` : `${keyName(kA)} → ${keyName(kB)}. With little or no overlap the keys barely matter.` });
    // flow (v7): the plan's output level, band by band, from each song's own measured energies. A hole (the sound
    // dropping well under both ends) or an anticlimax (landing quieter than where it left) is what makes a
    // transition feel like a clunky fade. The bars right before a drop landing may thin out: that's the build.
    const LV = planLevels(C, plan, dt), beatA = C.beatA, barA = C.barA, nS = LV.tot.length;
    const sm = (arr, w) => arr.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) { s += arr[j]; c++; } return s / c; });
    const lvl = sm(LV.tot.map(p => 10 * Math.log10(p + 1e-12)), Math.round(beatA / dt / 2));
    const meanIn = (a, t0, t1) => { const i0 = clamp(Math.round(t0 / dt), 0, nS - 1), i1 = clamp(Math.round(t1 / dt), i0 + 1, nS); let s = 0; for (let i = i0; i < i1; i++) s += a[i]; return s / (i1 - i0); };
    const before = meanIn(lvl, 0, 2 * barA), after = meanIn(lvl, plan.len - 2 * barA, plan.len), land = x.land;
    let hole = 0;
    for (let i = Math.round(2 * barA / dt); i < nS - Math.round(2 * barA / dt); i++) {
      const t = i * dt, build = land != null && t >= land - 8 * barA && t < land;
      if (lvl[i] < Math.min(before, after) - (build ? 18 : 9)) hole += dt;
    }
    const anti = clamp((before - after - 4) / 6);
    const flow = clamp(1 - 0.6 * clamp(hole / (2 * beatA)) - 0.4 * anti);
    const fParts = [];
    if (hole > 0.5 * beatA) fParts.push(`the sound sags for about ${hole.toFixed(1)} s in the middle`);
    if (anti > 0.2) fParts.push(`${T2} lands ${Math.round(before - after)} dB quieter than where ${T1} left off`);
    rows.push({ k: 'flow', v: flow, text: fParts.length ? fParts.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : land != null ? 'The energy holds, thins out for the build, and the drop lands at full strength.' : 'The energy holds steady from one song into the other.' });
    // clean audio (v7): big key-locked stretches and pitch shifts are what make a preview sound processed; effects
    // (echo, reverb, filters, stops) are fine. (v7 removed the rough in-browser stem split for the same reason.)
    let stretch = 0;
    for (const d of plan.decks) for (const c of d.clips) if (d.keylock && Math.abs(c.rate - 1) > 0.06 && c.rate === c.rate1) stretch = Math.max(stretch, Math.abs(c.rate - 1));
    const shiftAmt = Math.abs(plan.decks[1].shift || x.shift || 0);
    const clean = clamp(1 - 0.35 * clamp((stretch - 0.06) / 0.08) - (shiftAmt >= 2 ? 0.1 : 0));
    rows.push({ k: 'clean', v: clean, text: stretch > 0.06 ? `${T2} runs ${Math.round(stretch * 100)}% off its normal speed with key lock, which smears the sound.` : shiftAmt >= 2 ? `${T2} is pitch-shifted ${shiftAmt} semitones, which colors its sound a little.` : 'No heavy stretching or pitch-shifting: what you hear is the real audio.' });
    // the drop itself: how much the low end jumps at the landing, in the mix (for the payoff, not the pass/fail)
    let contrast = null;
    if (land != null) {
      // averaged as power, floored 40 dB under the plan's typical level, so a fully filtered bar reads as "very quiet", not minus infinity
      let ref = 0; for (const p of LV.tot) ref += p; ref /= Math.max(1, nS);
      const pw = (t0, t1) => { const i0 = clamp(Math.round(t0 / dt), 0, nS - 1), i1 = clamp(Math.round(t1 / dt), i0 + 1, nS); let s = 0; for (let i = i0; i < i1; i++) s += LV.lo[i]; return 10 * Math.log10(s / (i1 - i0) + ref * 1e-4); };
      contrast = pw(land + 0.05, land + barA) - pw(land - barA, land - 0.05);
    }
    const w = { rhythm: 0.27, phrase: 0.15, voice: 0.25, key: 0.12, flow: 0.13, clean: 0.08 };
    const total = rows.reduce((s, r) => s + w[r.k] * r.v, 0), worst = Math.min(...rows.map(r => r.v));
    return { rows, total: clamp(0.75 * total + 0.25 * worst), overlap: ov, dead, before, after, hole, contrast };
  }
  // what a plan sends out every dt seconds, per band (power, linear): each deck's own measured band energy at the
  // song time it is playing, times fader, isolator and filters, plus echo and reverb tails, for the flow check
  function planLevels(C, plan, dt) {
    const n = Math.ceil(plan.len / dt), lo = new Float64Array(n), mid = new Float64Array(n), hi = new Float64Array(n), tot = new Float64Array(n);
    plan.decks.forEach((d, k) => {
      const P = k ? C.B : C.A, f = P.feat; if (!f) return;
      const trim = k ? Math.pow(10, C.trim / 10) : 1;
      let eT = 0, vT = 0; const eDec = Math.exp(-dt * Math.log(4) / Math.max(0.05, d.echoTime)), vDec = Math.exp(-dt * 13.8 / Math.max(0.2, d.verbTime));
      for (let i = 0; i < n; i++) {
        const t = i * dt, c = clipAt(d, t); let pre = 0;
        if (c) {
          const st = songTime(d, t), u = t - c.at, rate = Math.abs(c.rate + (c.rate1 - c.rate) * u / Math.max(1e-6, c.dur)) || 1;
          const a0 = Math.min(st, st + (c.rev ? -1 : 1) * dt * rate), a = Math.max(0, Math.floor(a0 / f.hop)), b = Math.min(f.eLo.length, Math.max(a + 1, Math.ceil((a0 + dt * rate) / f.hop)));
          let L = 0, M = 0, H = 0; for (let j = a; j < b; j++) { L += f.eLo[j]; M += f.eMid[j]; H += f.eHi[j]; } const m = Math.max(1, b - a); L /= m; M /= m; H /= m;
          const hp = envVal(d.hpf, t, 20), lp = envVal(d.lpf, t, 20000);
          const fk = (fr) => Math.pow(clamp(1 - Math.log2(Math.max(1, hp / fr)) / 2.5) * clamp(1 - Math.log2(Math.max(1, fr / lp)) / 2.5), 2);
          let p = [L * envVal(d.lo, t, 1) ** 2 * fk(80), M * envVal(d.mid, t, 1) ** 2 * fk(600), H * envVal(d.hi, t, 1) ** 2 * fk(4000)];
          pre = (p[1] + p[2]) * trim;
          const g = envVal(d.gain, t, 1) ** 2 * trim;
          lo[i] += p[0] * g; mid[i] += p[1] * g; hi[i] += p[2] * g;
        }
        // echo repeats (feedback 0.5, thinned above 280 Hz) and the reverb tail keep sounding after the fader drops
        if (d.echo.length) { eT = eT * eDec + envVal(d.echo, t, 0) ** 2 * pre * (1 - eDec) * 1.3; mid[i] += 0.64 * eT * 0.7; hi[i] += 0.64 * eT * 0.3; }
        if (d.verb.length) { vT = vT * vDec + envVal(d.verb, t, 0) ** 2 * pre * (1 - vDec) * 3; mid[i] += vT * 0.7; hi[i] += vT * 0.3; }
      }
    });
    for (let i = 0; i < n; i++) tot[i] = lo[i] + mid[i] + hi[i];
    return { lo, mid, hi, tot };
  }

  // shared finishing: preparation steps, gain staging and the generic warnings
  function finish(C, x) {
    const { A, B, T } = C;
    const tech = TECH[x.tech];
    x.level = x.level || tech.level; x.name = tech.name; x.hook = x.hook || tech.hook;
    x.idea = clamp(x.score);
    x.check = soundCheck(C, x);
    x.payoff = payoffOf(x, x.check.contrast);
    x.score = rankOf(x.check, x.payoff); x.fit = Math.round(1 + 4 * x.score);
    x.id = `${x.tech}-${Math.round(x.cueA * 10)}-${Math.round(x.cueB * 10)}`;
    const prep = [];
    const pb = x.plan.decks[1];
    pb.trim = C.trim;
    if (x.sync) {
      if (x.sync === 'match') prep.push(`Match tempos: set ${T2} to ${T.target.toFixed(1)} BPM (pitch ${pctTxt(T.pct)})${x.level === 1 ? ', or press Sync if your gear has it' : ''}.`);
    }
    if (x.shift) prep.push(`Key lock on, then shift ${T2}'s key ${semis(x.shift)}${x.level === 1 ? ' (the "key shift" or "key sync" control)' : ''}.`);
    else if (x.sync === 'match' && pb.keylock && Math.abs(T.semis) > 0.3) prep.push(`Key lock on, so the tempo change doesn't bend ${T2}'s pitch (it would move ${Math.abs(T.semis).toFixed(1)} semitones).`);
    if (Math.abs(C.trim) >= 1.5) prep.push(`${T2} is about ${Math.abs(C.trim).toFixed(0)} dB ${C.trim < 0 ? 'louder' : 'quieter'} overall: ${C.trim < 0 ? 'turn its trim (gain) down' : 'turn its trim (gain) up'} by that much so the switch doesn't jump in volume.`);
    x.steps = prep.concat(x.steps);
    x.warn = (x.warn || []).concat(C.T.ease === 'stretch' && x.sync === 'match' && !x.warn.some(w => w.includes('normal speed')) ? [`That's a big tempo change (${pctTxt(T.pct)}); ${T2} will feel noticeably ${T.pct > 0 ? 'faster' : 'slower'} than usual.`] : []);
    x.chips = x.chips || [];
    x.chips.unshift(`${T1} ${fmtTime(x.cueA)}`, `${T2} ${fmtTime(x.cueB)}`);
    if (x.sync === 'match' && T.pct != null) x.chips.push(`Pitch ${pctTxt(T.pct)}`);
    if (x.shift) x.chips.push(`Key ${semis(x.shift)}`);
    if (x.plan.decks[1].keylock === false || x.plan.decks[0].keylock === false) x.chips.push('Key lock off');
    return x;
  }

  // score helpers
  const keyFit = (ka, kb) => { const sh = sharedNotes(ka, kb); return ka < 0 || kb < 0 ? 0.5 : sh >= 7 ? 1 : sh === 6 ? 0.85 : sh === 5 ? 0.5 : sh === 4 ? 0.25 : 0.1; };
  const late = (P, t) => clamp((t / P.dur - 0.35) / 0.55);
  function flowScore(eOut, eIn) { return clamp(1 - Math.max(0, eOut - eIn - 1) / 6); }
  // the shift (0 or the global key shift) that makes these two local keys agree best
  function bestShift(C, ka, kb) {
    if (!C.K.shift) return 0;
    return sharedNotes(ka, transposeKey(kb, C.K.shift)) > sharedNotes(ka, kb) ? C.K.shift : 0;
  }
  function keyWhy(ka, kb, s) {
    const kb2 = transposeKey(kb, s), rel = keyRelation(ka, kb2);
    const nm = (k) => `${keyName(k)} (${camelot(k)})`;
    return s ? `Shifted ${semis(s)}, ${T2}'s ${nm(kb)} becomes ${nm(kb2)}. Against ${T1}'s ${nm(ka)}: ${rel.text}` : `${T1} is in ${nm(ka)} here and ${T2} in ${nm(kb)}. ${rel.text}`;
  }
  function keyWarn(ka, kb, s, overlap) {
    const sh = sharedNotes(ka, transposeKey(kb, s));
    if (ka < 0 || kb < 0 || sh >= 6) return [];
    return [overlap ? `Only ${sh} of 7 notes agree, so the overlap will sound sour. Keep it short, or thin one track out with the filter.` : `The keys only share ${sh} of 7 notes. A hard switch hides that better than an overlap would.`];
  }
  // candidate hand-over points in Track 1: section starts (phrase boundaries), later is safer for a full mix-out
  function outs(A, minFrac, minBarsLeft) {
    const bar = barLen(A), out = [];
    for (let i = 1; i < A.secs.length; i++) {
      const s = A.secs[i], prev = A.secs[i - 1];
      if (s.t0 >= minFrac * A.dur && A.dur - s.t0 >= minBarsLeft * bar) out.push({ t: s.t0, prev, next: s });
      // v6: 8-bar phrase lines inside long sections are hand-over points too (a 16-bar chorus has one halfway)
      if (A.grid) for (let t = prev.t0 + 8 * bar; t < s.t0 - 4 * bar; t += 8 * bar) if (t >= minFrac * A.dur && phraseAt(A, t) >= 2) out.push({ t, prev, next: prev, inner: true });
    }
    return out.sort((x, y) => x.t - y.t);
  }
  const needGrid = (C) => !C.A.grid || !C.B.grid ? { skip: 'Needs a steady beat in both tracks.' } : null;
  const needMatch = (C) => needGrid(C) || (!C.beatmatch ? { skip: `Needs the tempos within about 8% (they're ${C.T.pct == null ? 'not comparable' : Math.abs(C.T.pct * 100).toFixed(0) + '% apart'}).` } : null);
  // duration on the plan clock of n of Track 2's bars once it is tempo-matched
  const barsB = (C, n) => n * barLen(C.B) / C.rB;

  /* ---------------- drop-first transitions (v7) ----------------
     v6 handed over at section boundaries with long overlaps, and often landed Track 2 in the middle of a section.
     Technically clean, but it sounded like a fade into a random part of the next song. A DJ's transition has a
     payoff: the next song's drop (or its chorus hit) lands on the one, with tension in front of it. Every v7 idea is
     built around one of Track 2's LANDINGS (its drops, then chorus hits) and one of Track 1's LAUNCHES (the end of its
     own build-up, or the end of a phrase). The rough in-browser stem split is gone: it leaked the rest of the song
     (measured: the "no vocals" stem only lowered the singer 4–6 dB), which is what made v6's vocal ideas sound worse. */
  function lastSoundOf(P) { for (let b = P.nB - 1; b >= 0; b--) if (!P.silent[b]) return (b + 1) * BLOCK; return P.dur; }
  const LAND_MAX = 0.72;
  // where Track 2 can land: its drops and chorus hits, strongest and earliest first (a DJ brings a song in near its start)
  function landings(C) {
    const B = C.B, barB = barLen(B), out = [];
    for (const d of B.drops || []) {
      if (B.dur - d.t < 10 * barB || d.t > LAND_MAX * B.dur || d.t < 0.5) continue;
      // v8: gap-only entries (a silence with no bass return: confidence 0.30, impact 0) are not landings. On house they
      // fire at 8-bar phrase ends, and on the test songs the one that lost the most went into Nanana's breakdown (its
      // bass falls 31 dB). A stop that really leads into a bigger section is the "hit" rule's job in findDrops.
      if (d.kind === 'gap' || d.conf < 0.3) continue;
      out.push({ t: d.t, kind: d.kind, impact: d.impact, build0: d.build0, buildBars: d.buildBars, built: d.built, gap: d.gap || 0, vox: d.vox, sec: secAt(B, d.t + 0.3), drop: d });
    }
    // fallback: section starts (chorus or high-energy) when Track 2 has no confident drop or hit to land on. v8: also
    // when it has only low-confidence ones (hip-hop like Pipe Down, whose gap-only entries used to stand in for these)
    if (!out.some(x => x.drop.conf >= 0.6)) for (const s of B.secs) if ((s.role === 'chorus' || s.role === 'peak') && s.t0 >= 0.5 && B.dur - s.t0 > 10 * barB && s.t0 < LAND_MAX * B.dur) out.push({ t: s.t0, kind: 'section', impact: clamp(s.low + 6, 2, 8), build0: Math.max(0, s.t0 - 4 * barB), buildBars: 4, built: false, gap: 0, vox: s.vocal || 0, sec: s, drop: null });
    const first = out.reduce((m, x) => !m || x.t < m.t ? x : m, null);
    for (const x of out) x.early = x === first || x.t < 0.35 * B.dur;
    return out;
  }
  // where Track 1 can leave: the moment its own drop would land (it hands over a full build-up of tension), or the
  // end of a phrase (section starts and 8-bar lines in its later part)
  function launches(C, minFrac = 0.42) {
    const A = C.A, bar = barLen(A), end = lastSoundOf(A), out = [];
    // v8 (#42): a gap-only entry (a silence with no bass return) is a build launch only if the engine saw a build into
    // it. The silence alone used to qualify it, and on the test songs none of the 27 that did had one: `built` was false
    // on all 27, the highs rose at most 2 dB and the bass fell at most 5 dB over the 4 bars before, and Drugs From
    // Amsterdam's 1:34 sat in the song's own fade. Where one falls on a phrase line, outs() still offers it as a phrase launch.
    for (const d of A.drops || []) if (d.t >= minFrac * A.dur && end - d.t >= bar && (d.built || (d.kind !== 'gap' && (d.buildBars >= 2 || d.gap > 0.12)))) out.push({ t: d.t, kind: 'build', tension: 1, drop: d, prev: secAt(A, d.t - 0.5), line: lineEnds(A, d.t) });
    for (const o of outs(A, minFrac, 2)) { if (out.some(x => Math.abs(x.t - o.t) < 0.5 * bar)) continue; out.push({ t: o.t, kind: 'phrase', tension: 0.5, prev: o.prev, next: o.next, inner: o.inner, line: lineEnds(A, o.t) }); }
    return out.sort((a, b) => a.t - b.t);
  }
  const landName = (L) => L.kind === 'drop' ? (L.early ? 'first drop' : `drop at ${fmtTime(L.t)}`) : L.kind === 'hit' ? `chorus hit at ${fmtTime(L.t)}` : secShort(L.sec);
  const landWhy = (C, L) => L.kind === 'drop' ? `${T2}'s drop at ${fmtTime(L.t)} brings ${Math.round(L.impact)} dB of bass and kick back${L.buildBars > 1 ? ` after ${L.buildBars} bars without them` : ''}: that jump is what a crowd feels as "the drop".`
    : L.kind === 'hit' ? `${T2}'s chorus hits at ${fmtTime(L.t)}: the low end jumps ${Math.round(L.impact)} dB right after a one-bar stop.`
    : `${T2} has no clear drop, so this lands on the start of its ${secName(L.sec)}.`;
  const tensionWhy = (C, o) => o.kind === 'build' ? `${T1} builds for ${o.drop.buildBars} bars from ${fmtTime(o.drop.build0)}: the crowd is waiting for its drop on ${where(C.A, o.t)}, and gets ${T2}'s instead.` : `${T1}'s ${secShort(o.prev)} ends on ${phraseWord(phraseAt(C.A, o.t))} at ${where(C.A, o.t)}, where a listener expects something new.`;
  const singerOK = (C, o) => o.line > 0.7 ? [`${T1}'s singer has finished the line by the switch, so no word is cut off.`] : [];
  const LEAD = (C, L) => pickupAt(C.B, L.t);
  // plan time the landing happens at, plus the bookkeeping every drop idea carries
  const landed = (x, at, L, tension, special) => Object.assign(x, { land: at, landing: L, tension, special });
  // the DJ's oldest drop trick: Track 1's bass knob all the way down for the last beat (or bar) before the drop, so
  // the drop has an empty low end to land in. One EQ move, so it's fine at any level.
  function bassOut(C, a, at, beats) { const t = at - beats * C.beatA; a.lo.push([0, 1], [t - 0.012, 1], [t, 0]); return t; }
  // v8: how loud a stretch of a song is in the mids and highs (what an echo repeats, and what you hear in a build), as
  // power relative to the song's median
  const midHiMed = new WeakMap();
  function midHi(P, t0, t1) {
    const f = P.feat; if (!f) return 1;
    if (!midHiMed.has(P)) { const v = []; for (let i = 0; i < f.eMid.length; i += 16) v.push(f.eMid[i] + f.eHi[i]); v.sort((x, y) => x - y); midHiMed.set(P, v[v.length >> 1] || 1e-12); }
    const a = Math.max(0, Math.floor(t0 / f.hop)), b = Math.min(f.eMid.length, Math.ceil(t1 / f.hop)); let s = 0; for (let i = a; i < b; i++) s += f.eMid[i] + f.eHi[i];
    return b > a ? s / (b - a) / midHiMed.get(P) : 0;
  }
  // beats of silence right before t (up to 3): each more than 10 dB under the loudest of the three beats before it
  function hushBeats(P, t, beat) { let n = 0; while (n < 3) { const k = t - (n + 1) * beat, ref = Math.max(midHi(P, k - beat, k), midHi(P, k - 2 * beat, k - beat), midHi(P, k - 3 * beat, k - 2 * beat)); if (!(midHi(P, k, k + beat) < 0.1 * ref)) break; n++; } return n; }
  // the longest lead-in of at most `bars` bars before t (and at least 2) that has no beat 20 dB under the song's median
  function soundingBars(P, t, bars) { const g = P.grid; if (!g) return bars; for (let j = 2; j < bars; j++) { const b0 = t - (j + 1) * g.bar; for (let q = 0; q < 4; q++) if (midHi(P, b0 + q * g.beat, b0 + (q + 1) * g.beat) < 0.01) return j; } return bars; }
  const bassStep = (beats, at) => beats >= 4 ? `For the last bar before the switch (from ${at}), turn ${T1}'s bass all the way down: the drop lands in an empty low end.` : `On the last beat before the switch, kill ${T1}'s bass: the drop lands in an empty low end.`;
  // v7: payoff = how hard the transition lands. A drop landing counts most: how big Track 2's drop is, how much
  // tension Track 1 hands it (the end of a build beats the end of a chorus), and how much the low end actually jumps
  // at the landing in this plan (`contrast`, dB, from the sound check). Sound decides first (the check is also a
  // pass/fail floor). v8 (#44): written once, used by both rate() and finish(); until 2026-10-20 each had its own copy.
  function payoffOf(x, contrast) {
    const L = x.landing;
    if (x.land == null || !L) return clamp(0.3 + 0.3 * clamp(x.score));
    const landV = clamp((L.kind === 'drop' ? 0.45 : L.kind === 'hit' ? 0.35 : 0.15) + clamp(L.impact / 20) * 0.45 + (L.early ? 0.1 : 0));
    return clamp(0.4 * landV + 0.25 * (x.tension == null ? 0.5 : x.tension) + 0.35 * (contrast > 0 ? clamp(contrast / 12) : 0));
  }
  const rankOf = (check, payoff) => clamp(0.55 * check.total + 0.45 * payoff);
  // a quick look at how a candidate will score, using the same sound check and payoff as the final ranking
  function rate(C, x) { const ck = soundCheck(C, x), pay = payoffOf(x, ck.contrast); return { ck, pay, total: rankOf(ck, pay) }; }
  function best2(cands, key) { cands.sort((a, b) => b.r.total - a.r.total); const keep = []; for (const c of cands) { if (keep.length >= 2) break; if (keep.some(k => key(k, c))) continue; keep.push(c); } return keep; }
  const near = (a, b, s) => Math.abs(a - b) < s;

  /* ----- Beginner: cut, echo, tape stop and filter riser, all into Track 2's drop ----- */
  // Track 1 plays `preBars` up to tA; Track 2 lands at its landing L on the one (its pickup kept)
  function intoDrop(C, tA, L, preBars, postBars) { const r = cutPlan(C, tA, L.t, preBars, postBars, LEAD(C, L)); return r; }
  function genCut(C) {
    const { A, B } = C, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase');
    if (!Ls.length) return { skip: `${T2} has no drop or chorus hit early enough to land on.` };
    if (!Os.length) return { skip: `${T1} has no phrase ending in its second half to cut from.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const { plan, tCut } = intoDrop(C, o.t, L, 8, 6); bassOut(C, plan.decks[0], tCut, 1); mark(plan, tCut, `${T2}'s ${L.kind === 'hit' ? 'chorus' : 'drop'}`);
      const x = landed({ tech: 'cut', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: 0, plan }, tCut, L, 0.5);
      const ka = keyAt(A, o.t - 1), kb = keyAt(B, L.t + 1);
      x.score = 0.4 * o.line + 0.3 * keyFit(ka, kb) + 0.3 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).map(x => {
      const o = x.o, L = x.landing, ka = keyAt(A, o.t - 1), kb = keyAt(B, L.t + 1), lead = LEAD(C, L);
      return Object.assign(x, {
        title: `Cut from ${T1}'s ${secShort(o.prev)} to ${T2}'s ${landName(L)}`,
        special: `No blend at all: the energy changes on one downbeat and ${T2}'s drop does the work.`,
        steps: [C.beatmatch ? `Match tempos so the pulse stays steady through the cut.` : `No need to match tempos: the beat changes at the cut.`, `Cue ${T2} at ${where(B, L.t)}, the downbeat of its ${L.kind === 'hit' ? 'chorus' : 'drop'}.`, `Count ${T1}'s last four beats before ${where(A, o.t)}: 4, 3, 2, 1.`, bassStep(1), ...leadStep(C, lead), `On the one, ${lead > 0 ? 'open' : 'start'} ${T2} and snap ${T1}'s fader shut in the same instant.`],
        why: [landWhy(C, L), tensionWhy(C, o), ...singerOK(C, o)], warn: keyWarn(ka, kb, 0, false), chips: ['No overlap', L.kind === 'hit' ? 'Lands the chorus' : 'Lands the drop']
      });
    });
  }
  function genRiser(C) {
    const { A, B } = C, bar = C.barA, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase' && o.line > 0.5 && lowRel(A, o.t - 8 * bar, o.t) > -5 && o.t - 10 * bar > A.firstSound);
    if (!Ls.length) return { skip: `${T2} has no drop or chorus hit early enough to land on.` };
    if (!Os.length) return { skip: `${T1} has no full-sounding 8-bar phrase near its end to sweep.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const { plan, tCut } = intoDrop(C, o.t, L, 10, 6), a = plan.decks[0], s0 = tCut - 8 * bar;
      // 8 bars of high-pass rising from 20 Hz to 1.2 kHz: the bass and kick drain out like a producer's build
      a.hpf.push([0, 20], [s0, 20], [s0 + 4 * bar, 160], [tCut - C.beatA, 1200]);
      mark(plan, s0, 'Filter starts rising'); mark(plan, tCut, `${T2}'s drop`);
      const x = landed({ tech: 'riser', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: 0, plan }, tCut, L, 0.85);
      x.score = 0.4 * o.line + 0.3 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.3 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).map(x => {
      const o = x.o, L = x.landing, lead = LEAD(C, L);
      return Object.assign(x, {
        title: `Filter-rise ${T1}'s ${secShort(o.prev)} into ${T2}'s ${landName(L)}`,
        special: `Builds a build-up that ${T1} doesn't have: 8 bars of rising filter drain its bass, so ${T2}'s drop lands like a real one.`,
        steps: [`Cue ${T2} at ${where(B, L.t)}, the downbeat of its ${L.kind === 'hit' ? 'chorus' : 'drop'}.`, `At ${where(A, o.t - 8 * bar)}, start turning ${T1}'s filter toward high-pass, slowly: a quarter of the way after 4 bars, most of the way by the last beat.`, `The room loses its bass bit by bit. Keep the fader up.`, ...leadStep(C, lead), `On the one at ${where(A, o.t)}, start ${T2} and cut ${T1}.`],
        why: [landWhy(C, L), `Producers build tension by taking the low end away and bringing it back on the drop. The filter does exactly that to ${T1}'s last 8 bars.`, ...singerOK(C, o)], warn: [], chips: ['8-bar filter rise', 'No overlap']
      });
    });
  }
  function genEcho(C) {
    const { A, B } = C, bar = C.barA, beat = C.beatA, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase');
    if (!Ls.length) return { skip: `${T2} has no drop or chorus hit early enough to land on.` };
    if (!Os.length) return { skip: `${T1} has no phrase ending in its second half.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      // the echoes ring for one bar; with matched tempos Track 2's last build bar plays under them, then the drop
      const pre = 6 * bar, gapBar = bar, plan = newPlan(pre + gapBar + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1], tLand = pre + gapBar;
      clip(a, 0, o.t - pre, pre + 0.3); a.echoTime = beat; a.echo.push([0, 0], [pre - beat - 0.02, 0], [pre - beat, 0.9], [tLand, 0.9], [tLand + 0.01, 0]); a.gain.push([0, 1], [pre - 0.012, 1], [pre, 0]);
      if (C.beatmatch) { clip(b, pre, L.t - gapBar * C.rB, plan.len - pre, C.rB); b.gain.push([pre, 0], [pre + 0.5 * bar, 1]); b.lo.push([pre, 0], [tLand - 0.012, 0], [tLand, 1]); }
      else landB(C, b, tLand, L.t, plan.len - tLand, LEAD(C, L), a);
      mark(plan, pre - beat, 'Echo on'); mark(plan, pre, `${T1} out`); mark(plan, tLand, `${T2}'s drop`);
      const x = landed({ tech: 'echo', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: 0, plan }, tLand, L, 0.7);
      x.score = 0.35 * o.line + 0.35 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.3 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Echo out of ${T1}'s ${secShort(o.prev)}, ${T2}'s ${landName(L)} one bar later`,
        special: `A one-bar breath: ${T1}'s last beat repeats and fades${C.beatmatch ? ` over the end of ${T2}'s build` : ''}, then the drop.`,
        steps: [`Set an echo on ${T1} to 1 beat, feedback around half.`, C.beatmatch ? `Cue ${T2} one bar before its ${L.kind === 'hit' ? 'chorus' : 'drop'} (${where(B, L.t - barLen(B))}) with its bass EQ off.` : `Cue ${T2} at ${where(B, L.t)}.`, `On the last beat before ${where(A, o.t)}, turn the echo on; on the downbeat pull ${T1}'s fader down.`, C.beatmatch ? `Start ${T2} on that downbeat. One bar later its drop lands: bring its bass up on the one.` : `One bar later, as the echoes fade, start ${T2} on its ${L.kind === 'hit' ? 'chorus' : 'drop'}.`],
        why: [landWhy(C, L), C.beatmatch ? `The echoes are in time with ${T2}, so the bar in between feels like a held breath, not a gap.` : `${C.T.text} The echoes fade before ${T2}'s beat starts, so the tempos never clash.`], warn: [], chips: ['1-beat echo', 'Lands the drop']
      });
    });
  }
  function genBrake(C) {
    const { A, B } = C, beat = C.beatA, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase');
    if (!Ls.length) return { skip: `${T2} has no drop or chorus hit early enough to land on.` };
    if (!Os.length) return { skip: `${T1} has no phrase ending in its second half.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const pre = 6 * C.barA, bk = 2 * beat, plan = newPlan(pre + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1];
      clip(a, 0, o.t - pre, pre - bk); clip(a, pre - bk, o.t - bk, bk, 1, 0.04); a.gain.push([0, 1], [pre - 0.05, 1], [pre, 0]);
      landB(C, b, pre, L.t, plan.len - pre, LEAD(C, L), a);
      mark(plan, pre - bk, 'Brake'); mark(plan, pre, `${T2}'s drop`);
      const x = landed({ tech: 'brake', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, plan }, pre, L, 0.65);
      x.score = 0.3 * o.line + 0.3 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.4 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Tape-stop ${T1}'s ${secShort(o.prev)}, then ${T2}'s ${landName(L)}`,
        special: `The wind-down is the build: two beats of falling pitch, then the drop on the one.`,
        steps: [`Set your Brake / Vinyl Stop effect to about 2 beats.`, `Cue ${T2} at ${where(B, L.t)}.`, `Two beats before ${where(A, o.t)}, hit the brake on ${T1}.`, `On the one, start ${T2}.`],
        why: [landWhy(C, L), `Slowing to a stop drags the pitch down with it, which everyone hears as "this song is over".`, C.beatmatch ? `The tempos match anyway, so ${T2} lands right where the beat would have been.` : `It also hides a tempo change (${C.A.bpm ? C.A.bpm.toFixed(0) : '?'} → ${C.B.bpm ? C.B.bpm.toFixed(0) : '?'} BPM).`], warn: [], chips: ['2-beat brake', 'Lands the drop']
      });
    });
  }
  /* ----- Beginner: blend into the drop (the house DJ's standard) -----
     Track 2 comes in a whole build-up before its drop, under the end of Track 1. Its highs first; halfway, on a phrase
     line, the mids swap (one voice at a time) and Track 1's bass goes out; Track 1's highs fade over the build;
     on Track 2's drop its bass comes in. The last bars have no bass at all, so the drop hits with full force. */
  function dropBlend(C, tech, sizes, opts = {}) {
    const { A, B } = C, barA = C.barA, beat = C.beatA, barB = barLen(B), end = lastSoundOf(A), out = [];
    for (const L of landings(C)) for (const nb of sizes) {
      const tb = L.t - nb * barB; if (tb < firstBar(B) - 0.1) continue;
      for (const t of A.grid.bars) {
        if (t < 0.38 * A.dur || t + (nb + 1) * barA > end + 0.1 || phraseAt(A, t) < 1) continue;
        const pre = 4 * barA, tIn = pre, tLand = tIn + nb * barA, tMid = tIn + nb / 2 * barA;
        const s = bestShift(C, keyAt(A, t + nb * barA / 2), keyAt(B, L.t + 1));
        const plan = newPlan(tLand + 6 * barA), a = plan.decks[0], b = plan.decks[1];
        clip(a, 0, t - pre, tLand + beat); clip(b, tIn, tb, plan.len - tIn, C.rB); b.shift = s; if (opts.keylockOff) b.keylock = false;
        b.gain.push([tIn, 0], [tIn + (nb >= 16 ? 4 : 2) * barA, 1]); b.lo.push([tIn, 0], [tLand - 0.012, 0], [tLand, 1]); b.mid.push([tIn, 0], [tMid - beat, 0], [tMid, 1]);
        a.lo.push([0, 1], [tMid - 0.012, 1], [tMid, 0]); a.mid.push([0, 1], [tMid - beat, 1], [tMid, 0]); a.gain.push([0, 1], [tMid, 1], [tLand - 0.05, 0]);
        mark(plan, tIn, `${T2}'s build in, highs only`); mark(plan, tMid, 'Swap mids, bass out'); mark(plan, tLand, `${T2}'s drop: bass in`);
        const x = landed({ tech, cueA: t, cueB: tb, sync: 'match', shift: s, plan, nb }, tLand, L, L.buildBars >= 2 ? 0.9 : 0.75);
        const vA = vocF(A, t, t + nb * barA), eA = energy(A, t, t + nb * barA) - A.medLevel;
        x.score = 0.3 * late(A, t) + 0.25 * clamp(1 - vA / 0.5) + 0.2 * clamp(1 - Math.max(0, eA) / 4) + 0.25 * (nb >= 16 ? 1 : 0.8); x.r = rate(C, x); x.t1 = t; out.push(x);
      }
    }
    return best2(out, (k, c) => near(k.cueA, c.cueA, 16 * barA) || k.landing === c.landing && near(k.cueA, c.cueA, 32 * barA));
  }
  function blendSteps(C, x, extra) {
    const { A, B } = C, nb = x.nb, L = x.landing, t = x.cueA, barA = C.barA;
    return [...(extra || []), `Cue ${T2} at ${where(B, x.cueB)}, ${nb} bars before its ${L.kind === 'hit' ? 'chorus' : 'drop'}. Turn its bass and mid EQ all the way down.`, `At ${where(A, t)} in ${T1}, start ${T2} on the beat and bring its fader up over ${nb >= 16 ? 4 : 2} bars: only its hats and risers come through.`, `On the downbeat at ${where(A, t + nb / 2 * barA)}, swap: ${T1}'s mids and bass down, ${T2}'s mids up. Leave ${T2}'s bass off: the room has no bass for ${nb / 2} bars, which is the point.`, `Fade ${T1}'s fader out over those bars. On ${T2}'s drop (${fmtTime(L.t)} in ${T2}), bring its bass up on the one.`];
  }
  function genBlend(C) {
    const miss = needMatch(C); if (miss) return miss;
    const { A, B } = C, found = dropBlend(C, 'blend', [16, 8]);
    if (!found.length) return { skip: `${T2}'s drops sit too close to its start for a full build-up, or ${T1} has no phrase with enough music after it.` };
    return found.map(x => {
      const L = x.landing, kA = keyAt(A, x.cueA + 1), kB = keyAt(B, L.t + 1);
      return Object.assign(x, {
        title: `${x.nb}-bar blend into ${T2}'s ${landName(L)}`,
        special: `The blend has a payoff: the bass swap is ${T2}'s drop itself, so the crowd hears a new song arrive at its biggest moment.`,
        steps: blendSteps(C, x),
        why: [landWhy(C, L), tempoWhy(C), keyWhy(kA, kB, x.shift), `Top-down EQ order (highs, then mids, then bass on the drop) is how house DJs blend: never two basslines or two voices at once.`],
        warn: keyWarn(kA, kB, x.shift, true).concat(voiceNote(x.r)), chips: [`${x.nb}-bar blend`, 'Bass swap on the drop']
      });
    });
  }
  const voiceNote = (r) => { const v = r && r.ck && r.ck.rows.find(z => z.k === 'voice'); return v && v.v < 0.7 ? [v.text] : []; };

  /* ----- Intermediate ----- */
  function genSwap(C) {
    const { A, B } = C, Ls = landings(C), Os = launches(C, 0.35).filter(o => o.kind === 'build');
    if (!Os.length) return { skip: `${T1} has no build-up into a drop in its second half.` };
    if (!Ls.length) return { skip: `${T2} has no drop or chorus hit early enough to land on.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const preBars = clamp(o.drop.buildBars + 1, 2, 9), s = C.beatmatch ? bestShift(C, keyAt(A, o.t - 1), keyAt(B, L.t + 1)) : 0;
      const { plan, tCut } = intoDrop(C, o.t, L, preBars, 6); plan.decks[1].shift = s; bassOut(C, plan.decks[0], tCut, 1);
      mark(plan, tCut - Math.min(o.drop.buildBars, preBars - 1) * C.barA, `${T1} builds`); mark(plan, tCut, `${T2}'s drop`);
      const x = landed({ tech: 'swap', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: s, plan }, tCut, L, 1);
      const chEnd = chordAt(A, o.t - C.beatA), cad = cadence(chEnd, transposeKey(keyAt(B, L.t + 1), s));
      x.score = 0.3 * keyFit(keyAt(A, o.t - 1), transposeKey(keyAt(B, L.t + 1), s)) + (cad ? 0.2 : 0) + 0.3 * late(A, o.t) + 0.2 * clamp(o.drop.buildBars / 8); x.o = o; x.cad = cad; x.chEnd = chEnd; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8) || near(k.cueB, c.cueB, 8)).map(x => {
      const o = x.o, L = x.landing;
      const why = [tensionWhy(C, o), landWhy(C, L)];
      if (x.cad) why.push(`${T1}'s build ends on ${chordName(x.chEnd)}, the V chord of ${T2}'s key: V → I is the strongest arrival in harmony, so the switch resolves.`); else why.push(keyWhy(keyAt(A, o.t - 1), keyAt(B, L.t + 1), x.shift));
      return Object.assign(x, {
        title: `${T1}'s build-up, ${T2}'s ${landName(L)}`,
        special: `The crowd has been counting down ${T1}'s drop. They get a different one: the surprise is the moment.`,
        steps: [`Cue ${T2} at ${where(B, L.t)}, the downbeat of its ${L.kind === 'hit' ? 'chorus' : 'drop'}.`, `Let ${T1}'s build-up run from ${fmtTime(o.drop.build0)}.`, bassStep(1), ...leadStep(C, LEAD(C, L)), `On the downbeat where ${T1}'s drop would land (${where(A, o.t)}), start ${T2} and cut ${T1} in the same instant.`],
        why, warn: [], chips: [x.cad ? 'V → I' : 'Build → drop', 'Lands the drop']
      });
    });
  }
  function genDouble(C) {
    const miss = needMatch(C); if (miss) return miss;
    const { A, B } = C, barA = C.barA, beat = C.beatA, Ls = landings(C).filter(L => L.kind === 'drop' || L.kind === 'hit');
    const Ds = (A.drops || []).filter(d => (d.kind === 'drop' || d.kind === 'hit') && d.conf >= 0.35 && d.t >= 0.3 * A.dur && d.sustainBars >= 8 && lastSoundOf(A) - d.t > 9 * barA);
    if (!Ds.length || !Ls.length) return { skip: `Needs a full drop in ${T1}'s second half and one early in ${T2}.` };
    const cands = [];
    for (const d of Ds) for (const L of Ls) {
      const s = bestShift(C, keyAt(A, d.t + 1), keyAt(B, L.t + 1)), ag = chordAgreement(barChords(A, d.t, 8), barChords(B, L.t, 8), s);
      if (ag.frac < 0.6 || keyFit(keyAt(A, d.t + 1), transposeKey(keyAt(B, L.t + 1), s)) < 0.8) continue;
      for (const mode of ['bassB', 'bassA']) {
        const preBars = clamp(d.buildBars + 1, 2, 8), pre = preBars * barA, sw = pre + 8 * barA, plan = newPlan(sw + 6 * barA), a = plan.decks[0], b = plan.decks[1];
        clip(a, 0, d.t - pre, sw + beat); clip(b, pre - 0.004, L.t - 0.004 * C.rB, plan.len - pre, C.rB); b.shift = s; b.gain.push([0, 1]);
        if (mode === 'bassB') { a.lo.push([0, 1], [pre - 0.012, 1], [pre, 0]); b.mid.push([0, 0], [sw - beat, 0], [sw, 1]); b.hi.push([0, 0], [sw - beat, 0], [sw, 1]); }
        else { b.lo.push([0, 0], [sw - 0.012, 0], [sw, 1]); a.mid.push([0, 1], [pre - 0.012, 1], [pre, 0]); a.hi.push([0, 1], [pre - 0.012, 1], [pre, 0]); }
        a.gain.push([0, 1], [sw - 0.05, 1], [sw + beat / 2, 0]);
        mark(plan, pre, 'Both drops'); mark(plan, sw, `All ${T2}`);
        const x = landed({ tech: 'double', cueA: d.t, cueB: L.t, sync: 'match', shift: s, plan, mode, ag }, pre, L, d.buildBars >= 2 ? 1 : 0.8);
        x.score = 0.5 * ag.frac + 0.25 * C.T.fit + 0.25 * late(A, d.t); x.d = d; x.r = rate(C, x); cands.push(x);
      }
    }
    if (!cands.length) return { skip: `The drops' chords don't agree well enough to stack (needs most of 8 bars to share notes).` };
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).map(x => {
      const L = x.landing, d = x.d, bB = x.mode === 'bassB';
      return Object.assign(x, {
        title: `Double drop: ${T1}'s ${fmtTime(d.t)} and ${T2}'s ${landName(L)} together`,
        special: bB ? `Both drops hit on the same downbeat: ${T2}'s bass under ${T1}'s melody, so the new song arrives from underneath.` : `Both drops hit at once: ${T2}'s melody over ${T1}'s bass for 8 bars, then ${T2}'s own bass takes over.`,
        steps: [`Beatmatch ${T2} and cue it at ${where(B, L.t)}, its drop.`, bB ? `Set ${T2}'s mid and high EQ all the way down, bass up.` : `Set ${T2}'s bass EQ all the way down.`, `Start ${T2} so its drop lands exactly on ${T1}'s at ${where(A, d.t)}. ${bB ? `On that downbeat kill ${T1}'s bass.` : `On that downbeat kill ${T1}'s mids and highs.`}`, `After 8 bars, on the downbeat, bring ${T2}'s ${bB ? 'mids and highs' : 'bass'} up and pull ${T1} out.`],
        why: [`Bar by bar the two drops' chords agree in about ${Math.round(x.ag.frac * 8)} of 8 bars${x.shift ? ` (with ${T2} shifted ${semis(x.shift)})` : ''}, so stacking them sounds like one track.`, `One bassline and one set of mids at a time: the stack is huge but never muddy.`, landWhy(C, L)],
        warn: voiceNote(x.r), chips: ['Double drop', bB ? `${T2} bass first` : `${T2} melody first`]
      });
    });
  }
  function genRoll(C) {
    const miss = needMatch(C); if (miss) return miss;
    const { A, B } = C, bar = C.barA, beat = C.beatA, Ls = landings(C), Os = launches(C, 0.4).filter(o => o.kind === 'phrase' && o.prev && o.prev.level > A.medLevel - 1);
    if (!Ls.length || !Os.length) return { skip: `Needs a high-energy phrase ending in ${T1} and a drop in ${T2}.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const s = bestShift(C, keyAt(A, o.t - 1), keyAt(B, L.t + 1)), pre = 6 * bar, t1 = pre - bar, plan = newPlan(pre + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1], src = o.t - bar;
      clip(a, 0, o.t - pre, pre - bar);
      const seq = [[beat, 2], [beat / 2, 2], [beat / 4, 4]]; let t = t1;
      for (const [len, n] of seq) { for (let k = 0; k < n; k++) clip(a, t + k * len, src, len); a.loops.push({ at: t, dur: len * n, len }); t += len * n; }
      a.gain.push([0, 1], [pre - 0.012, 1], [pre, 0]); a.hpf.push([0, 20], [t1, 20], [pre, 1600]); bassOut(C, a, pre, 4);
      landB(C, b, pre, L.t, plan.len - pre, LEAD(C, L), a); b.shift = s;
      mark(plan, t1, 'Roll'); mark(plan, pre, `${T2}'s drop`);
      const x = landed({ tech: 'roll', cueA: o.t, cueB: L.t, sync: 'match', shift: s, plan }, pre, L, 0.85);
      x.score = 0.4 * keyFit(keyAt(A, o.t - 1), transposeKey(keyAt(B, L.t + 1), s)) + 0.3 * late(A, o.t) + 0.3 * o.line; x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Roll ${T1}'s ${secShort(o.prev)} into ${T2}'s ${landName(L)}`,
        special: `Turns the last bar into a snare-roll build: 1, ½, ¼-beat loops that sound like acceleration, then the drop.`,
        steps: [`Cue ${T2} at ${where(B, L.t)}.`, `At ${fmtTime(o.t - C.barA)}, one bar before ${where(A, o.t)}, hold a 1-beat loop roll for two beats.`, `Kill ${T1}'s bass as the roll starts. Halve it: ½ beat for one beat, then ¼ beat for the last, sweeping the filter toward high-pass.`, `On the one, let go, start ${T2} and pull ${T1} out.`],
        why: [landWhy(C, L), `Shorter and shorter loops squeeze a whole build-up into one bar.`, keyWhy(keyAt(A, o.t - 1), keyAt(B, L.t + 1), x.shift)], warn: [], chips: ['1 → ½ → ¼ beat', 'Lands the drop']
      });
    });
  }
  function genSpin(C) {
    const { A, B } = C, beat = C.beatA, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase' && o.prev && o.prev.level > A.medLevel - 1);
    if (!Ls.length || !Os.length) return { skip: `Needs a loud phrase ending in ${T1} and a drop in ${T2}.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const pre = 6 * C.barA, sp = beat * 1.5, plan = newPlan(pre + 0.25 + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1];
      clip(a, 0, o.t - pre, pre - sp); clip(a, pre - sp, o.t - sp, sp, 3.2, 0.2, { rev: true });
      a.gain.push([0, 1], [pre - 0.05, 1], [pre, 0]); a.echoTime = beat / 2; a.echo.push([0, 0], [pre - sp - 0.01, 0], [pre - sp, 0.5], [pre, 0.5]); bassOut(C, a, pre, 1.5);
      landB(C, b, pre, L.t, plan.len - pre, LEAD(C, L), a);
      mark(plan, pre - sp, 'Spin back'); mark(plan, pre, `${T2}'s drop`);
      const x = landed({ tech: 'spin', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, plan }, pre, L, 0.75);
      x.score = 0.3 * clamp((o.prev.level - A.medLevel + 2) / 5) + 0.3 * late(A, o.t) + 0.4 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Spin back out of ${T1}'s ${secShort(o.prev)} into ${T2}'s ${landName(L)}`,
        special: `${T1}'s last hit rewinds out of the room, and ${T2}'s drop fills the silence it leaves.`,
        steps: [`Cue ${T2} at ${where(B, L.t)}.`, `A beat and a half before ${where(A, o.t)}, spin ${T1} backwards (jog wheel or Backspin effect) and kill its bass in the same move.`, `Start ${T2} on the one.`],
        why: [landWhy(C, L), C.beatmatch ? `With the tempos matched, ${T2} lands right on the grid.` : `Nobody can hear a beat during a rewind, so the tempo change (${C.A.bpm ? C.A.bpm.toFixed(0) : '?'} → ${C.B.bpm ? C.B.bpm.toFixed(0) : '?'} BPM) disappears.`], warn: [], chips: ['Reverse', 'Lands the drop']
      });
    });
  }
  function genWash(C) {
    const { A, B } = C, bar = C.barA, beat = C.beatA, Ls = landings(C), Os = launches(C).filter(o => o.kind === 'phrase' && o.line > 0.4);
    if (!Ls.length || !Os.length) return { skip: `Needs a phrase ending in ${T1} and a drop in ${T2}.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      // the last bar of Track 1 washes into a long reverb while its low-pass closes; the drop lands as the wash peaks
      const pre = 6 * bar, plan = newPlan(pre + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1];
      clip(a, 0, o.t - pre, pre + 0.3); a.verbTime = 3.2; a.verb.push([0, 0], [pre - bar, 0], [pre - 0.02, 1], [pre + 3, 1], [pre + 3.01, 0]);
      a.lpf.push([0, 20000], [pre - bar, 20000], [pre - 0.02, 600]); a.gain.push([0, 1], [pre - 0.012, 1], [pre, 0]); bassOut(C, a, pre, 4);
      landB(C, b, pre, L.t, plan.len - pre, LEAD(C, L), a);
      mark(plan, pre - bar, 'Wash starts'); mark(plan, pre, `${T2}'s drop`);
      const x = landed({ tech: 'wash', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, plan }, pre, L, 0.75);
      x.score = 0.35 * o.line + 0.35 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.3 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Wash ${T1}'s ${secShort(o.prev)} into reverb, land ${T2}'s ${landName(L)}`,
        special: `${T1} doesn't stop, it dissolves: a reverb tail with no beat in it, so ${T2}'s drop lands on a cloud${C.beatmatch ? '' : ' and the tempo change is hidden'}.`,
        steps: [`Set a reverb (or "wash out") effect on ${T1}, long, wet.`, `Cue ${T2} at ${where(B, L.t)}.`, `One bar before ${where(A, o.t)}, kill ${T1}'s bass, turn the reverb up and close its filter toward low-pass.`, `On the one, cut ${T1}'s fader (the tail keeps ringing) and start ${T2}.`],
        why: [landWhy(C, L), `A reverb tail has no beat in it, so it can sit under ${T2}'s drop for a few seconds without flamming.`], warn: [], chips: ['Reverb wash', 'Lands the drop']
      });
    });
  }
  function genLift(C) {
    const { A, B } = C;
    if (A.home < 0 || B.home < 0) return { skip: 'Needs a clear key in both tracks.' };
    const Ls = landings(C), Os = launches(C), cands = [];
    for (const o of Os) for (const L of Ls) {
      const ka = keyAt(A, o.t - 1), kb = keyAt(B, L.t + 1); if (ka < 0 || kb < 0) continue;
      for (const d of [2, 1]) {
        let s = mod(family(ka) + d - family(kb), 12); if (s > 6) s -= 12; if (Math.abs(s) > 2) continue;
        const { plan, tCut } = intoDrop(C, o.t, L, o.kind === 'build' ? clamp(o.drop.buildBars + 1, 2, 9) : 8, 6); plan.decks[1].shift = s; bassOut(C, plan.decks[0], tCut, 1);
        mark(plan, tCut, d === 2 ? 'Up a whole step' : 'Up a half step');
        const x = landed({ tech: 'lift', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: s, plan, d }, tCut, L, o.kind === 'build' ? 1 : 0.6);
        x.score = 0.4 * (s === 0 ? 1 : Math.abs(s) === 1 ? 0.75 : 0.55) * (d === 2 ? 1 : 0.9) + 0.3 * o.line + 0.3 * late(A, o.t); x.o = o; x.ka = ka; x.kb = kb; x.r = rate(C, x); cands.push(x);
      }
    }
    if (!cands.length) return { skip: `Neither a whole step nor a half step up is within 2 semitones of ${T2}'s key at its drops.` };
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing, kb2 = transposeKey(x.kb, x.shift), up = x.d === 2 ? 'a whole step' : 'a half step';
      return Object.assign(x, {
        title: `Lift ${up} into ${T2}'s ${landName(L)}`,
        special: `The drop arrives ${up} higher than ${T1} was: the same trick as a pop song's last-chorus key change, used between two songs.`,
        steps: [x.shift ? `Key lock on, shift ${T2} ${semis(x.shift)}: it now sits exactly ${up} above ${T1}.` : `No key shift needed: ${T2} already sits ${up} above ${T1} here.`, `Cue ${T2} at ${where(B, L.t)}.`, bassStep(1), o.kind === 'build' ? `Let ${T1}'s build-up run; on its drop downbeat (${where(A, o.t)}) cut to ${T2}.` : `Ride ${T1} to its last beat before ${where(A, o.t)}, then cut to ${T2} on the one.`],
        why: [`${T1} is in ${keyName(x.ka)} (${camelot(x.ka)}) here; ${T2}'s drop is in ${keyName(kb2)} (${camelot(kb2)}), ${up} higher.`, landWhy(C, L)], warn: [`It's a deliberate clash, so don't overlap. Cut cleanly.`], chips: [x.d === 2 ? '+1 step' : '+½ step', 'Lands the drop']
      });
    });
  }
  function genLayer(C) {
    const miss = needMatch(C); if (miss) return miss;
    const { A, B } = C, bar = C.barA, barB = barLen(B), cands = [];
    const Ls = landings(C).filter(L => L.t - 8 * barB >= firstBar(B) - 0.1);
    for (const sa of A.secs) {
      const len = (sa.t1 - sa.t0) / bar; if (len < 3.5 || sa.lock < 0.7 || sa.mids > 1.5 || sa.t0 < 0.3 * A.dur) continue;
      const Lb = len >= 7.5 ? 8 : 4; if (vocF(A, sa.t0, sa.t0 + Lb * bar) > 0.12) continue;   // a loop with no singer: Track 2's voice can go on top
      for (const L of Ls) {
        const s = bestShift(C, sa.key, keyAt(B, L.t - 4 * barB)), tb = L.t - 8 * barB;
        const ca = barChords(A, sa.t0, Lb), caL = Array.from({ length: 8 }, (_, k) => ca[k % Lb]), ag = chordAgreement(caL, barChords(B, tb, 8), s);
        if (ag.frac < 0.55) continue;
        const pre = 2 * bar, loopDur = Lb * bar, tIn = pre + loopDur, tLand = tIn + 8 * bar, passes = Math.ceil((tLand - pre) / loopDur);
        const plan = newPlan(tLand + 6 * bar), a = plan.decks[0], b = plan.decks[1];
        clip(a, 0, sa.t0 - pre, pre + loopDur); for (let k = 1; k < passes; k++) clip(a, pre + k * loopDur, sa.t0, Math.min(loopDur, tLand - pre - k * loopDur + C.beatA));
        a.loops.push({ at: pre, dur: tLand - pre, len: loopDur }); a.mid.push([0, 1], [tIn - 0.05, 1], [tIn, 0.35]); a.gain.push([0, 1], [tLand - 0.02, 1], [tLand + C.beatA / 2, 0]);
        clip(b, tIn, tb, plan.len - tIn, C.rB); b.shift = s; b.lo.push([tIn, 0], [tLand - 0.012, 0], [tLand, 1]); b.gain.push([tIn, 1]);
        mark(plan, pre, `Loop ${Lb} bars`); mark(plan, tIn, `${T2}'s build on top`); mark(plan, tLand, `${T2}'s drop`);
        const x = landed({ tech: 'layer', cueA: sa.t0, cueB: tb, sync: 'match', shift: s, plan, ag, Lb, sa }, tLand, L, 0.9);
        x.score = 0.45 * ag.frac + 0.3 * C.T.fit + 0.25 * late(A, sa.t0); x.r = rate(C, x); cands.push(x);
      }
    }
    if (!cands.length) return { skip: `No steady, singer-free part of ${T1} fits under one of ${T2}'s build-ups.` };
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const L = x.landing;
      return Object.assign(x, {
        title: `Loop ${T1}'s ${secShort(x.sa)} under ${T2}'s build, release into its ${landName(L)}`,
        special: `A live mashup that pays off: ${T1}'s groove carries ${T2}'s build-up, and the loop releases on ${T2}'s drop.`,
        steps: [`Set a ${x.Lb}-bar loop on ${T1} at ${where(A, x.cueA)}.`, `Cue ${T2} at ${where(B, x.cueB)}, 8 bars before its drop, bass EQ off.`, `After one pass of the loop, start ${T2} at full volume and turn ${T1}'s mids down to about a third.`, `On ${T2}'s drop, pull ${T1} out and bring ${T2}'s bass up in the same move.`],
        why: [`${T1}'s loop has no singer (so ${T2}'s voice sits alone on top), and the chords agree in about ${Math.round(x.ag.frac * 8)} of 8 bars${x.shift ? ` with ${T2} shifted ${semis(x.shift)}` : ''}.`, landWhy(C, L)], warn: x.ag.frac < 0.7 ? ['Some bars will rub harmonically. If it sounds sour, release after 4 bars.'] : [], chips: [`${x.Lb}-bar loop`, 'Releases on the drop']
      });
    });
  }
  function genHalftime(C) {
    if (needGrid(C)) return needGrid(C);
    if (!C.beatmatch || (C.T.r !== 2 && C.T.r !== 0.5)) return { skip: `The tempos don't sit near a 2:1 ratio (${C.A.bpm ? C.A.bpm.toFixed(0) : '?'} vs ${C.B.bpm ? C.B.bpm.toFixed(0) : '?'} BPM).` };
    const found = dropBlend(C, 'halftime', [8]); if (!found.length) return { skip: `No build-up in ${T2} with a phrase of ${T1} to lay it over.` };
    const half = C.T.r === 0.5;
    return found.slice(0, 1).map(x => Object.assign(x, {
      title: half ? `Drop into ${T2} at half time` : `Kick ${T2}'s drop in at double time`,
      special: half ? `The drop lands with the groove suddenly halved: heavier without slowing down.` : `The drop doubles the groove: urgency without speeding up.`,
      steps: blendSteps(C, x, [`${T2}'s beat is about ${half ? 'half' : 'twice'} as fast. Set it to ${C.T.target.toFixed(1)} BPM so the beats lock.`]),
      why: [`${C.A.bpm.toFixed(1)} and ${C.B.bpm.toFixed(1)} BPM are close to 2:1 (off by ${Math.abs(C.T.pct * 100).toFixed(1)}%).`, landWhy(C, x.landing)], warn: voiceNote(x.r), chips: [half ? 'Half time' : 'Double time', 'Lands the drop']
    }));
  }
  function genAccel(C) {
    const { A, B } = C;
    if (needGrid(C)) return needGrid(C);
    const tgt = C.T.pct != null ? B.bpm / C.T.r : B.bpm, d = tgt / A.bpm - 1;
    if (Math.abs(d) < 0.015) return { skip: 'The tempos are already the same, so there is nothing to ramp between.' };
    if (Math.abs(d) > 0.15) return { skip: `The tempos are ${Math.abs(d * 100).toFixed(0)}% apart, too much to ramp in 8 bars without it sounding like a mistake.` };
    if (d < 0) return { skip: `${T2} is slower. Ramping ${T1} down into a drop deflates the build instead of feeding it.` };
    const bar = C.barA, R = 8, rA1 = tgt / A.bpm, Ls = landings(C), cands = [];
    for (const o of launches(C)) if (o.t - (R + 4) * bar > A.firstSound) for (const L of Ls) {
      const pre = 4 * bar, srcLen = R * bar, Tr = srcLen * 2 / (1 + rA1), tR = o.t - R * bar;
      const plan = newPlan(pre + Tr + 6 * barLen(B)), a = plan.decks[0], b = plan.decks[1];
      clip(a, 0, tR - pre, pre); clip(a, pre, tR, Tr, 1, rA1); a.gain.push([0, 1], [pre + Tr - 0.012, 1], [pre + Tr, 0]);
      clip(b, pre + Tr, L.t, plan.len - pre - Tr, 1); b.gain.push([pre + Tr, 1]);
      mark(plan, pre, `Push ${A.bpm.toFixed(0)} → ${tgt.toFixed(0)} BPM`); mark(plan, pre + Tr, `${T2}'s drop`);
      const x = landed({ tech: 'accel', cueA: o.t, cueB: L.t, sync: null, plan, tR }, pre + Tr, L, o.kind === 'build' ? 1 : 0.8);
      x.score = 0.3 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.3 * (1 - Math.abs(d) / 0.15) + 0.4 * late(A, o.t); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    if (!cands.length) return { skip: `${T1} has no phrase ending with 8 bars in front of it to ramp through.` };
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const L = x.landing, o = x.o;
      return Object.assign(x, {
        title: `Push ${T1}'s ${o.kind === 'build' ? 'build-up' : 'last 8 bars'} up to ${T2}'s tempo, then its ${landName(L)}`,
        special: `The tempo change becomes the riser: ${T1} speeds up and rises ${(12 * Math.log2(rA1)).toFixed(1)} semitones into ${T2}'s drop.`,
        steps: [`Key lock OFF on ${T1}.`, `Cue ${T2} at ${where(B, L.t)}, normal speed.`, `At ${where(A, x.tR)}, push ${T1}'s pitch fader about ${(Math.abs(d) * 100 / R).toFixed(1)}% per bar so it reaches ${tgt.toFixed(1)} BPM right at ${fmtT(o.t)}.`, `On the one, cut to ${T2}.`],
        why: [`Speeding up with key lock off raises the pitch like a riser on top of ${T1}'s ${o.kind === 'build' ? 'own build-up' : 'phrase'}.`, landWhy(C, L)], warn: [`About ${(12 * Math.log2(rA1)).toFixed(1)} semitones of pitch bend by the end: great on drums, less so over a held vocal note.`], chips: [`${pctTxt(d)} over ${R} bars`, 'Key lock off']
      });
    });
  }

  /* ----- Advanced ----- */
  function genFakeout(C) {
    const { A, B } = C, bar = C.barA, beat = C.beatA, Ls = landings(C), Os = launches(C, 0.35).filter(o => o.kind === 'build');
    if (!Os.length) return { skip: `${T1} has no build-up into a drop to fake out.` };
    if (!Ls.length) return { skip: `${T2} has no drop early enough to land on.` };
    const cands = [];
    // v8: the preview starts after any near-silence in Track 1's build (Drugs From Amsterdam's build opens with a fade
    // to almost nothing), and the echo repeats the last beat that has sound in it (Demo 1's build ends in a one-beat
    // silence, which the echo used to repeat into a 2-second hole). Echo feedback of one half still fades about 24 dB
    // over the bar, so with matched tempos a second version plays Track 2's last build bar (bass off) under the echoes;
    // it brings Track 2 in a bar early, which the voice check may not allow, so the sound check picks between the two.
    for (const o of Os) for (const L of Ls) for (const fill of C.beatmatch ? [false, true] : [false]) {
      const preBars = soundingBars(A, o.t, clamp(o.drop.buildBars + 1, 2, 9)), pre = preBars * bar, tLand = pre + bar, plan = newPlan(tLand + barsB(C, 6)), a = plan.decks[0], b = plan.decks[1];
      const hush = hushBeats(A, o.t, beat), tOut = pre - hush * beat;
      clip(a, 0, o.t - pre, pre + 0.05); a.echoTime = beat; a.echo.push([0, 0], [tOut - beat - 0.02, 0], [tOut - beat, 0.85], [tLand, 0.85], [tLand + 0.01, 0]); a.gain.push([0, 1], [tOut - 0.012, 1], [tOut, 0]);
      if (fill) { clip(b, pre, L.t - bar * C.rB, plan.len - pre, C.rB); b.gain.push([pre, 0], [pre + 0.5 * bar, 1]); b.lo.push([pre, 0], [tLand - 0.012, 0], [tLand, 1]); }
      else landB(C, b, tLand, L.t, plan.len - tLand, LEAD(C, L), a);
      b.shift = C.beatmatch ? bestShift(C, keyAt(A, o.t - 1), keyAt(B, L.t + 1)) : 0;
      mark(plan, pre, `${T1}'s drop… doesn't come`); mark(plan, tLand, `${T2}'s drop`);
      const x = landed({ tech: 'fakeout', cueA: o.t, cueB: L.t, sync: C.beatmatch ? 'match' : null, shift: b.shift, plan, hush, fill }, tLand, L, 1);
      x.score = 0.35 * keyFit(keyAt(A, o.t - 1), keyAt(B, L.t + 1)) + 0.35 * late(A, o.t) + 0.3 * clamp(o.drop.buildBars / 8); x.o = o; x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing;
      return Object.assign(x, {
        title: `Fake-out: ${T1}'s drop never comes, ${T2}'s lands a bar late`,
        special: `The crowd counts down ${T1}'s build, hits the one, and gets only an echo. A bar later ${T2}'s drop lands, harder for the wait.`,
        steps: [`Echo on ${T1}: 1 beat, feedback around half, off for now.`,
          x.fill ? `Cue ${T2} one bar before its drop (${where(B, L.t - barLen(B))}), with its bass EQ off.` : `Cue ${T2} at ${where(B, L.t)}.`,
          `Let ${T1}'s build-up run from ${fmtTime(o.drop.build0)}.`,
          x.hush ? `Its last ${x.hush === 1 ? 'beat is' : `${x.hush} beats are`} silent, so echo the beat before: turn the echo on there, and pull ${T1}'s fader to zero as the silence starts.` : `On its last beat, echo on. On the downbeat where its drop should hit (${where(A, o.t)}), pull ${T1}'s fader to zero.`,
          x.fill ? `On the downbeat where ${T1}'s drop should hit (${where(A, o.t)}), start ${T2}: its last build bar plays under the echoes. One bar later, bring its bass up on the one as its drop lands.` : `Count one full bar of echoes after the downbeat where ${T1}'s drop should hit (${where(A, o.t)}). On the next downbeat, start ${T2}.`],
        why: [tensionWhy(C, o), `Producers call it a "fake drop": withholding the release one bar makes it hit harder. The echoes keep the room from going silent.`, landWhy(C, L)], warn: [`Commit to the full bar. Cutting it short just sounds like a mistake.`], chips: ['1-bar fake-out', 'Lands the drop']
      });
    });
  }
  function genEscalator(C) {
    const { A, B } = C, barB = barLen(B), Ls = landings(C).filter(L => L.kind === 'drop' && L.buildBars >= 4), Os = launches(C, 0.35).filter(o => o.kind === 'build');
    if (!Os.length || !Ls.length) return { skip: `Needs a build-up into a drop in both songs.` };
    const cands = [];
    for (const o of Os) for (const L of Ls) {
      const nbB = Math.min(8, L.buildBars), tb0 = L.t - nbB * barB, ka = keyAt(A, o.t - 1), kb = keyAt(B, L.t + 1);
      for (const s of [0, 1, 2, -1]) {
        if (s && !C.beatmatch) continue;
        const up = mod(family(transposeKey(kb, s)) - family(ka), 12); if (s && !(up === 1 || up === 2)) continue;
        // v8 (#43): like Fake-out, the preview starts after any near-silent beat in Track 1's build (the DJ still lets
        // the whole build run; the silence is the song's own, before the transition starts)
        const preBars = soundingBars(A, o.t, clamp(o.drop.buildBars + 1, 2, 9)), { plan, tCut } = cutPlan(C, o.t, tb0, preBars, nbB + 6, 0); plan.decks[1].shift = s;
        const tLand = tCut + nbB * barB / C.rB;
        mark(plan, tCut, `${T2}'s build takes over`); mark(plan, tLand, `${T2}'s drop`);
        const x = landed({ tech: 'escalator', cueA: o.t, cueB: tb0, sync: C.beatmatch ? 'match' : null, shift: s, plan, up, nbB }, tLand, L, 1);
        x.score = 0.35 * (up === 1 || up === 2 ? 1 : 0.6) + 0.35 * late(A, o.t) + 0.3 * keyFit(ka, transposeKey(kb, s)); x.o = o; x.r = rate(C, x); cands.push(x);
      }
    }
    if (!cands.length) return { skip: `The two build-ups don't sit well back to back.` };
    return best2(cands, (k, c) => near(k.cueA, c.cueA, 8)).slice(0, 1).map(x => {
      const o = x.o, L = x.landing, lift = x.up === 1 || x.up === 2;
      return Object.assign(x, {
        title: `Build into build: ${T1}'s build-up hands over to ${T2}'s, then its drop`,
        special: `Just when ${T1} should drop, ${T2}'s build-up starts climbing${lift ? `, ${x.up === 2 ? 'a whole step' : 'a half step'} higher` : ''}. Twice the tension, one release.`,
        steps: [x.shift ? `Key lock on, shift ${T2} ${semis(x.shift)}.` : `No key shift needed.`, `Cue ${T2} at ${where(B, x.cueB)}, the start of its ${x.nbB}-bar build-up.`, `Let ${T1}'s build-up run. On the downbeat where it would drop (${where(A, o.t)}), cut to ${T2}.`, `${T2} keeps building for ${x.nbB} bars and drops at ${fmtTime(L.t)}.`],
        why: [tensionWhy(C, o), `${T2}'s build-up runs ${x.nbB} bars from ${fmtTime(x.cueB)}. Both have no bass, so the cut keeps the energy level and only the tension keeps rising.`, landWhy(C, L)], warn: [`It only works if both build-ups really climb. Skip it if ${T1}'s is short.`], chips: [lift ? `Lift ${x.up === 2 ? '+1 step' : '+½ step'}` : 'Double build', 'Lands the drop']
      });
    });
  }
  function genHijack(C) {
    const { A, B } = C, res = [], Ls = landings(C);
    for (const d of A.drops || []) {
      if (!(d.gap >= 0.12) || d.t < 0.35 * A.dur) continue;
      for (const L of Ls) res.push({ kind: 'A', d, L, cueA: d.t, cueB: L.t, s: C.beatmatch ? bestShift(C, keyAt(A, d.t - 2), keyAt(B, L.t + 1)) : 0 });
    }
    for (const L of Ls) if (L.gap >= 0.12) for (const o of launches(C, 0.4).filter(o => o.kind === 'phrase')) res.push({ kind: 'B', L, o, cueA: o.t, cueB: L.t, s: C.beatmatch ? bestShift(C, keyAt(A, o.t - 1), keyAt(B, L.t + 1)) : 0 });
    if (!res.length) return { skip: 'Neither song has a silence right before a drop (a "gap, then impact" moment).' };
    const cands = [];
    for (const r of res) {
      let plan, at;
      if (r.kind === 'A') { const c = cutPlan(C, r.d.t, r.L.t, 6, 6, LEAD(C, r.L)); plan = c.plan; at = c.tCut; mark(plan, at - r.d.gap, `${T1} goes silent`); mark(plan, at, `${T2}'s drop`); }
      else {
        const bar = C.barA, pre = 6 * bar, gapMix = r.L.gap / C.rB; plan = newPlan(pre + barsB(C, 6)); const a = plan.decks[0], b = plan.decks[1];
        clip(a, 0, r.o.t - pre, pre); a.gain.push([0, 1], [pre - gapMix - 0.012, 1], [pre - gapMix, 0]);
        clip(b, pre - gapMix - 0.02, r.L.t - r.L.gap - 0.02 * C.rB, plan.len - pre + gapMix + 0.02, C.rB); b.gain.push([0, 1]); at = pre;
        mark(plan, pre - gapMix, `Into ${T2}'s silence`); mark(plan, pre, `${T2}'s drop`);
      }
      plan.decks[1].shift = r.s;
      const x = landed({ tech: 'hijack', hkind: r.kind, cueA: r.cueA, cueB: r.cueB, sync: C.beatmatch ? 'match' : null, shift: r.s, plan, rr: r }, at, r.L, 0.9);
      x.score = 0.35 * clamp((r.kind === 'A' ? r.d.gap : r.L.gap) / 0.4) + 0.35 * keyFit(keyAt(A, r.cueA - 1), transposeKey(keyAt(B, r.cueB + 1), r.s)) + 0.3 * late(A, r.cueA); x.r = rate(C, x); cands.push(x);
    }
    return best2(cands, (k, c) => k.hkind === c.hkind).map(x => {
      const r = x.rr, L = x.landing, gap = r.kind === 'A' ? r.d.gap : r.L.gap;
      // v8 (#42): a gap-only entry is a real silence with no drop after it (Latch 1:51 is a stop inside its chorus), so
      // the switch still works but Track 1 promised no drop: say "stop", not "drop"
      const stop = r.kind === 'A' && r.d.kind === 'gap';
      return Object.assign(x, r.kind === 'A' ? {
        title: stop ? `Silence switch: ${T2}'s drop lands in ${T1}'s stop` : `Silence switch: hijack ${T1}'s drop with ${T2}'s`,
        special: stop ? `${T1} stops dead for ${gap.toFixed(2)} s and the crowd waits for the beat to come back. It comes back as ${T2}'s drop.` : `${T1} has a ${gap.toFixed(2)} s silence before its drop. Switch inside it and the crowd gets a different drop than the one they were promised.`,
        steps: [`Cue ${T2} at ${where(B, L.t)}.`, `${T1} goes silent for ${gap.toFixed(2)} s before ${fmtTime(r.d.t)}: that's your switch.`, stop ? `Pull ${T1}'s fader inside the silence and start ${T2} exactly where ${T1}'s beat would have come back.` : `Pull ${T1}'s fader inside the silence and start ${T2} exactly where ${T1}'s drop would have hit.`],
        why: [`A silence wipes the listener's sense of the groove, so ${C.beatmatch ? 'the new drop has nothing to be compared against' : `even a different tempo (${C.B.bpm ? C.B.bpm.toFixed(0) : '?'} vs ${C.A.bpm ? C.A.bpm.toFixed(0) : '?'} BPM) lands clean`}.`, landWhy(C, L)], warn: [], chips: [`${gap.toFixed(2)} s silence`, 'Lands the drop']
      } : {
        title: `Cut into ${T2}'s silence, right before its drop`,
        special: `Borrow ${T2}'s own ${gap.toFixed(2)} s breath before its drop: ${T1} ends in a held breath, not a crash.`,
        steps: [`Cue ${T2} at ${fmtT(L.t - gap)}, the start of its silence.`, `Play ${T1} to ${where(A, r.o.t)}.`, `Just before that downbeat, start ${T2} and kill ${T1}: silence, then ${T2}'s drop on the one.`],
        why: [`Silence resets the groove, so ${C.beatmatch ? 'the switch feels planned' : 'the tempo change hides inside it'}.`, landWhy(C, L)], warn: [], chips: [`${gap.toFixed(2)} s silence`, 'Lands the drop']
      });
    });
  }
  function genKeylock(C) {
    const { T, A, B } = C;
    if (needGrid(C)) return needGrid(C);
    if (!C.beatmatch || T.r !== 1) return { skip: 'Needs tempos within 8% at a straight 1:1 match.' };
    const n = Math.round(T.semis);
    if (n === 0 || Math.abs(T.semis - n) > 0.3) return { skip: `The tempo change moves ${T2}'s pitch ${Math.abs(T.semis).toFixed(2)} semitones with key lock off, not close to a whole semitone.` };
    const before = sharedNotes(A.home, B.home), after = sharedNotes(A.home, transposeKey(B.home, n));
    if (after <= before) return { skip: `Letting the tempo change shift ${T2} ${semis(n)} would not make the keys agree better.` };
    const found = dropBlend(C, 'keylock', [8], { keylockOff: true }); if (!found.length) return { skip: `No build-up in ${T2} with a phrase of ${T1} to lay it over.` };
    const kb2 = transposeKey(B.home, n);
    return found.slice(0, 1).map(x => { x.shift = 0; x.plan.decks[1].shift = 0; return Object.assign(x, {
      title: `Let the pitch fader fix the key, blend into ${T2}'s ${landName(x.landing)}`,
      special: `Most DJs leave key lock on out of habit. Here turning it off is what makes the keys agree.`,
      steps: blendSteps(C, x, [`Key lock OFF on ${T2}; set it to ${T.target.toFixed(1)} BPM. Its key rises with the speed, from ${keyName(B.home)} to ${keyName(kb2)}.`]),
      why: [`Speeding ${T2} up ${pctTxt(T.pct)} without key lock raises it ${T.semis.toFixed(2)} semitones, almost exactly ${semis(n)}: ${before} → ${after} of 7 notes shared with ${T1}.`, landWhy(C, x.landing)], warn: voiceNote(x.r), chips: ['Key lock off', 'Lands the drop']
    }); });
  }

  /* ----- shared plan pieces ----- */
  // Track 2 lands on plan time `at` from song time tB. If its singer starts before the downbeat (a pickup), start
  function landB(C, b, at, tB, len, leadSong, a) {
    const lead = Math.min((leadSong || 0) / C.rB, at);
    clip(b, at - lead, tB - lead * C.rB, len + lead, C.rB); b.gain.push([at - lead, 1]);
    if (lead > 0) {
      b.hpf.push([at - lead, 380], [at - 0.012, 380], [at, 20]); b.lo.push([at - lead, 0], [at - 0.012, 0], [at, 1]);
      // v7: Track 1's mids (its singer) step aside for the pickup, so the two voices don't overlap
      if (a) a.mid.push([0, 1], [at - lead - 0.03, 1], [at - lead + 0.03, 0]);
    }
  }
  function cutPlan(C, tA, tB, preBars, postBars, lead) {
    const bar = C.barA, pre = preBars * bar, plan = newPlan(pre + barsB(C, postBars)), a = plan.decks[0], b = plan.decks[1];
    clip(a, 0, tA - pre, pre + 0.4); a.gain.push([0, 1], [pre - 0.012, 1], [pre, 0]);
    landB(C, b, pre, tB, plan.len - pre, lead, a);
    return { plan, tCut: pre };
  }
  const leadStep = (C, lead) => { if (!(lead > 0)) return []; const nb = Math.round(lead / beatLen(C.B) * 2) / 2; return [`${T2}'s singer starts ${nb === 0.5 ? 'half a beat' : nb + ' beat' + (nb === 1 ? '' : 's')} before that downbeat: start it that early with its bass and filter pulled back, then open them on the one.`]; };
  function barChords(P, t0, nBars, rate = 1) { const bar = barLen(P), out = []; for (let k = 0; k < nBars; k++) out.push(chordAt(P, t0 + (k + 0.5) * bar)); return out; }
  function chordAgreement(ca, cb, s) {
    let good = 0, n = 0;
    for (let k = 0; k < Math.min(ca.length, cb.length); k++) {
      const a = ca[k], b = transposeChord(cb[k], s); if (a < 0 || b < 0) continue; n++;
      const sh = chordShare(a, b); good += sh >= 2 ? 1 : sh === 1 ? 0.4 : 0;
    }
    return n >= Math.min(ca.length, cb.length) * 0.5 ? { frac: good / n, n } : { frac: 0.5, n };
  }
  function cadence(chA, kB) { return chA >= 0 && chA < 12 && kB >= 0 && chA === (kB % 12 + 7) % 12; }

  /* ----- harmony, look-alikes, tempo and call-and-response (kept from v6, retargeted) ----- */
  function genChords(C) {
    const { A, B } = C, res = [];
    for (const o of outs(A, 0.35, 2)) {
      const cA = chordAt(A, o.t - C.beatA); if (cA < 0) continue;
      for (const L of landings(C)) { const i = { t: L.t, sec: L.sec, first: false, L };
        const cB0 = chordAt(B, i.t + beatLen(B)); if (cB0 < 0) continue;
        const ka = keyAt(A, o.t - 1), kb = keyAt(B, i.t + 1);
        for (const s of C.K.shift ? [0, C.K.shift] : [0]) {
          const cB = transposeChord(cB0, s), kb2 = transposeKey(kb, s);
          let rel = null;
          if (cA === cB) rel = { kind: 'same', v: 0.9 };
          else if (cA < 12 && mod(cA - cB % 12, 12) === 7) rel = { kind: 'cadence', v: 1 };
          else if (mod(cA % 12 - cB % 12, 12) === 5 && cA < 12) rel = { kind: 'plagal', v: 0.75 };
          else if (chordShare(cA, cB) >= 2) rel = { kind: 'shared', v: 0.6 };
          if (!rel) continue;
          const distant = sharedNotes(ka, kb2) <= 5;
          const pivot = diatonic(ka).includes(cA) && diatonic(kb2).includes(cA);
          if (distant && !(pivot || rel.kind === 'cadence')) continue;
          const eOut = energy(A, o.t - 4 * C.barA, o.t) - A.medLevel, eIn = energy(B, i.t, i.t + 4 * barLen(B)) - B.medLevel;
          const score = 0.45 * rel.v + 0.2 * flowScore(eOut, eIn) + 0.2 * (C.beatmatch ? C.T.fit : 0.55) + 0.15 * late(A, o.t) - (s ? 0.05 : 0);
          res.push({ o, i, cA, cB, cB0, s, rel, ka, kb, kb2, distant, pivot, score });
        }
      }
    }
    if (!res.length) return [];
    res.sort((x, y) => y.score - x.score);
    const out = [];
    for (const r of res) {
      if (out.filter(x => x.tech === (r.distant ? 'modulate' : 'chord')).length >= 2 || out.some(x => Math.abs(x.cueA - r.o.t) < 8)) continue;
      const { plan, tCut } = cutPlan(C, r.o.t, r.i.t, 6, 6); plan.decks[1].shift = r.s; const lx = { land: tCut, landing: r.i.L, tension: 0.6 };
      // a one-beat crossfade rather than a hard cut: the shared harmony carries it
      const a = plan.decks[0], b = plan.decks[1]; a.gain.length = 0; a.gain.push([0, 1], [tCut - C.beatA / 2, 1], [tCut + C.beatA / 2, 0]); a.clips[0].dur = tCut + C.beatA;
      b.gain.length = 0; b.gain.push([tCut, 0], [tCut + C.beatA / 2, 1]);
      mark(plan, tCut, `${chordName(r.cA)} → ${chordName(r.cB)}`);
      const relTxt = r.rel.kind === 'same' ? `${T1} leaves on ${chordName(r.cA)} and ${T2} starts on ${chordName(r.cB)}: the harmony doesn't move at all across the switch.`
        : r.rel.kind === 'cadence' ? `${chordName(r.cA)} → ${chordName(r.cB)} is a V → I cadence, the strongest "arrival" move in Western harmony, so ${T2} sounds like where ${T1} was heading.`
        : r.rel.kind === 'plagal' ? `${chordName(r.cA)} → ${chordName(r.cB)} is a IV → I move (the "amen" at the end of hymns): a soft, settled arrival.`
        : `${chordName(r.cA)} and ${chordName(r.cB)} share two of their three notes, so the switch barely changes the harmony.`;
      const why = [relTxt];
      if (r.distant) why.push(r.pivot ? `The keys are far apart (${keyName(r.ka)} vs ${keyName(r.kb2)}, ${sharedNotes(r.ka, r.kb2)} of 7 notes shared), but ${chordName(r.cA)} belongs to both: it's the ${roman(r.cA, r.ka)} chord in ${keyName(r.ka)} and the ${roman(r.cA, r.kb2)} in ${keyName(r.kb2)}. Composers change key through a "pivot chord" like this so the listener doesn't feel a jolt.` : `The keys are far apart (${sharedNotes(r.ka, r.kb2)} of 7 notes shared), but the cadence pulls the ear into the new key.`);
      else why.push(keyWhy(r.ka, r.kb, r.s));
      why.push(C.beatmatch ? `With the tempos matched, a one-beat crossfade on the downbeat keeps the groove going.` : `The tempos differ, so make it a quick fade on the downbeat and let the new beat take over.`);
      out.push({
        ...lx, special: r.distant ? `The keys don't match, but one chord belongs to both: the switch happens there, the way composers change key, and lands ${T2}'s drop.` : `The harmony barely moves across the switch, so ${T2}'s drop sounds like where ${T1} was heading.`, tech: r.distant ? 'modulate' : 'chord', level: r.distant ? 3 : 2, cueA: r.o.t, cueB: r.i.t, sync: C.beatmatch ? 'match' : null, shift: r.s, plan, score: r.score,
        title: (r.distant ? (r.pivot ? `Modulate through ${chordName(r.cA)}: ${keyName(r.ka)} → ${keyName(r.kb2)}` : `Cadence across keys: ${chordName(r.cA)} → ${chordName(r.cB)}`) : `Switch on ${chordName(r.cA)} → ${chordName(r.cB)}`) + `, into ${T2}'s ${landName(r.i.L)}`,
        hook: r.distant && !r.pivot ? `The keys don't match, but ${T1}'s phrase ends on a chord that resolves straight into ${T2}'s first chord, so the ear hears an arrival instead of a clash.` : null,
        steps: [`Cue ${T2} at ${where(B, r.i.t)}, where its ${r.i.first ? 'opening' : secName(r.i.sec)} starts on ${chordName(r.cB0)}${r.s ? ` (${chordName(r.cB)} after the key shift)` : ''}.`, `${T1} ends its ${secName(r.o.prev)} on ${chordName(r.cA)} at ${where(A, r.o.t)}.`, `On that downbeat, crossfade over one beat: ${T2} in, ${T1} out.`],
        why, warn: r.distant ? ['Only the switch point agrees harmonically. Don\'t overlap the tracks for longer than a beat.'] : [], chips: [`${chordName(r.cA)} → ${chordName(r.cB)}`, r.rel.kind === 'cadence' ? 'V → I' : r.rel.kind === 'same' ? 'Same chord' : r.rel.kind === 'plagal' ? 'IV → I' : 'Shared notes']
      });
    }
    return out;
  }
  function genWormholes(C) {
    const { A, B, XS } = C;
    if (needGrid(C)) return needGrid(C);
    if (C.T.ease === 'none') return { skip: `The tempos are ${Math.abs(C.T.pct * 100).toFixed(0)}% apart, so even a perfect harmonic match would lurch at the switch.` };
    const K = 8, rate = C.T.ease === 'stretch' ? C.T.rate : C.rB, { X, nA, nB, mean, std } = XS, runs = [];
    for (let i = Math.floor(nA * 0.15); i < nA - K - 4; i++) for (let j = 8; j < nB - K * 2 - 8; j++) {
      let s = 0, ok = true;
      for (let k = 0; k < K; k++) { const v = X[(i + k) * nB + Math.round(j + k * rate)]; if (v < 0) { ok = false; break; } s += v; }
      if (!ok) continue;
      const z = (s / K - mean) / std; if (z > 2.2) runs.push({ i, j, z });
    }
    if (!runs.length) return { skip: 'No stretch of either song sounds close enough to the other to hide a switch.' };
    runs.sort((a, b) => b.z - a.z);
    const picks = [];
    for (const r of runs) { if (picks.length >= 2) break; if (picks.some(p => Math.abs(p.i - r.i) < 20 || Math.abs(p.j - r.j) < 20)) continue; picks.push(r); }
    return picks.map(r => {
      const tMid = (r.i + K / 2) * BLOCK, tA0 = snap(A, tMid), tBraw = (r.j + (tA0 / BLOCK - r.i) * rate) * BLOCK;
      // v7: move the jump to the nearest pair of phrase lines (within 2 bars) where both songs agree
      let tA = null, tB = null;
      for (let k = -2; k <= 2 && tA == null; k++) for (const kk of [k, -k]) { const a = tA0 + kk * barLen(A), b = snap(B, tBraw + kk * barLen(A) * rate); if (phraseAt(A, a) >= 1 && phraseAt(B, b) >= 1) { tA = a; tB = b; break; } }
      if (tA == null) return null;
      if (B.dur - tB < 10 * barLen(B)) return null;
      const sa = secAt(A, tA), sb = secAt(B, tB);
      const mid = Math.abs(tA - sa.t0) > 3 && Math.abs(tA - sa.t1) > 3;
      const { plan, tCut } = cutPlan(C, tA, tB, 6, 6); plan.decks[1].shift = C.K.shift;
      if (C.T.ease === 'stretch') plan.decks[1].clips[0].rate = rate;
      const a = plan.decks[0], b = plan.decks[1]; a.gain.length = 0; a.gain.push([0, 1], [tCut - 0.03, 1], [tCut + 0.03, 0]); a.clips[0].dur = tCut + 0.1; b.gain.length = 0; b.gain.push([tCut - 0.03, 0], [tCut + 0.03, 1]);
      mark(plan, tCut, 'Through the wormhole');
      const score = clamp(0.35 + (r.z - 2.2) / 3) * 0.6 + 0.25 * (C.beatmatch ? C.T.fit : 0.4) + (mid ? 0.15 : 0.05);
      return {
        tech: 'wormhole', special: `An invisible switch: for a few seconds the two songs sound almost identical, so the crowd doesn't hear the song change until it already has.`, cueA: tA, cueB: tB, sync: 'match', shift: C.K.shift, plan, score, map: { i: r.i, j: r.j, K },
        title: `Wormhole: ${T1} ${fmtTime(tA)} ↔ ${T2} ${fmtTime(tB)}`,
        steps: [`Cue ${T2} at ${where(B, tB)}, inside its ${secName(sb)}.`, `Play ${T1}. At ${where(A, tA)}${mid ? ', in the middle of its ' + secName(sa) : ''}, jump: start ${T2} and kill ${T1} on the same downbeat.`, `Keep both faders identical in level: the illusion depends on nothing else changing.`, `Try it the other way round too: jump back from ${T2} into ${T1} at the same points.`],
        why: [`For about ${K * BLOCK} seconds these two moments sound almost the same: notes, tone color and loudness together score ${r.z.toFixed(1)} standard deviations above a typical pair of moments from the two songs. It's the brightest diagonal in the "Where they sound alike" map below.`, mid ? `It's in the middle of a phrase in both songs, where nobody expects a change. That's what makes it surprising.` : `It sits near a section edge, so it's less surprising but safer.`, C.K.shift ? `Compared with ${T2} shifted ${semis(C.K.shift)} (key lock on), as it would be in the mix.` : `No key shift needed.`],
        warn: C.T.ease === 'stretch' ? [`${T2} has to run ${pctTxt(C.T.pct)} off its normal speed for this.`] : [], chips: [`${r.z.toFixed(1)}σ alike`]
      };
    }).filter(Boolean);
  }
  function genRide(C) {
    const { A, B, T } = C;
    if (needGrid(C)) return needGrid(C);
    if (T.pct == null || Math.abs(T.pct) <= 0.06) return { skip: 'The tempos are already close enough to simply match.' };
    if (Math.abs(T.pct) > 0.22) return { skip: `The tempos are ${Math.abs(T.pct * 100).toFixed(0)}% apart, too far even to ride.` };
    const bar = C.barA, R = 16, rA1 = (B.bpm / T.r) / A.bpm;
    let best = null;
    for (let i = 1; i < A.secs.length; i++) {
      const s = A.secs[i], t0 = s.t0; if (t0 < A.dur * 0.35 || A.dur - t0 < (R + 8) * bar) continue;
      const lk = lockIn(A, t0, t0 + R * bar), ka = keyAt(A, t0 + R * bar), kb = keyAt(B, firstBar(B) + 1);
      const score = 0.4 * clamp((1 - lk) / 0.6 + 0.3) + 0.3 * keyFit(ka, kb) + 0.3 * (1 - Math.abs(T.pct) / 0.22);
      if (!best || score > best.score) best = { s, t0, lk, ka, kb, score };
    }
    if (!best) return { skip: `${T1} has no stretch of ${R + 8} bars left to ride over.` };
    const L0 = landings(C).find(L => L.t - 8 * barLen(B) >= firstBar(B) - 0.1), tb = L0 ? L0.t - 8 * barLen(B) : firstBar(B), pre = 2 * bar, srcLen = R * bar, Tramp = srcLen * 2 / (1 + rA1), blendSrc = 8 * bar, blendDur = blendSrc / rA1;
    const plan = newPlan(pre + Tramp + blendDur + 2 * barLen(B)), a = plan.decks[0], b = plan.decks[1];
    clip(a, 0, best.t0 - pre, pre); clip(a, pre, best.t0, Tramp, 1, rA1); clip(a, pre + Tramp, best.t0 + srcLen, blendDur, rA1);
    a.keylock = false; const tIn = pre + Tramp, tSwap = tIn + blendDur / 2, tEnd = tIn + blendDur;
    clip(b, tIn, tb, plan.len - tIn, 1); eqBlend(a, b, tIn, tSwap, tEnd, C.beatA, 2 * barLen(B));
    const lx = L0 ? { land: tIn + 8 * barLen(B), landing: L0, tension: 0.7 } : {};
    mark(plan, pre, `Ride ${A.bpm.toFixed(0)} → ${(A.bpm * rA1).toFixed(0)} BPM`); mark(plan, tIn, 'Start Track 2'); mark(plan, tSwap, 'Swap the bass');
    const quiet = best.lk < 0.5;
    return [{
      ...lx, special: `${T1} glides to ${T2}'s tempo so slowly nobody hears it, and the two songs end up locked.`, tech: 'ride', cueA: best.t0, cueB: tb, sync: null, shift: 0, plan, score: best.score,
      title: `Ride ${T1} from ${A.bpm.toFixed(0)} to ${(A.bpm * rA1).toFixed(0)} BPM, then blend`,
      steps: [`At ${where(A, best.t0)}, in ${T1}'s ${secName(best.s)}, start moving ${T1}'s pitch fader slowly, about ${(Math.abs(rA1 - 1) * 100 / R).toFixed(1)}% per bar, with key lock on.`, `After ${R} bars ${T1} is at ${(A.bpm * rA1).toFixed(1)} BPM, ${T.r === 1 ? `${T2}'s natural tempo` : `which locks with ${T2}'s ${B.bpm.toFixed(1)} BPM at ${T.r > 1 ? 'double' : 'half'} time`}.`, `Start ${T2} from its first downbeat on the next bar and do a normal 8-bar blend with a bass swap.`],
      why: [`${A.bpm.toFixed(1)} and ${B.bpm.toFixed(1)} BPM are ${Math.abs(T.pct * 100).toFixed(0)}% apart${T.r !== 1 ? ' even counting half- and double-time' : ''}: too far to fix with one move of the pitch fader, but not too far to glide.`, quiet ? `${T1}'s ${secShort(best.s)} barely has a steady beat (locked only ${Math.round(best.lk * 100)}% of the time), so a listener has little to notice the tempo changing against.` : `A slow ride (${(Math.abs(rA1 - 1) * 100 / R).toFixed(1)}% per bar) is below what most listeners notice.`, `After the ride, ${T2} plays at its own tempo and ${T1} ends up ${pctTxt(rA1 - 1)} off its original.`],
      warn: [`The preview rides without key lock, so ${T1}'s pitch bends with the tempo. With key lock on, it stays put.`], chips: [`${pctTxt(rA1 - 1)} over ${R} bars`]
    }];
  }
  function genTrade(C) {
    const miss = needMatch(C); if (miss) return miss;
    const { A, B } = C, bar = C.barA, res = [];
    const hot = (P, s) => s.i > 0 && s.i < P.secs.length - 1 && s.mids > -4 && (s.role === 'chorus' || s.role === 'peak' || s.level > P.medLevel) && (s.t1 - s.t0) >= 7.5 * barLen(P);
    for (const sa of A.secs) if (hot(A, sa)) for (const sb of B.secs) if (hot(B, sb)) {
      const s = bestShift(C, sa.key, sb.key);
      const ag = chordAgreement(barChords(A, sa.t0, 8), barChords(B, sb.t0, 8), s);
      if (ag.frac < 0.6) continue;
      const score = 0.45 * ag.frac + 0.2 * C.T.fit + 0.2 * clamp(1 - Math.abs((sa.level - A.medLevel) - (sb.level - B.medLevel)) / 6) + 0.15 * clamp((sa.mids + sb.mids + 2) / 6);
      res.push({ sa, sb, s, ag, score });
    }
    if (!res.length) return { skip: 'No pair of high-energy sections has chords that agree bar by bar.' };
    res.sort((x, y) => y.score - x.score);
    const r = res[0], pre = 4 * bar, ex = 8 * bar;
    const plan = newPlan(pre + ex + barsB(C, 8)), a = plan.decks[0], b = plan.decks[1];
    clip(a, 0, r.sa.t0 - pre, pre + ex + 0.3); clip(b, pre, r.sb.t0, plan.len - pre, C.rB); b.shift = r.s;
    // bars 1–2 Track 1, 3–4 Track 2, 5–6 Track 1, 7–8 Track 2, then Track 2 stays
    const t2 = pre + 2 * bar, t4 = pre + 4 * bar, t6 = pre + 6 * bar, e = 0.012;
    a.gain.push([0, 1], [t2 - e, 1], [t2, 0], [t4 - e, 0], [t4, 1], [t6 - e, 1], [t6, 0]);
    b.gain.push([0, 0], [t2 - e, 0], [t2, 1], [t4 - e, 1], [t4, 0], [t6 - e, 0], [t6, 1]);
    mark(plan, pre, 'Trade starts'); mark(plan, pre + 6 * bar, 'Track 2 keeps it');
    return [{
      tech: 'trade', special: `Call and response between two songs: each 2-bar line is answered by the other track before ${T2} takes over.`, cueA: r.sa.t0, cueB: r.sb.t0, sync: 'match', shift: r.s, plan, score: r.score,
      title: `Trade 2-bar phrases: ${T1}'s ${secShort(r.sa)} vs ${T2}'s ${secShort(r.sb)}`,
      steps: [`Beatmatch ${T2} and start it on the same downbeat as ${T1}'s ${secName(r.sa)} (${where(A, r.sa.t0)}), cued at ${where(B, r.sb.t0)}, with its fader down.`, `Play 2 bars of ${T1}, then flick the crossfader to ${T2} for 2 bars, back to ${T1} for 2, then to ${T2}.`, `After 8 bars leave it on ${T2} and stop ${T1}.`],
      why: [`Bar by bar, the chords of the two sections agree in about ${Math.round(r.ag.frac * 8)} of 8 bars${r.s ? ` (with ${T2} shifted ${semis(r.s)})` : ''}, so every flick lands on compatible harmony.`, `Both are high-energy sections (${dB(r.sa.level - A.medLevel)} and ${dB(r.sb.level - B.medLevel)} against each song's typical level), so the trades sound like one conversation, not a volume jump.`, `Call and response, one line answered by another, is one of the oldest devices in music.`],
      warn: [], chips: ['2-bar trades']
    }];
  }

  /* ---------------- vocals: where they probably are, and a rough split for previews ----------------
     Lead vocals are usually mixed dead center, are pitched (harmonic, not noisy like drums) and come
     and go in syllables. This looks for exactly that in the stereo signal: sound that is identical in
     both channels, sits between 150 Hz and 8 kHz, is sustained across time rather than across
     frequency (harmonic vs percussive median filtering), and fluctuates at speech-like rates.
     Centered synth leads trip it too, so the UI calls it "likely vocals or lead". Real stem separation
     (a neural network) is what DJ software uses; this is the single-file approximation. */
  const fftCache = {};
  function fftC(re, im) {
    const n = re.length;
    let T = fftCache[n];
    if (!T) {
      const lv = Math.round(Math.log2(n)), rev = new Uint32Array(n);
      for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < lv; b++) r |= ((i >> b) & 1) << (lv - 1 - b); rev[i] = r; }
      const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = -Math.sin(2 * Math.PI * i / n); }
      T = fftCache[n] = { rev, cs, sn };
    }
    const { rev, cs, sn } = T;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, tr = re[b] * cs[k] - im[b] * sn[k], ti = re[b] * sn[k] + im[b] * cs[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  /* ---------------- rhythm & harmony straight from the audio (v6) ----------------
     The engine's onset curve is full-band and its low bands update every 4th frame, which is too coarse
     to tell a kick from an off-beat bass or hi-hat. For the mix grid we need to know WHERE the kick is,
     to the millisecond, so this pass filters the decoded audio itself into three bands and measures
     when each band's energy jumps (onsets), every ~5.8 ms. It also measures chroma every ~46 ms for
     beat-by-beat harmony, and the song's loudness in LUFS (ITU-R BS.1770 K-weighting with gating),
     which is what loudness matching between two tracks should use. */
  function biquad(x, type, f, sr, Q = Math.SQRT1_2) {
    const w = 2 * Math.PI * f / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Q);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; } else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
    for (let i = 0; i < x.length; i++) { const v = B0 * x[i] + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  function kWeightedLufs(L, R, sr) {
    // BS.1770: a high shelf (+4 dB above ~1.7 kHz) and a high-pass at ~38 Hz, 400 ms blocks, absolute and relative gates
    const shelf = (x) => { const f0 = 1681.97, G = 3.99984, Q = 0.7071752, K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
      const a0 = 1 + K / Q + K * K, b0 = (Vh + Vb * K / Q + K * K) / a0, b1 = 2 * (K * K - Vh) / a0, b2 = (Vh - Vb * K / Q + K * K) / a0, a1 = 2 * (K * K - 1) / a0, a2 = (1 - K / Q + K * K) / a0;
      const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
    const kw = (x) => biquad(shelf(x), 'hp', 38.1, sr, 0.5);
    const a = kw(L), b = R === L ? a : kw(R), blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
    for (let s = 0; s + blk <= a.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += a[i] * a[i] + b[i] * b[i]; z.push(e / blk); }
    const lk = (m) => -0.691 + 10 * Math.log10(m + 1e-20);
    const g1 = z.filter(m => lk(m) > -70); if (!g1.length) return -70;
    const rel = lk(g1.reduce((x, y) => x + y, 0) / g1.length) - 10, g2 = g1.filter(m => lk(m) > rel);
    return lk(g2.reduce((x, y) => x + y, 0) / Math.max(1, g2.length));
  }
  function audioFeatures(L, R, sr) {
    const D = Math.max(1, Math.round(sr / 22050)), sd = sr / D, n = Math.floor(L.length / D), x = new Float32Array(n);
    for (let k = 0; k < n; k++) { let a = 0; for (let j = 0; j < D; j++) a += L[k * D + j] + R[k * D + j]; x[k] = a / (2 * D); }
    const hopS = 128, hop = hopS / sd, F = Math.floor(n / hopS);
    // band signals (4th-order Butterworth edges)
    const kickS = biquad(biquad(x, 'lp', 130, sd), 'lp', 130, sd);
    const snrS = biquad(biquad(biquad(biquad(x, 'hp', 1500, sd), 'hp', 1500, sd), 'lp', 6000, sd), 'lp', 6000, sd);
    const midS = biquad(biquad(biquad(biquad(x, 'hp', 150, sd), 'hp', 150, sd), 'lp', 1500, sd), 'lp', 1500, sd);
    const env = (s) => { const e = new Float32Array(F); for (let f = 0; f < F; f++) { let v = 0; for (let i = f * hopS; i < (f + 1) * hopS; i++) v += s[i] * s[i]; e[f] = v / hopS; } return e; };
    const flux = (e) => { let mx = 0; for (const v of e) if (v > mx) mx = v; const g = 1000 / (mx + 1e-12), o = new Float32Array(F), lg = new Float32Array(F);
      for (let f = 0; f < F; f++) lg[f] = Math.log1p(g * e[f]);
      for (let f = 2; f < F; f++) { const d = lg[f] - Math.max(lg[f - 1], lg[f - 2]); o[f] = d > 0 ? d : 0; } return o; };
    const eLo = env(kickS), eMid = env(midS), eHi = env(snrS);   // band energies also draw the 3-band waveforms
    const kick = flux(eLo), snare = flux(eHi), mid = flux(eMid), all = new Float32Array(F);
    for (let f = 0; f < F; f++) all[f] = kick[f] + mid[f] + snare[f];
    // chroma every ~46 ms (4096-point FFT at ~22 kHz, spectral peaks folded into 12 pitch classes, like the engine)
    const N = 4096, ch = 1024, F2 = Math.max(0, Math.floor((n - N) / ch) + 1), chroma = new Float32Array(F2 * 12), re = new Float64Array(N), im = new Float64Array(N);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const k1 = Math.round(60 * N / sd), k2 = Math.round(3000 * N / sd), mag = new Float64Array(N / 2);
    for (let f = 0; f < F2; f++) {
      for (let i = 0; i < N; i++) { re[i] = x[f * ch + i] * win[i]; im[i] = 0; }
      fftC(re, im);
      let mx = 0; for (let k = k1 - 1; k <= k2 + 1; k++) { mag[k] = Math.hypot(re[k], im[k]); if (k >= k1 && k <= k2 && mag[k] > mx) mx = mag[k]; }
      if (mx <= 0) continue;
      for (let k = k1; k <= k2; k++) {
        const a = mag[k]; if (a < mx * 0.02 || a < mag[k - 1] || a < mag[k + 1]) continue;
        const la = Math.log(mag[k - 1] + 1e-12), lb = Math.log(a + 1e-12), lc = Math.log(mag[k + 1] + 1e-12), den = la - 2 * lb + lc, d = den !== 0 ? 0.5 * (la - lc) / den : 0;
        const fr = (k + d) * sd / N, pc = mod(Math.round(69 + 12 * Math.log2(fr / 440)), 12);
        chroma[f * 12 + pc] += a * (fr < 1000 ? 1 : 1000 / fr);
      }
    }
    return { hop, F, kick, snare, mid, all, eLo, eMid, eHi, chHop: ch / sd, chN: N / sd, F2, chroma, lufs: kWeightedLufs(L, R, sr) };
  }
  // mean of an onset curve sampled at times ts (seconds), with a small window so ±1 hop jitter doesn't matter
  function envAt(A, hop, t) { const f = t / hop, i = Math.floor(f); if (i < 1 || i >= A.length - 2) return 0; const u = f - i; return Math.max(A[i] * (1 - u) + A[i + 1] * u, 0.6 * Math.max(A[i - 1], A[i + 2])); }
  // chroma averaged over [t0, t1)
  function chromaIn(feat, t0, t1) {
    const out = new Float64Array(12), a = Math.max(0, Math.floor((t0 - feat.chN / 2) / feat.chHop)), b = Math.min(feat.F2, Math.ceil((t1 - feat.chN / 2) / feat.chHop));
    for (let f = a; f < b; f++) for (let p = 0; p < 12; p++) out[p] += feat.chroma[f * 12 + p];
    return out;
  }
  const cosSim = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na > 0 && nb > 0 ? s / Math.sqrt(na * nb) : 1; };

  function med9(a) { for (let i = 1; i < 9; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; } return a[4]; }
  // harmonic share of each band cell: median across time (sustained) vs median across frequency (clicks, hits)
  function harmonicMask(X, F, B, out) {
    const col = new Float32Array(9), row = new Float32Array(9);
    for (let f = 0; f < F; f++) for (let b = 0; b < B; b++) {
      if (X[f * B + b] <= 0) { out[f * B + b] = 0; continue; }
      for (let k = -4; k <= 4; k++) { const ff = Math.min(F - 1, Math.max(0, f + k)), bb = Math.min(B - 1, Math.max(0, b + k)); col[k + 4] = X[ff * B + b]; row[k + 4] = X[f * B + bb]; }
      const H = med9(col), P = med9(row);
      out[f * B + b] = H * H / (H * H + P * P + 1e-12);
    }
  }
  // per 0.5 s block: how likely a lead vocal (or centered lead) is there, 0..1
  function vocalMap(L, R, sr, nB) {
    const D = sr >= 32000 ? 2 : 1, sd = sr / D, N = 1024, hop = 512, binHz = sd / N;
    const n = Math.floor(L.length / D), m = new Float32Array(n), s = new Float32Array(n);
    for (let k = 0; k < n; k++) { let a = 0, c = 0; for (let j = 0; j < D; j++) { a += L[k * D + j]; c += R[k * D + j]; } a /= D; c /= D; m[k] = 0.5 * (a + c); s[k] = 0.5 * (a - c); }
    const lo = Math.max(1, Math.round(250 / binHz)), hi = Math.min(N / 2 - 1, Math.round(4000 / binHz)), B = hi - lo + 1;
    const t1 = Math.round(60 / binHz), t2 = Math.min(N / 2 - 1, Math.round(8000 / binHz));
    const F = Math.max(1, Math.floor((n - N) / hop) + 1), X = new Float32Array(F * B), tot = new Float64Array(F);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const re = new Float64Array(N), im = new Float64Array(N);
    let sumM = 0, sumS = 0;
    for (let f = 0; f < F; f++) {
      const o = f * hop;
      for (let i = 0; i < N; i++) { re[i] = m[o + i] * win[i]; im[i] = s[o + i] * win[i]; }
      fftC(re, im);   // one FFT carries both: mid in the real part, side in the imaginary part
      let t = 0;
      for (let k = t1; k <= t2; k++) {
        const rk = re[k], ik = im[k], rn = re[N - k], inn = im[N - k];
        const mr = 0.5 * (rk + rn), mi = 0.5 * (ik - inn), sr_ = 0.5 * (ik + inn), si = -0.5 * (rk - rn);
        const M2 = mr * mr + mi * mi, S2 = sr_ * sr_ + si * si;
        t += M2 + S2; sumM += M2; sumS += S2;
        if (k >= lo && k <= hi) { const w = M2 / (M2 + S2 + 1e-12), c = clamp((w - 0.6) / 0.35); X[f * B + k - lo] = Math.sqrt(M2) * c; }
      }
      tot[f] = t;
    }
    const mono = sumS < 0.003 * sumM;
    const Hm = new Float32Array(F * B); harmonicMask(X, F, B, Hm);
    const e = new Float64Array(F);
    for (let f = 0; f < F; f++) { let v = 0; for (let b = 0; b < B; b++) { const x = X[f * B + b] * Hm[f * B + b]; v += x * x; } e[f] = v; }
    // per block: share of the energy that is centered + harmonic + mid-band, how loud that part is, and how much it
    // fluctuates (syllables). Loudness is judged against this song's own strongest such moments, so a quiet
    // centered pad in an intro doesn't read as a singer.
    const fpb = BLOCK * sd / hop, share = new Float32Array(nB), mod = new Float32Array(nB), lvl = new Float32Array(nB).fill(-200), tl = new Float32Array(nB).fill(-200);
    for (let b = 0; b < nB; b++) {
      const f0 = Math.floor((b - 0.5) * fpb), f1 = Math.min(F, Math.ceil((b + 1.5) * fpb));
      let se = 0, st = 0, a = 0, a2 = 0, c = 0;
      for (let f = Math.max(0, f0); f < f1; f++) { se += e[f]; st += tot[f]; const env = Math.sqrt(e[f]); a += env; a2 += env * env; c++; }
      if (!c) continue;
      const mean = a / c, sd_ = Math.sqrt(Math.max(0, a2 / c - mean * mean));
      share[b] = st > 0 ? se / st : 0; mod[b] = mean > 0 ? sd_ / mean : 0; lvl[b] = 10 * Math.log10(se / c + 1e-20); tl[b] = 10 * Math.log10(st / c + 1e-20);
    }
    const p90 = (arr) => { const a = Array.from(arr).filter(x => x > -199).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length * 0.9)] : 0; };
    const vTop = p90(lvl), tTop = p90(tl), v = new Float32Array(nB);
    // it must be a real share of the sound, loud against this song's other vocal-like moments, and loud in absolute terms
    for (let b = 0; b < nB; b++) v[b] = clamp(share[b] / 0.06) * clamp((lvl[b] - (vTop - 16)) / 10) * clamp((lvl[b] - (tTop - 24)) / 8) * (0.5 + 0.5 * clamp(mod[b] / 0.5));
    // light smoothing across blocks
    const out = new Float32Array(nB); for (let b = 0; b < nB; b++) { let x = 0, w = 0; for (let k = -1; k <= 1; k++) { const j = b + k; if (j < 0 || j >= nB) continue; const ww = k ? 0.5 : 1; x += v[j] * ww; w += ww; } out[b] = x / w; }
    // the same measurement every ~23 ms, for decisions that need to hear where a vocal line starts and ends
    const lf = new Float32Array(F); for (let f = 0; f < F; f++) lf[f] = 10 * Math.log10(e[f] + 1e-20);
    const fTop = p90(lf.filter((_, f) => tot[f] > 0)), fine = new Float32Array(F);
    // gated by the block map, so a song without a singer (its centered synth lead still peaks here) stays near zero
    for (let f = 0; f < F; f++) { const b = Math.min(nB - 1, Math.floor(f * hop / sd / BLOCK)); fine[f] = clamp((lf[f] - (fTop - 15)) / 12) * clamp((tot[f] > 0 ? e[f] / tot[f] : 0) / 0.03) * clamp(out[b] / 0.35); }
    return { v: out, share, mod, mono, fine, fineHop: hop / sd };
  }
  /* ---------------- time-stretch (WSOLA) for key-locked previews ---------------- */
  // speed > 1 plays faster with the pitch unchanged
  function timeStretch(chs, speed, sr) {
    const N = Math.max(256, Math.round(sr * 0.046) & ~1), Hs = N >> 1, tol = Math.round(sr * 0.009);
    const x = chs[0], y = chs[1] || chs[0], inLen = x.length, outLen = Math.max(0, Math.floor(inLen / speed));
    const out = chs.map(() => new Float32Array(outLen + N));
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const mono = (i) => i >= 0 && i < inLen ? x[i] + y[i] : 0;
    let prev = 0;
    for (let k = 0; ; k++) {
      const op = k * Hs; if (op >= outLen) break;
      let pos = Math.round(op * speed);
      if (k > 0) {
        const nat = prev + Hs; let bestD = 0, bestC = -Infinity;
        const corr = (d) => { let c = 0; for (let i = 0; i < Hs; i += 4) c += mono(nat + i) * mono(pos + d + i); return c; };
        for (let d = -tol; d <= tol; d += 4) { const c = corr(d); if (c > bestC) { bestC = c; bestD = d; } }
        for (let d = bestD - 3; d <= bestD + 3; d++) { const c = corr(d); if (c > bestC) { bestC = c; bestD = d; } }
        pos += bestD;
      }
      pos = Math.max(0, Math.min(inLen - 1, pos));
      for (let c = 0; c < chs.length; c++) { const src = chs[c], o = out[c]; for (let i = 0; i < N && pos + i < inLen; i++) o[op + i] += src[pos + i] * win[i]; }
      prev = pos;
    }
    return out.map(o => o.subarray(0, outLen));
  }

  return {
    profile, fitGrid, match, vocalMap, keyRelation, camelot, sharedNotes, transposeKey, diatonic, roman, chordNotes, timeStretch, songTime,
    TECH, LEVEL_NAME, SOUND_FLOOR, floorOf, secName, secShort, where, barNo, firstBar, secAt, energy, chordAt, phraseAt, audioFeatures, kWeightedLufs, envVal,
    _internal: { nearestIn, tempoRelation, crossSim, landings, launches, soundCheck, finish, gens: () => ({ blend: genBlend, riser: genRiser, cut: genCut, echo: genEcho, brake: genBrake, swap: genSwap, double: genDouble, roll: genRoll, spin: genSpin, wash: genWash, lift: genLift, layer: genLayer, chord: genChords, halftime: genHalftime, accel: genAccel, fakeout: genFakeout, escalator: genEscalator, hijack: genHijack, wormhole: genWormholes, keylock: genKeylock, ride: genRide, trade: genTrade }) }
  };
})();
if (typeof module !== 'undefined') module.exports = AnatomyMix;

