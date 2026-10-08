/* ============================================================
   DEMO SONGS — deterministic synth tracks with known answers.
   Song 'a' (the main demo): 122 BPM, A minor, intro / verse /
   chorus / verse / build / one beat of silence / final chorus up
   a whole step (B minor).
   Song 'b' (the Mix tab's second demo): 126 BPM, E minor, a
   DJ-friendly drums-only intro and outro, two build → drop pairs
   and a beatless breakdown between them.
   ============================================================ */
const AnatomyDemo = (() => {
  'use strict';
  // name -> [root pitch class, quality] (0 = major, 1 = minor)
  const CH = { Am: [9, 1], F: [5, 0], C: [0, 0], G: [7, 0], E: [4, 0], A: [9, 0], D: [2, 0], Bm: [11, 1], 'F#': [6, 0], Em: [4, 1], B: [11, 0] };
  const SONGS = {
    a: {
      bpm: 122, seed: 7, gaps: [5], hookShape: 'square',
      sections: [
        { name: 'Intro', bars: 4, prog: ['Am', 'F', 'C', 'G'], kind: 'intro' },
        { name: 'Verse', bars: 8, prog: ['Am', 'F', 'C', 'G'], kind: 'verse' },
        { name: 'Chorus', bars: 8, prog: ['F', 'G', 'C', 'Am'], kind: 'chorus' },
        { name: 'Verse', bars: 8, prog: ['Am', 'F', 'C', 'G'], kind: 'verse' },
        { name: 'Build', bars: 4, prog: ['F', 'G', 'Am', 'E'], kind: 'build' },
        { name: 'Final chorus', bars: 8, prog: ['G', 'A', 'D', 'Bm'], kind: 'chorus', up: 2 },
        { name: 'Outro', bars: 2, prog: ['Bm'], kind: 'outro' }
      ],
      // chorus hook, as [beat offset within a 2-bar phrase, midi, length in beats]
      hook: [[0, 69, 1], [1, 72, 1], [2, 76, 1.5], [3.5, 74, 0.5], [4, 74, 1], [5, 71, 1], [6, 72, 1.5], [7.5, 69, 0.5]],
      key: 'A minor → B minor'
    },
    b: {
      bpm: 126, seed: 23, gaps: [3, 6], hookShape: 'saw',
      sections: [
        { name: 'Intro', bars: 8, prog: ['Em', 'C', 'G', 'D'], kind: 'beatintro' },
        { name: 'Verse', bars: 8, prog: ['Em', 'C', 'G', 'D'], kind: 'verse' },
        { name: 'Build', bars: 4, prog: ['C', 'D', 'Em', 'B'], kind: 'build' },
        { name: 'Drop', bars: 8, prog: ['C', 'D', 'Em', 'Em'], kind: 'chorus' },
        { name: 'Breakdown', bars: 8, prog: ['C', 'G', 'D', 'Em'], kind: 'breakdown' },
        { name: 'Build', bars: 4, prog: ['C', 'D', 'Em', 'B'], kind: 'build' },
        { name: 'Drop', bars: 8, prog: ['C', 'D', 'Em', 'Em'], kind: 'chorus' },
        { name: 'Outro', bars: 8, prog: ['Em', 'C', 'G', 'D'], kind: 'beatoutro' }
      ],
      hook: [[0, 76, 1], [1, 79, 0.5], [1.5, 78, 0.5], [2, 76, 1], [3, 74, 1], [4, 71, 1.5], [5.5, 74, 0.5], [6, 76, 2]],
      // a synthesized "singer": centered, with vibrato and syllable-length notes, in the verse and both drops
      sing: { verse: [[0, 64, 0.75], [1, 67, 0.75], [2, 71, 1.4], [4, 69, 0.75], [5, 67, 0.75], [6, 66, 1.4]], chorus: [[0, 71, 0.75], [1, 74, 0.75], [2, 76, 1.4], [4, 74, 0.6], [4.75, 71, 0.6], [5.5, 69, 0.4], [6, 71, 1.6]] },
      key: 'E minor'
    }
  };
  const BPM = SONGS.a.bpm;

  function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function layout(song) {
    const BAR = 4 * (60 / song.bpm);
    let bar = 0; const out = [];
    for (const s of song.sections) { out.push({ ...s, bar0: bar, t0: bar * BAR, t1: (bar + s.bars) * BAR }); bar += s.bars; }
    return out;
  }

  function render(sr, id) {
    const song = SONGS[id] || SONGS.a;
    const BEAT = 60 / song.bpm, BAR = 4 * BEAT, HOOK = song.hook;
    const secs = layout(song);
    const totalBars = secs[secs.length - 1].bar0 + secs[secs.length - 1].bars;
    const gaps = song.gaps.map(k => ({ start: secs[k].bar0 * BAR - BEAT, end: secs[k].bar0 * BAR }));
    const dur = totalBars * BAR + 1.5;
    const n = Math.ceil(dur * sr);
    const L = new Float32Array(n), R = new Float32Array(n);
    const rnd = mulberry(song.seed);
    const add = (buf, i, v) => { if (i >= 0 && i < n) buf[i] += v; };

    // ---- drums ----
    const kick = (t, g) => { const i0 = Math.round(t * sr); let ph = 0; for (let k = 0; k < 0.35 * sr; k++) { const dt = k / sr; ph += 2 * Math.PI * (48 + 110 * Math.exp(-dt * 28)) / sr; const v = g * Math.sin(ph) * Math.exp(-dt * 8); add(L, i0 + k, v); add(R, i0 + k, v); } };
    const snare = (t, g) => { const i0 = Math.round(t * sr); let prev = 0; for (let k = 0; k < 0.22 * sr; k++) { const dt = k / sr; const w = rnd() * 2 - 1; const hp = w - prev; prev = w; const v = g * (0.55 * hp * Math.exp(-dt * 20) + 0.5 * Math.sin(2 * Math.PI * 185 * dt) * Math.exp(-dt * 30)); add(L, i0 + k, v); add(R, i0 + k, v); } };
    const hat = (t, g, open) => { const i0 = Math.round(t * sr); let prev = 0; const d = open ? 14 : 55; for (let k = 0; k < (open ? 0.25 : 0.08) * sr; k++) { const dt = k / sr; const w = rnd() * 2 - 1; const hp = w - prev; prev = w; const v = g * hp * Math.exp(-dt * d); add(L, i0 + k, v * 0.7); add(R, i0 + k, v * 1.0); } };
    const crash = (t, g) => { const i0 = Math.round(t * sr); let p = 0, q = 0; for (let k = 0; k < 2.2 * sr; k++) { const dt = k / sr; const a = rnd() * 2 - 1, b = rnd() * 2 - 1; const va = a - p, vb = b - q; p = a; q = b; const e = g * Math.exp(-dt * 2.2); add(L, i0 + k, va * e); add(R, i0 + k, vb * e); } };

    // ---- tonal voices (naive saws through two one-pole low-passes) ----
    function voice(t0, t1, midi, opt) {
      const { gain, cutoff, detune = 0, pan = 0, shape = 'saw', atk = 0.02, rel = 0.08, cutoffEnd } = opt;
      const i0 = Math.round(t0 * sr), i1 = Math.round((t1 + rel) * sr);
      const f = mtof(midi);
      const chans = [[L, 1 - pan, -detune], [R, 1 + pan, detune]];
      for (const [buf, pg, det] of chans) {
        const inc = f * Math.pow(2, det / 1200) / sr; let ph = rnd(), y1 = 0, y2 = 0;
        for (let i = i0; i < i1 && i < n; i++) {
          const tt = i / sr; ph += inc; ph -= Math.floor(ph);
          let x = shape === 'square' ? (ph < 0.5 ? 1 : -1) : shape === 'tri' ? 4 * Math.abs(ph - 0.5) - 1 : 2 * ph - 1;
          const fc = cutoffEnd ? cutoff * Math.pow(cutoffEnd / cutoff, (tt - t0) / Math.max(0.01, t1 - t0)) : cutoff;
          const a = 1 - Math.exp(-2 * Math.PI * Math.min(fc, sr * 0.45) / sr);
          y1 += (x - y1) * a; y2 += (y1 - y2) * a;
          let env = Math.min(1, (tt - t0) / atk); if (tt > t1) env *= Math.max(0, 1 - (tt - t1) / rel);
          buf[i] += y2 * env * gain * pg;
        }
      }
    }
    const triad = (name, up) => { const [r, q] = CH[name]; const pcs = [r, r + (q ? 3 : 4), r + 7].map(p => (p + (up || 0)) % 12); return pcs.map(pc => 53 + ((pc - 53) % 12 + 12) % 12).sort((a, b) => a - b); };
    const bassNote = (name, up) => { const pc = (CH[name][0] + (up || 0)) % 12; return 33 + ((pc - 33) % 12 + 12) % 12; };
    // a centered voice: identical in both channels, vibrato after the attack, a soft vowel-like tone
    function singer(t0, t1, midi, gain) {
      const i0 = Math.round(t0 * sr), i1 = Math.min(n, Math.round((t1 + 0.08) * sr)), f = mtof(midi);
      let ph = 0, y1 = 0, y2 = 0; const a = 1 - Math.exp(-2 * Math.PI * 2400 / sr);
      for (let i = i0; i < i1; i++) {
        const tt = (i - i0) / sr, vib = tt > 0.15 ? 0.3 * Math.sin(2 * Math.PI * 5.5 * tt) * Math.min(1, (tt - 0.15) / 0.2) : 0;
        ph += f * Math.pow(2, vib / 12) / sr; ph -= Math.floor(ph);
        y1 += ((2 * ph - 1) - y1) * a; y2 += (y1 - y2) * a;
        let env = Math.min(1, tt / 0.03); if (i / sr > t1) env *= Math.max(0, 1 - (i / sr - t1) / 0.08);
        const v = y2 * env * gain; L[i] += v; R[i] += v;
      }
    }
    const singAt = (t, line) => { if (line) for (const [off, m, len] of line) singer(t + off * BEAT, t + (off + len) * BEAT, m, 0.1); };
    const hookAt = (t, up) => { for (const [off, m, len] of HOOK) voice(t + off * BEAT, t + (off + len) * BEAT * 0.95, m + (up || 0), { gain: 0.06, cutoff: 3200, shape: song.hookShape, atk: 0.01, rel: 0.06 }); };

    for (const s of secs) {
      const up = 0; // progressions for song a's final chorus are already written in B minor
      for (let b = 0; b < s.bars; b++) {
        const t = (s.bar0 + b) * BAR, chord = s.prog[b % s.prog.length];
        const lastBarOfBuild = s.kind === 'build' && b === s.bars - 1;
        const padEnd = lastBarOfBuild ? t + 3 * BEAT : t + BAR;
        // pad
        const padCut = { intro: 700, verse: 1100, chorus: 2600, build: 900, outro: 1400, beatintro: 600, beatoutro: 800, breakdown: 2200 }[s.kind];
        const padGain = { intro: 0.05, verse: 0.05, chorus: 0.055, build: 0.05, outro: 0.05, beatintro: 0.03, beatoutro: 0.03, breakdown: 0.065 }[s.kind] * (s.up ? 1.25 : 1);
        const outroFade = s.kind === 'outro' || s.kind === 'beatoutro' ? (1 - b / s.bars) : 1;
        for (const m of triad(chord, up)) voice(t, padEnd, m, { gain: padGain * outroFade, cutoff: padCut, cutoffEnd: s.kind === 'build' ? padCut * Math.pow(6, (b + 1) / s.bars) : null, detune: s.kind === 'chorus' || s.kind === 'breakdown' ? 14 : 6, pan: s.kind === 'chorus' || s.kind === 'breakdown' ? 0.35 : 0.1, atk: 0.05, rel: 0.12 });
        if (s.kind === 'intro' || s.kind === 'outro') continue;
        // song b only: a beatless breakdown (pads and hook) and drums-only DJ intro/outro
        if (s.kind === 'breakdown') { if (b % 2 === 0) hookAt(t, 0); continue; }
        if (s.kind === 'beatintro' || s.kind === 'beatoutro') {
          for (let q = 0; q < 4; q++) { const tq = t + q * BEAT; kick(tq, 0.85 * outroFade); hat(tq + BEAT / 2, 0.06 * outroFade, true); if (b >= 4 || s.kind === 'beatoutro') hat(tq, 0.035 * outroFade); }
          continue;
        }
        // bass
        const bn = bassNote(chord, up);
        const steps = s.kind === 'verse' ? 4 : 8;
        for (let k = 0; k < steps; k++) {
          const tk = t + k * BAR / steps; if (lastBarOfBuild && tk >= t + 3 * BEAT) break;
          const oct = s.kind === 'chorus' && k % 2 === 1 ? 12 : 0;
          voice(tk, tk + BAR / steps * 0.8, bn + oct, { gain: s.kind === 'chorus' ? 0.2 : 0.17, cutoff: 500, shape: 'saw', atk: 0.005, rel: 0.03 });
        }
        // drums
        for (let q = 0; q < 4; q++) {
          const tq = t + q * BEAT; if (lastBarOfBuild && q === 3) break;
          if (s.kind === 'verse') { if (q === 0 || q === 2) kick(tq, 0.8); if (q === 1 || q === 3) snare(tq, 0.28); hat(tq, 0.05); hat(tq + BEAT / 2, 0.04); }
          if (s.kind === 'chorus') { kick(tq, 0.95 * (s.up ? 1.15 : 1)); if (q === 1 || q === 3) snare(tq, 0.42); for (let h = 0; h < 4; h++) hat(tq + h * BEAT / 4, h === 2 ? 0.07 : 0.045, h === 2); }
          if (s.kind === 'build') { kick(tq, 0.7); const div = [1, 2, 4, 8][b]; for (let h = 0; h < div; h++) snare(tq + h * BEAT / div, 0.12 + 0.25 * (b + (q + h / div) / 4) / 4); }
        }
        // lead hook in choruses
        if (s.kind === 'chorus' && b % 2 === 0) hookAt(t, s.up);
        // song b's singer
        if (song.sing && b % 2 === 0 && (s.kind === 'verse' || s.kind === 'chorus')) singAt(t, song.sing[s.kind]);
      }
      if (s.kind === 'chorus') crash(s.t0, s.up ? 0.16 : 0.1);
      if (s.kind === 'build') {
        // rising filtered noise, up to the silent beat before the drop
        const i0 = Math.round(s.t0 * sr), i1 = Math.round((s.t1 - BEAT) * sr); let y = 0, yr = 0;
        for (let i = i0; i < i1; i++) { const p = (i - i0) / (i1 - i0); const fc = 150 * Math.pow(60, p); const a = 1 - Math.exp(-2 * Math.PI * fc / sr); y += ((rnd() * 2 - 1) - y) * a; yr += ((rnd() * 2 - 1) - yr) * a; L[i] += y * 0.22 * p * p; R[i] += yr * 0.22 * p * p; }
      }
    }
    // one beat of silence before each drop
    for (const gp of gaps) {
      const g0 = Math.round(gp.start * sr), g1 = Math.round(gp.end * sr), ramp = Math.round(0.004 * sr);
      for (let i = g0 - ramp; i < g1; i++) { const gm = i < g0 ? (g0 - i) / ramp : 0; L[i] *= gm; R[i] *= gm; }
    }
    // gentle bus saturation
    let pk = 0; for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.4); R[i] = Math.tanh(R[i] * 1.4); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    const norm = 0.89 / (pk || 1); for (let i = 0; i < n; i++) { L[i] *= norm; R[i] *= norm; }
    return { L, R, sr, dur, sections: secs, gapStart: gaps[0].start, gapEnd: gaps[0].end, bpm: song.bpm };
  }

  const truth = (id) => {
    const song = SONGS[id], s = layout(song), BEAT = 60 / song.bpm;
    return { bpm: song.bpm, key: song.key, sections: s.map(x => ({ name: x.name, t0: x.t0, t1: x.t1, vocals: !!(song.sing && (x.kind === 'verse' || x.kind === 'chorus')) })), gaps: song.gaps.map(k => s[k].t0 - BEAT), drops: song.gaps.map(k => s[k].t0), keyChangeAt: id === 'a' ? s[5].t0 : null, gapAt: s[song.gaps[0]].t0 - BEAT, dropAt: s[song.gaps[0]].t0 };
  };
  const TRUTH = truth('a'), TRUTH_B = truth('b');
  return { render, TRUTH, TRUTH_B, BPM };
})();
if (typeof module !== 'undefined') module.exports = AnatomyDemo;

