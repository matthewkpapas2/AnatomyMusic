/* Runs inside the Anatomy page (served with ?debug, which exposes window.__mx).
   window.__measureIdea(level, index) renders one suggested idea three times through the page's own preview
   renderer (renderPlan: trim, kill EQ, filters, echo and reverb sends, the limiter): the mix, Track 1 alone and
   Track 2 alone, then measures what you'd hear. Nothing here changes the page.

   Measurements (50 ms frames unless noted):
   - phaseMs       beat alignment where both tracks are audible and rhythmic: each solo's onset envelope (10 ms)
                   folded onto Track 2's 16th-note grid (kicks, snares and hats all land on it, so they reinforce
                   instead of cancelling, which they did on an 8th-note grid); the circular-mean offset between the
                   two (ms). Blind to whole-16th slips. null when either track isn't rhythmic enough to tell.
   - twoBass       seconds where both solos' lows (< 120 Hz) are within 6 dB of their own full level.
   - bothFull      seconds where both solos are within 3 dB of their own full level.
   - vocalClash    seconds where both tracks are singing (the profile's vocal curve at each deck's song time
                   > 0.35) and both are audible in the vocal band (within 10 dB of their own level).
   - hardCuts      clip ends where the singer keeps going in the song but the deck's vocal band falls > 12 dB
                   within 0.3 s, i.e. a word you hear chopped off.
   - fxCuts        the same, but an echo or reverb tail keeps the level up (the paper check's 30% case).
   - midLine       clip starts that come in while the singer is mid-line.
   - dead          longest run with the mix > 20 dB under its own median (s).
   - lufsBefore / lufsAfter  integrated loudness of the first and last 8 s of the plan; step = after - before.
   - peak          dBFS.
   - landJump      low-band dB in the bar after the planned landing minus the bar before (the "drop hits").
   - arriveJump    the same around the moment Track 2's bass actually reaches its full level. */
(() => {
  const HOP = 0.05;
  const M = AnatomyMix;   // a top-level const in web/js/mix.js: shared global scope, not a window property
  const db = (x) => 10 * Math.log10(x + 1e-12);
  const pctl = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : -120; };

  function onePole(x, sr, fc, high) {
    const a = Math.exp(-2 * Math.PI * fc / sr), y = new Float32Array(x.length); let s = 0;
    for (let i = 0; i < x.length; i++) { s = (1 - a) * x[i] + a * s; y[i] = high ? x[i] - s : s; }
    return y;
  }
  function frames(x, sr, hop = HOP) {
    const n = Math.round(hop * sr), F = Math.floor(x.length / n), out = new Float32Array(F);
    for (let f = 0; f < F; f++) { let e = 0; for (let i = f * n; i < (f + 1) * n; i++) e += x[i] * x[i]; out[f] = db(e / n); }
    return out;
  }
  function envs(buf) {
    const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), m = new Float32Array(L.length);
    for (let i = 0; i < m.length; i++) m[i] = 0.5 * (L[i] + R[i]);
    const lo = onePole(onePole(m, sr, 120), sr, 120);
    const mid = onePole(onePole(m, sr, 300, true), sr, 3000);
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    return { sr, L, R, full: frames(m, sr), lo: frames(lo, sr), mid: frames(mid, sr), on: frames(m, sr, 0.01), peak: 20 * Math.log10(peak + 1e-12) };
  }
  const vocAt = (P, st) => { if (st == null || !P.vocF) return 0; const k = Math.floor(st / P.vocF.hop); return k >= 0 && k < P.vocF.v.length ? P.vocF.v[k] : 0; };
  const vocMean = (P, a, b) => { if (!P.vocF) return 0; let s = 0, n = 0; for (let t = a; t < b; t += P.vocF.hop) { s += vocAt(P, t); n++; } return n ? s / n : 0; };
  const meanDb = (env, t0, t1, hop = HOP) => { const a = Math.max(0, Math.floor(t0 / hop)), b = Math.min(env.length, Math.ceil(t1 / hop)); let e = 0; for (let f = a; f < b; f++) e += Math.pow(10, env[f] / 10); return b > a ? db(e / (b - a)) : -120; };
  const lufs = (E, t0, t1) => { const a = Math.max(0, Math.floor(t0 * E.sr)), b = Math.min(E.L.length, Math.floor(t1 * E.sr)); return b - a > E.sr ? M.kWeightedLufs(E.L.subarray(a, b), E.R.subarray(a, b), E.sr) : null; };

  function soloPlan(plan, keep) {
    const p = structuredClone(plan);
    p.decks[1 - keep].clips = [];
    return p;
  }

  // circular-mean phase of an onset envelope on a grid of period T (s); returns { phase, strength }
  function gridPhase(on, t0, t1, T) {
    let c = 0, s = 0, w = 0;
    for (let f = Math.max(1, Math.floor(t0 / 0.01)); f < Math.min(on.length, Math.floor(t1 / 0.01)); f++) {
      const rise = on[f] - on[f - 1], d = rise > 3 ? rise : 0; if (!d) continue;   // rises > 3 dB in 10 ms: hits, not sustained sound
      const a = 2 * Math.PI * ((f * 0.01) % T) / T; c += d * Math.cos(a); s += d * Math.sin(a); w += d;
    }
    return w ? { phase: Math.atan2(s, c), strength: Math.hypot(c, s) / w } : { phase: 0, strength: 0 };
  }

  async function measure(idea, C) {
    const plan = idea.plan, mx = window.__mx;
    const [mixB, aB, bB] = [await mx.renderPlan(plan), await mx.renderPlan(soloPlan(plan, 0)), await mx.renderPlan(soloPlan(plan, 1))];
    const X = envs(mixB), A = envs(aB), B = envs(bB), P = [C.A, C.B], S = [A, B], len = plan.len;
    const F = Math.min(X.full.length, A.full.length, B.full.length, Math.floor(len / HOP));
    const playing = (k, t) => M.songTime(plan.decks[k], t) != null && M.envVal(plan.decks[k].gain, t, 1) > 0.05;
    const ref = S.map((E, k) => {
      const fr = []; for (let f = 0; f < F; f++) if (playing(k, f * HOP)) fr.push(f);
      return { lo: pctl(fr.map((f) => E.lo[f]), 0.9), full: pctl(fr.map((f) => E.full[f]), 0.9), mid: pctl(fr.map((f) => E.mid[f]), 0.9) };
    });
    let twoBass = 0, bothFull = 0, vocalClash = 0, bothOn = [];
    for (let f = 0; f < F; f++) {
      const t = f * HOP;
      if (A.lo[f] >= ref[0].lo - 6 && B.lo[f] >= ref[1].lo - 6) twoBass += HOP;
      const fullA = A.full[f] >= ref[0].full - 3, fullB = B.full[f] >= ref[1].full - 3;
      if (fullA && fullB) bothFull += HOP;
      // audible: within 20 dB of its own full level (a deck brought in highs-only sits 10-15 dB under its full level)
      const audA = A.full[f] >= ref[0].full - 20, audB = B.full[f] >= ref[1].full - 20;
      if (audA && audB) bothOn.push(t);
      const sing = [0, 1].map((k) => vocAt(P[k], M.songTime(plan.decks[k], t)) > 0.35 && S[k].mid[f] >= ref[k].mid - 10);
      if (sing[0] && sing[1]) vocalClash += HOP;
    }
    // cut words and mid-line entries, per deck clip edge
    let hardCuts = 0, fxCuts = 0, midLine = 0;
    for (let k = 0; k < 2; k++) {
      const d = plan.decks[k], clips = d.clips.slice().sort((x, y) => x.at - y.at);
      clips.forEach((c, i) => {
        const end = c.at + c.dur, nxt = clips[i + 1], joined = nxt && Math.abs(nxt.at - end) < 0.01;
        const stEnd = M.songTime(d, end - 0.001);
        if (!joined && end < len - 0.5 && stEnd != null && M.envVal(d.gain, end - 0.05, 1) > 0.3) {
          const goesOn = vocMean(P[k], stEnd + 0.03, stEnd + 0.4) > 0.3, audible = meanDb(S[k].mid, end - 0.3, end - 0.05) >= ref[k].mid - 12;
          if (goesOn && audible) { if (meanDb(S[k].mid, end + 0.1, end + 0.35) < meanDb(S[k].mid, end - 0.3, end - 0.05) - 12) hardCuts++; else fxCuts++; }
        }
        const prev = clips[i - 1], joinedIn = prev && Math.abs(prev.at + prev.dur - c.at) < 0.01;
        if (!joinedIn && c.at > 0.2 && M.envVal(d.gain, c.at + 0.05, 1) > 0.3 && vocMean(P[k], c.from - 0.4, c.from - 0.03) > 0.3 && vocMean(P[k], c.from, c.from + 0.3) > 0.3) midLine++;
      });
    }
    // dead air
    const med = pctl(Array.from(X.full.subarray(0, F)), 0.5); let dead = 0, run = 0;
    for (let f = Math.floor(0.3 / HOP); f < F - Math.floor(0.3 / HOP); f++) { if (X.full[f] < med - 20) { run += HOP; dead = Math.max(dead, run); } else run = 0; }
    // loudness before / after
    const lufsBefore = lufs(X, 0, Math.min(8, len / 3)), lufsAfter = lufs(X, Math.max(len - 8, 2 * len / 3), len);
    // bass jumps
    const barB = C.B.grid ? C.B.grid.bar / (C.rB || 1) : 2;
    const landJump = idea.land != null ? meanDb(X.lo, idea.land, idea.land + barB) - meanDb(X.lo, idea.land - barB, idea.land) : null;
    let arrive = null; for (let f = 0; f < F; f++) if (B.lo[f] >= ref[1].lo - 6) { arrive = f * HOP; break; }
    const arriveJump = arrive != null && arrive > barB ? meanDb(X.lo, arrive, arrive + barB) - meanDb(X.lo, arrive - barB, arrive) : null;
    // beat phase over the overlap, on Track 2's 8th-note grid in preview time
    let phaseMs = null, phaseFit = null;
    if (bothOn.length * HOP >= 2 && C.B.grid) {
      const clipB = plan.decks[1].clips.find((c) => c.at <= bothOn[0] + 0.01 && c.at + c.dur > bothOn[0]) || plan.decks[1].clips[0];
      const T = (C.B.grid.beat / ((clipB && clipB.rate) || 1)) / 4, t0 = bothOn[0], t1 = bothOn[bothOn.length - 1] + HOP;
      const pa = gridPhase(A.on, t0, t1, T), pb = gridPhase(B.on, t0, t1, T);
      phaseFit = [pa.strength, pb.strength, t0, t1];
      if (pa.strength > 0.25 && pb.strength > 0.25) { let d = pa.phase - pb.phase; d = Math.atan2(Math.sin(d), Math.cos(d)); phaseMs = Math.abs(d) / (2 * Math.PI) * T * 1000; }
    }
    return { overlap: bothOn.length * HOP, phaseMs, phaseFit, twoBass, bothFull, vocalClash, hardCuts, fxCuts, midLine, dead, lufsBefore, lufsAfter, step: lufsBefore != null && lufsAfter != null ? lufsAfter - lufsBefore : null, peak: X.peak, landJump, arriveJump };
  }

  // The harness score (0-100). Rebuilt for the repo on 2026-10-08: the v7 session's meas_page.js scoring rule was not
  // recovered, so this is a new, documented rule (docs/testing.md) and its numbers are not comparable one-for-one with v7's.
  function score(m) {
    let s = 100; const why = [];
    const pen = (v, txt) => { if (v > 0.05) { s -= v; why.push(`${txt} (−${Math.round(v)})`); } };
    if (m.phaseMs != null) pen(Math.min(40, Math.max(0, m.phaseMs - 10) * 1.5), `beats ${Math.round(m.phaseMs)} ms apart`);
    pen(8 * m.twoBass, `${m.twoBass.toFixed(1)} s of two basslines`);
    pen(10 * m.vocalClash, `${m.vocalClash.toFixed(1)} s of two singers`);
    pen(12 * m.hardCuts, `${m.hardCuts} word(s) chopped`);
    pen(4 * m.midLine, `${m.midLine} entry(ies) mid-line`);
    pen(30 * Math.max(0, m.dead - 0.5), `${m.dead.toFixed(1)} s of dead air`);
    if (m.step != null) { pen(5 * Math.max(0, -m.step - 1), `lands ${(-m.step).toFixed(1)} LU quieter`); pen(5 * Math.max(0, m.step - 6), `jumps ${m.step.toFixed(1)} LU louder`); }
    if (m.peak > -0.3) pen(10, `peaks at ${m.peak.toFixed(1)} dBFS`);
    pen(3 * Math.max(0, m.bothFull - 4), `${m.bothFull.toFixed(1)} s of both songs at full level`);
    if (m.landJump != null) pen(3 * Math.max(0, 3 - m.landJump), `the drop only adds ${m.landJump.toFixed(1)} dB of bass`);
    return { score: Math.max(0, Math.round(s)), why };
  }

  window.__measureIdea = async (level, i) => {
    const r = window.__mx.result, x = r.byLevel[level][i];
    const m = await measure(x, { A: r.A, B: r.B, rB: r.rB });
    return { level, rank: x.rank, tech: x.tech, name: x.name, cueA: x.cueA, cueB: x.cueB, land: x.land, landing: x.landing ? x.landing.kind : null, paper: Math.round(x.check.total * 100), payoff: Math.round(x.payoff * 100), ideaScore: Math.round(x.score * 100), m, ...score(m) };
  };
})();
