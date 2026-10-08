/* ============================================================
   ANATOMY ENGINE — live audio analysis, pure JS, no DOM.
   Feed it samples with push(L, R); it measures, remembers and
   emits events ('beat', 'moment', 'block', 'section', 'key').
   ============================================================ */
const AnatomyEngine = (() => {
  'use strict';

  const PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  // Krumhansl–Kessler key profiles
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const BAND_EDGES = [20, 60, 250, 500, 2000, 6000, 16000];
  const BAND_NAMES = ['Sub', 'Bass', 'Low mid', 'Mid', 'Presence', 'Air'];
  const SPEC_BINS = 256, SPEC_FMIN = 30, SPEC_OCT = Math.log2(16000 / 30);
  const BLOCK = 0.5;            // seconds per structure block
  const NOV_K = 12, NOV_M = 6, MIN_SEG = 10;
  const BPM_MIN = 60, BPM_MAX = 200, BPM_STEP = 0.5;

  const keyName = (k) => k < 0 ? '—' : (k < 12 ? `${PC[k]} major` : `${PC[k - 12]} minor`);
  const chordName = (c) => c < 0 ? '—' : (c < 12 ? PC[c] : `${PC[c - 12]}m`);
  // relative-major tonic of a key (A minor and C major share one "family")
  const family = (k) => k < 12 ? k : (k - 12 + 3) % 12;
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const fmtTime = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
  const INTERVAL_WORDS = {
    1: 'up a half step', 2: 'up a whole step', 3: 'up a minor third', 4: 'up a major third', 5: 'up a fourth', 6: 'up a tritone',
    7: 'down a fourth', 8: 'down a major third', 9: 'down a minor third', 10: 'down a whole step', 11: 'down a half step'
  };

  function makeFFT(N) {
    const levels = Math.round(Math.log2(N));
    const rev = new Uint32Array(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b); rev[i] = r; }
    const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = -Math.sin(2 * Math.PI * i / N); }
    const re = new Float64Array(N), im = new Float64Array(N);
    return (input, mag, scale) => {
      for (let i = 0; i < N; i++) { re[rev[i]] = input[i]; im[rev[i]] = 0; }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half;
            const tr = re[b] * cs[k] - im[b] * sn[k];
            const ti = re[b] * sn[k] + im[b] * cs[k];
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
      for (let k = 0; k <= N / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale;
    };
  }
  const hann = (N) => { const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); return w; };

  function pearson(a, b, n) {
    let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
    return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
  }
  function keyCorrs(chroma, out) {
    const rot = new Float64Array(12);
    for (let t = 0; t < 12; t++) {
      for (let i = 0; i < 12; i++) rot[i] = chroma[(i + t) % 12];
      out[t] = pearson(rot, KK_MAJ, 12); out[t + 12] = pearson(rot, KK_MIN, 12);
    }
    return out;
  }
  const argmax = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; };
  function median(arr) { if (!arr.length) return 0; const s = Array.from(arr).sort((x, y) => x - y); return s[s.length >> 1]; }
  function percentile(arr, p) { if (!arr.length) return 0; const s = Array.from(arr).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

  class Engine {
    constructor(sr, opts = {}) {
      this.sr = sr; this.hop = 512; this.N1 = 2048; this.N2 = 8192;
      this.fr = sr / this.hop;
      this.pitchEvery = opts.pitchEvery || 3;
      this.maxSec = opts.maxSec || 600;
      this.maxF = Math.ceil(this.fr * this.maxSec) + 8;
      this.maxB = Math.ceil(this.maxSec / BLOCK) + 4;
      this.listeners = [];
      const sr_ = sr, N1 = this.N1, N2 = this.N2;
      this.ring = new Float32Array(16384); this.mask = 16383;
      this.fft1 = makeFFT(N1); this.fft2 = makeFFT(N2);
      this.h1 = hann(N1); this.h2 = hann(N2);
      this.b1 = new Float64Array(N1); this.b2 = new Float64Array(N2);
      this.mag1 = new Float64Array(N1 / 2 + 1); this.mag2 = new Float64Array(N2 / 2 + 1);
      this.lm = new Float64Array(N1 / 2 + 1); this.plm = new Float64Array(N1 / 2 + 1);
      this.bin1 = (f) => Math.round(f * N1 / sr_); this.bin2 = (f) => Math.round(f * N2 / sr_);
      // per-frame history
      const F = this.maxF;
      this.onset = new Float32Array(F); this.level = new Float32Array(F);
      this.cent = new Float32Array(F); this.flat = new Float32Array(F);
      this.bands = new Float32Array(F * 6); this.spec = new Uint8Array(F * SPEC_BINS);
      this.activeF = new Uint8Array(F);
      this.clarF = new Float32Array(F); this.f0F = new Float32Array(F); this.confF = new Float32Array(F); this.strF = new Float32Array(F);
      // spectrogram bin map
      this.specMap = [];
      for (let b = 0; b < SPEC_BINS; b++) {
        const fLo = SPEC_FMIN * Math.pow(2, SPEC_OCT * b / SPEC_BINS), fHi = SPEC_FMIN * Math.pow(2, SPEC_OCT * (b + 1) / SPEC_BINS);
        const use2 = fHi < 500;
        const res = sr / (use2 ? N2 : N1);
        const kLo = Math.floor(fLo / res), kHi = Math.max(kLo, Math.floor(fHi / res));
        this.specMap.push({ use2, kLo, kHi });
      }
      // blocks
      const B = this.maxB;
      this.bChroma = new Float32Array(B * 12); this.bTimb = new Float32Array(B * 7);
      this.bLevel = new Float32Array(B); this.bSilent = new Uint8Array(B); this.bCent = new Float32Array(B);
      this.Sraw = []; this.Ssm = []; this.nov = new Float32Array(B);
      this.grid = []; for (let b = BPM_MIN; b <= BPM_MAX + 1e-9; b += BPM_STEP) this.grid.push(b);
      this.sc = new Float64Array(this.grid.length);
      this.reset();
    }

    on(fn) { this.listeners.push(fn); }
    emit(type, data) { for (const f of this.listeners) f(type, data); }

    reset() {
      this.w = 0; this.sinceHop = 0; this.nF = 0; this.full = false;
      this.midAcc = 0; this.sideAcc = 0; this.width = 0; this.stereoSeen = false; this.peakAcc = 0; this.peaks = new Float32Array(this.maxF);
      this.specPeakDb = -60;
      this.floorDb = -70; this.active = false; this.soundTime = 0; this.lastActiveT = -1e9;
      this.lvlFast = -100; this.lvlSlow = -100; this.bassFast = -100; this.bassSlow = -100; this.envInit = false;
      this.chroma = new Float64Array(12); this.cS = new Float64Array(12); this.cL = new Float64Array(12); this.cK = new Float64Array(12);
      this.chromaSilent = true; this.chromaStrength = 0;
      this.keyCur = -1; this.keyDisp = -1; this.keyPend = null; this.keyConf = 0; this.keyTimeline = []; this.keyCorr = new Float64Array(24);
      this.chordCur = -1; this.chordCand = -1; this.chordCandN = 0; this.chordScore = 0; this.chordSegs = [];
      this.sc.fill(0); this.bpm = 0; this.tempoConf = 0; this.locked = false; this.P = 0;
      this.nextBeat = null; this.lastEmitted = -1e9; this.beatIdx = 0; this.pending = []; this.actual = []; this.looseness = null;
      this.bpmHist = []; this.beatTimes = []; this.everLocked = false; this.lockedUpdates = 0; this.tempoUpdates = 0;
      this.f0 = 0; this.clarity = 0; this.voicedHist = [];
      this.ch = { bright: 0, noisy: 0, punch: 0, pitched: 0, pulse: 0 }; this.crestDb = 0;
      this.drop = { state: 'normal', t0: 0, pre: 0, tImpact: 0, postSum: 0, postN: 0, cool: -1e9 };
      this.bassCool = -1e9; this.buildCool = -1e9; this.lastBuild = null;
      this.blk = null; this.nB = 0; this.Sraw.length = 0; this.Ssm.length = 0; this.nov.fill(0);
      this.sumS = 0; this.sumS2 = 0; this.nS = 0; this.tStat = { n: 0, mean: new Float64Array(8), m2: new Float64Array(8) }; this.novSum = 0; this.novSum2 = 0; this.novN = 0;
      this.segStart = -1; this.segments = []; this.lastBoundary = -1e9; this.nextLabel = 0;
      this.repeatActive = false; this.repCand = null; this.repeatOf = null;
      this.moments = []; this.momentId = 0; this.speechLike = false; this.description = 'Quiet';
    }

    get time() { return this.nF / this.fr; }

    /* ---------- input ---------- */
    push(L, R) {
      const n = L.length, ring = this.ring, mask = this.mask;
      for (let i = 0; i < n; i++) {
        const l = L[i], r = R ? R[i] : l;
        const m = 0.5 * (l + r), s = 0.5 * (l - r);
        ring[this.w & mask] = m; this.w++;
        this.midAcc += m * m; this.sideAcc += s * s;
        const a = m < 0 ? -m : m; if (a > this.peakAcc) this.peakAcc = a;
        if (++this.sinceHop >= this.hop) {
          this.sinceHop = 0;
          if (this.w >= this.N1 && !this.full) this.frame();
        }
      }
    }

    /* ---------- per-frame analysis (hop = 512 samples) ---------- */
    frame() {
      if (this.nF >= this.maxF - 1) { this.full = true; this.emit('full'); return; }
      const f = this.nF, N1 = this.N1, ring = this.ring, mask = this.mask, sr = this.sr;
      const t = f / this.fr;
      // time domain
      let e = 0; const start = this.w - N1;
      for (let i = 0; i < N1; i++) { const x = ring[(start + i) & mask]; this.b1[i] = x * this.h1[i]; e += x * x; }
      const rms = Math.sqrt(e / N1);
      const lv = Math.max(-120, 20 * Math.log10(rms + 1e-12));
      this.level[f] = lv; this.peaks[f] = this.peakAcc; this.peakAcc = 0;
      // stereo width over the hop
      if (this.midAcc + this.sideAcc > 1e-9) {
        const wv = this.sideAcc / (this.midAcc + this.sideAcc);
        if (wv > 0.002) this.stereoSeen = true;
        this.width += (wv - this.width) * 0.05;
      }
      this.midAcc = 0; this.sideAcc = 0;
      // noise floor & activity
      if (lv < this.floorDb) this.floorDb = lv;
      else if (lv < this.floorDb + 15) this.floorDb += 0.4 / this.fr;
      this.active = lv > Math.max(this.floorDb + 10, -85);
      this.activeF[f] = this.active ? 1 : 0;
      if (this.active) { this.soundTime += 1 / this.fr; this.lastActiveT = t; }
      // spectrum
      this.fft1(this.b1, this.mag1, 4 / N1);
      const mag = this.mag1, lm = this.lm, plm = this.plm;
      const kLo = Math.max(1, this.bin1(40)), kHi = Math.min(mag.length - 1, this.bin1(8000));
      let flux = 0;
      for (let k = 1; k < mag.length; k++) lm[k] = Math.log1p(100 * mag[k]);
      for (let k = kLo; k <= kHi; k++) { const d = lm[k] - plm[k]; if (d > 0) flux += d; }
      this.plm.set(lm);
      this.onset[f] = flux;
      // centroid & flatness
      let cs = 0, cw = 0, lsum = 0, psum = 0, cnt = 0;
      const c1 = this.bin1(40), c2 = Math.min(mag.length - 1, this.bin1(12000)), fl1 = this.bin1(100), fl2 = this.bin1(8000);
      for (let k = c1; k <= c2; k++) { cs += k * mag[k]; cw += mag[k]; }
      for (let k = fl1; k <= fl2; k++) { const p = mag[k] * mag[k] + 1e-14; lsum += Math.log(p); psum += p; cnt++; }
      const centroid = cw > 0 ? cs / cw * sr / N1 : 0;
      const flatness = cnt ? Math.exp(lsum / cnt) / (psum / cnt) : 1;
      this.cent[f] = centroid; this.flat[f] = flatness;
      // chroma + low-frequency spectrum (8192-point FFT, every 4th frame)
      if (f % 4 === 0 && this.w >= this.N2) this.chromaUpdate(t);
      // bands (low bands from the long FFT, the rest from the short one)
      const bOff = f * 6;
      for (let b = 0; b < 6; b++) {
        const lo = BAND_EDGES[b], hi = BAND_EDGES[b + 1];
        let s = 0;
        if (hi <= 250) { const m2 = this.mag2; for (let k = Math.max(1, this.bin2(lo)); k < this.bin2(hi); k++) s += m2[k] * m2[k]; }
        else { for (let k = Math.max(1, this.bin1(lo)); k < Math.min(mag.length, this.bin1(hi)); k++) s += mag[k] * mag[k]; }
        this.bands[bOff + b] = Math.max(-120, 10 * Math.log10(s + 1e-12));
      }
      // spectrogram column
      this.specColumn(f);
      // pitch
      if (f % this.pitchEvery === 0) this.pitchUpdate(t);
      // character
      this.characterUpdate(f, t, lv, centroid, flatness);
      // tempo & beats
      if (f % 24 === 0) this.tempoUpdate(t);
      this.beatCheck(f);
      this.beatRefine(f);
      // moments that watch the envelope
      this.watchEnvelope(f, t, lv);
      // structure blocks
      this.blockAccumulate(f, t, lv, centroid);
      this.clarF[f] = this.clarity; this.f0F[f] = this.clarity > 0.85 ? this.f0 : 0; this.confF[f] = this.locked ? this.tempoConf : 0; this.strF[f] = this.chromaStrength;
      this.nF++;
    }

    specColumn(f) {
      const out = this.spec, off = f * SPEC_BINS, m1 = this.mag1, m2 = this.mag2, map = this.specMap;
      let colMax = -200;
      const tmp = this._specTmp || (this._specTmp = new Float32Array(SPEC_BINS));
      for (let b = 0; b < SPEC_BINS; b++) {
        const { use2, kLo, kHi } = map[b]; const m = use2 ? m2 : m1;
        let v = 0; for (let k = kLo; k <= kHi && k < m.length; k++) if (m[k] > v) v = m[k];
        const db = 20 * Math.log10(v + 1e-9); tmp[b] = db; if (db > colMax) colMax = db;
      }
      if (colMax > this.specPeakDb) this.specPeakDb = colMax; else this.specPeakDb -= 3 / this.fr;
      const top = this.specPeakDb, range = 72;
      for (let b = 0; b < SPEC_BINS; b++) out[off + b] = Math.round(255 * clamp((tmp[b] - (top - range)) / range));
    }

    /* ---------- harmony ---------- */
    chromaUpdate(t) {
      const N2 = this.N2, ring = this.ring, mask = this.mask, start = this.w - N2, sr = this.sr;
      for (let i = 0; i < N2; i++) this.b2[i] = ring[(start + i) & mask] * this.h2[i];
      this.fft2(this.b2, this.mag2, 4 / N2);
      const m = this.mag2, c = this.chroma; c.fill(0);
      const k1 = this.bin2(60), k2 = this.bin2(3000);
      let mx = 0; for (let k = k1; k <= k2; k++) if (m[k] > mx) mx = m[k];
      const thr = mx * 0.02;
      let total = 0;
      if (mx > 0) for (let k = k1; k <= k2; k++) {
        const a = m[k];
        if (a <= thr || a < m[k - 1] || a < m[k + 1]) continue;
        const la = Math.log(m[k - 1] + 1e-12), lb = Math.log(a + 1e-12), lc = Math.log(m[k + 1] + 1e-12);
        const den = la - 2 * lb + lc; const d = den !== 0 ? 0.5 * (la - lc) / den : 0;
        const freq = (k + d) * sr / N2;
        const midi = 69 + 12 * Math.log2(freq / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        const wf = freq < 1000 ? 1 : 1000 / freq;
        c[pc] += a * wf; total += a * wf;
      }
      let cm = 0; for (let i = 0; i < 12; i++) if (c[i] > cm) cm = c[i];
      const tonal = this.active && cm > 0;
      this.chromaSilent = !tonal;
      const dt = 4 / this.fr;
      if (tonal) {
        for (let i = 0; i < 12; i++) c[i] /= cm;
        // how peaked the chroma is (flat chroma = noise or drums)
        let mean = 0; for (let i = 0; i < 12; i++) mean += c[i]; mean /= 12;
        this.chromaStrength = clamp((1 - mean) / 0.7);
        const aS = 1 - Math.exp(-dt / 0.3), aL = 1 - Math.exp(-dt / 6), aK = 1 - Math.exp(-dt / 20);
        for (let i = 0; i < 12; i++) {
          this.cS[i] += (c[i] - this.cS[i]) * aS;
          this.cL[i] += (c[i] - this.cL[i]) * aL;
          this.cK[i] += (c[i] - this.cK[i]) * aK;
        }
        this.keyUpdate(t);
        this.chordUpdate(t);
      } else {
        const aS = 1 - Math.exp(-dt / 0.3);
        for (let i = 0; i < 12; i++) this.cS[i] *= (1 - aS);
        this.chromaStrength *= 0.9;
        if (!this.active) this.chordUpdate(t, true);
      }
    }

    keyUpdate(t) {
      if (this.soundTime < 5) return;
      const cK = keyCorrs(this.cK, this.keyCorr);
      if (this.keyCur < 0) { this.keyCur = argmax(cK); }
      else {
        const cl = keyCorrs(this.cL, new Float64Array(24));
        const lb = argmax(cl);
        const fc = family(this.keyCur);
        const relOfCur = this.keyCur < 12 ? 12 + (this.keyCur + 9) % 12 : (this.keyCur - 12 + 3) % 12;
        const curBest = Math.max(cl[this.keyCur], cl[relOfCur]);
        if (family(lb) !== fc && cl[lb] - curBest > 0.08) {
          if (!this.keyPend || family(this.keyPend.k) !== family(lb)) this.keyPend = { k: lb, t0: t };
          else if (t - this.keyPend.t0 > 3.5) {
            const from = this.keyDisp >= 0 ? this.keyDisp : this.keyCur;
            const d = (family(lb) - fc + 12) % 12;
            // the change started roughly where local chroma began to turn
            const lastK = this.keyTimeline[this.keyTimeline.length - 1];
            const tChange = Math.max(lastK ? lastK.t : 0, this.keyPend.t0 - 3);
            this.keyCur = lb; this.cK.set(this.cL); this.keyPend = null;
            this.setDisplayKey(lb, tChange);
            const words = INTERVAL_WORDS[d] || 'to a new key';
            const detail = d === 2 || d === 1
              ? `The whole song shifts ${words}. Lifting everything like this makes a late chorus feel brighter and bigger without changing the melody. Songwriters sometimes call it the "truck driver's gear change".`
              : `The home note moves ${words}, so every chord now leans toward a new center.`;
            this.addMoment(tChange, 'key', `Key change: ${keyName(from)} → ${keyName(lb)}`, detail, 0.95);
            this.emit('key', { t: tChange, key: lb });
            return;
          }
        } else this.keyPend = null;
      }
      // choose the mode inside the current family, with a little hysteresis
      const fam = family(this.keyCur);
      const maj = fam, min = 12 + (fam + 9) % 12;
      let disp = this.keyDisp;
      if (disp < 0 || family(disp) !== fam) disp = cK[maj] >= cK[min] ? maj : min;
      else if (disp === maj && cK[min] > cK[maj] + 0.05) disp = min;
      else if (disp === min && cK[maj] > cK[min] + 0.05) disp = maj;
      if (disp !== this.keyDisp) this.setDisplayKey(disp, this.keyTimeline.length ? t : Math.max(0, t - this.soundTime));
      // confidence: gap between this family and the best other family
      let other = -1; for (let k = 0; k < 24; k++) if (family(k) !== fam && cK[k] > other) other = cK[k];
      this.keyConf = clamp((cK[disp] - other) / 0.2);
    }
    setDisplayKey(k, t) {
      this.keyDisp = k;
      const last = this.keyTimeline[this.keyTimeline.length - 1];
      if (last && (family(last.key) === family(k) || Math.abs(last.t - t) < 0.01)) last.key = k; else this.keyTimeline.push({ t, key: k });
    }

    chordUpdate(t, silent) {
      let best = -1, bestS = 0, curS = 0;
      if (!silent && this.chromaStrength > 0.25) {
        const c = this.cS; let norm = 0; for (let i = 0; i < 12; i++) norm += c[i] * c[i]; norm = Math.sqrt(norm) || 1;
        const fam = this.keyCur >= 0 ? family(this.keyCur) : -1;
        for (let q = 0; q < 2; q++) for (let r = 0; r < 12; r++) {
          const third = q === 0 ? 4 : 3;
          let s = (c[r] + c[(r + third) % 12] + c[(r + 7) % 12]) / (norm * Math.sqrt(3));
          if (fam >= 0) { const d = (r - fam + 12) % 12; if ((q === 0 && (d === 0 || d === 5 || d === 7)) || (q === 1 && (d === 2 || d === 4 || d === 9))) s *= 1.04; }
          const id = q * 12 + r;
          if (s > bestS) { bestS = s; best = id; }
          if (id === this.chordCur) curS = s;
        }
        if (bestS < 0.72) best = -1;
      }
      if (best === this.chordCur) { this.chordCandN = 0; this.chordScore = bestS; return; }
      if (best === this.chordCand) this.chordCandN++; else { this.chordCand = best; this.chordCandN = 1; }
      if (this.chordCandN >= 3 && (best < 0 || this.chordCur < 0 || bestS > curS + 0.02)) {
        const tc = t - 2 * 4 / this.fr;
        const last = this.chordSegs[this.chordSegs.length - 1];
        if (last) last.t1 = tc;
        if (best >= 0) this.chordSegs.push({ t0: tc, t1: tc, chord: best });
        this.chordCur = best; this.chordScore = bestS; this.chordCandN = 0;
      }
    }

    /* ---------- single-note pitch (YIN) ---------- */
    pitchUpdate(t) {
      const lv = this.level[this.nF];
      if (!this.active || lv < this.floorDb + 15) { this.clarity = 0; this.trackNote(t, false); return; }
      const sr = this.sr, W = 768, tmin = Math.max(2, Math.floor(sr / 2000)), tmax = Math.floor(sr / 70);
      const n = W + tmax + 2, ring = this.ring, mask = this.mask, start = this.w - n;
      const x = this._yx || (this._yx = new Float64Array(4096));
      for (let i = 0; i < n; i++) x[i] = ring[(start + i) & mask];
      const d = this._yd || (this._yd = new Float64Array(4096));
      d[0] = 1;
      let run = 0, bestTau = -1, last = tmax;
      // cumulative-mean-normalized difference, stopping once the first dip below threshold bottoms out
      for (let tau = 1; tau <= tmax; tau++) {
        let s = 0; for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; }
        run += s; d[tau] = run > 0 ? s * tau / run : 1;
        if (tau > tmin + 1 && bestTau < 0 && d[tau - 1] < 0.12 && d[tau] >= d[tau - 1]) { bestTau = tau - 1; last = tau; break; }
      }
      if (bestTau < 0) last = tmax;
      d[last + 1] = d[last];
      if (bestTau < 0) { let mn = 1e9; for (let tau = tmin; tau < tmax; tau++) if (d[tau] < mn) { mn = d[tau]; bestTau = tau; } }
      if (bestTau < 1) { this.clarity = 0; this.trackNote(t, false); return; }
      const a = d[bestTau - 1], b = d[bestTau], c = d[bestTau + 1];
      const den = a - 2 * b + c; const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      const tauF = bestTau + clamp(shift, -1, 1);
      this.clarity = clamp(1 - b);
      this.f0 = sr / tauF;
      this.trackNote(t, this.clarity > 0.85);
    }
    trackNote(t, voiced) {
      // how much of the last 2 s had one clear pitch; used to tell talking from music
      this.voicedHist.push({ t, v: voiced ? 1 : 0 });
      while (this.voicedHist.length && this.voicedHist[0].t < t - 2) this.voicedHist.shift();
    }

    /* ---------- character ---------- */
    characterUpdate(f, t, lv, centroid, flatness) {
      const a = 1 - Math.exp(-1 / (this.fr * 0.5));
      const ch = this.ch;
      if (this.active) {
        const bright = clamp(Math.log2(Math.max(centroid, 100) / 200) / Math.log2(6000 / 200));
        const noisy = clamp((Math.log10(flatness + 1e-9) + 2) / 1.8);
        ch.bright += (bright - ch.bright) * a;
        ch.noisy += (noisy - ch.noisy) * a;
      }
      ch.pitched += ((this.clarity > 0.85 ? 1 : 0) - ch.pitched) * a;
      ch.pulse += (this.tempoConf - ch.pulse) * a;
      if (f % 12 === 0) {
        // crest factor over the last second: peak vs RMS
        const n = Math.min(f + 1, Math.round(this.fr));
        let pk = 0, e = 0, act = 0;
        for (let i = f - n + 1; i <= f; i++) { if (this.peaks[i] > pk) pk = this.peaks[i]; e += Math.pow(10, this.level[i] / 10); act += this.activeF[i]; }
        const rms = Math.sqrt(e / n);
        if (act > n * 0.5 && rms > 0) {
          this.crestDb = 20 * Math.log10(pk / rms + 1e-9);
          ch.punch += (clamp((this.crestDb - 6) / 14) - ch.punch) * 0.3;
        }
        this.describe(t);
      }
    }
    describe(t) {
      // syllable-like bumps in the loudness envelope over 2 s
      const n = Math.min(this.nF, Math.round(this.fr * 2));
      let peaksN = 0, lastPeak = -1e9;
      for (let i = this.nF - n + 2; i < this.nF - 2; i++) {
        const v = this.level[i];
        if (v > this.level[i - 1] && v >= this.level[i + 1] && v > this.level[i - 2] && v >= this.level[i + 2]) {
          let lo = v; for (let j = Math.max(0, i - Math.round(this.fr * 0.15)); j < i; j++) if (this.level[j] < lo) lo = this.level[j];
          if (v - lo > 6 && i - lastPeak > this.fr * 0.12) { peaksN++; lastPeak = i; }
        }
      }
      const rate = peaksN / 2;
      let voiced = 0; for (const h of this.voicedHist) voiced += h.v; voiced = this.voicedHist.length ? voiced / this.voicedHist.length : 0;
      this.speechLike = rate >= 2.5 && rate <= 7.5 && voiced > 0.15 && voiced < 0.9 && this.tempoConf < 0.4;
      const ch = this.ch;
      let d;
      if (!this.active) d = 'Quiet. Play or say something.';
      else if (this.speechLike) d = 'Sounds like talking: syllables at about ' + rate.toFixed(1) + ' per second.';
      else if (this.locked && this.chromaStrength > 0.4) d = 'Music with a steady beat and clear chords.';
      else if (this.locked) d = 'A steady rhythm, with little harmony to follow.';
      else if (ch.pitched > 0.6) d = 'One clear pitch at a time, like singing, whistling or a single instrument.';
      else if (ch.noisy > 0.65 && ch.punch < 0.45) d = 'Steady noise, like a fan, rain, traffic or rushing air.';
      else if (ch.punch > 0.6) d = 'Separate hits and knocks, without a steady beat.';
      else if (this.chromaStrength > 0.45) d = 'Tonal sound without a steady beat, like ambient music or a chord ringing out.';
      else d = 'A mix of sounds.';
      this.description = d;
    }

    /* ---------- tempo & beat ---------- */
    tempoUpdate(t) {
      const fr = this.fr, nF = this.nF;
      if (nF < fr * 4) return;
      const W = Math.min(nF, Math.round(fr * 8));
      const o = this.onset, s0 = nF - W;
      const seg = this._seg && this._seg.length >= W ? this._seg : (this._seg = new Float64Array(Math.round(fr * 8) + 4));
      let mean = 0; for (let i = 0; i < W; i++) mean += o[s0 + i]; mean /= W;
      for (let i = 0; i < W; i++) seg[i] = o[s0 + i] - mean;
      const Lmax = Math.min(W - 2, Math.ceil(2 * 60 * fr / BPM_MIN) + 2);
      const ac = this._ac && this._ac.length > Lmax ? this._ac : (this._ac = new Float64Array(Lmax + 2));
      for (let L = 0; L <= Lmax; L++) { let s = 0; for (let i = L; i < W; i++) s += seg[i] * seg[i - L]; ac[L] = s / (W - L); }
      if (ac[0] <= 1e-12) { this.tempoConf *= 0.8; this.locked = false; return; }
      const a0 = ac[0];
      const acn = (L) => { if (L >= Lmax) return 0; const i = Math.floor(L), fr_ = L - i; return ((1 - fr_) * ac[i] + fr_ * ac[i + 1]) / a0; };
      const g = this.grid; let bestI = 0, bestV = -1e9;
      for (let k = 0; k < g.length; k++) {
        const L = 60 * fr / g[k];
        let s = acn(L) + 0.5 * acn(2 * L);
        const prior = Math.exp(-0.5 * Math.pow(Math.log2(g[k] / 120) / 0.9, 2));
        s = Math.max(0, s) * prior;
        this.sc[k] += (s - this.sc[k]) * 0.3;
        if (this.sc[k] > bestV) { bestV = this.sc[k]; bestI = k; }
      }
      let bpm = g[bestI];
      if (bestI > 0 && bestI < g.length - 1) {
        const a = this.sc[bestI - 1], b = this.sc[bestI], c = this.sc[bestI + 1];
        const den = a - 2 * b + c; if (den !== 0) bpm += clamp(0.5 * (a - c) / den, -0.5, 0.5) * BPM_STEP;
      }
      const conf = clamp((acn(60 * fr / bpm) - 0.08) / 0.3);
      this.tempoConf += (conf - this.tempoConf) * 0.35;
      const wasLocked = this.locked;
      const recent = t - this.lastActiveT < 1.5;
      this.locked = recent && this.tempoConf > (wasLocked ? 0.28 : 0.38);
      this.tempoUpdates++;
      if (this.locked) {
        if (this.bpm && Math.abs(bpm - this.bpm) / this.bpm > 0.06) this.lockedUpdates = 0;
        this.bpm = bpm; this.P = 60 * fr / bpm; this.lockedUpdates++;
        this.bpmHist.push(bpm);
        if (!this.everLocked && this.lockedUpdates > 6) {
          this.everLocked = true;
          this.addMoment(Math.max(0, t - 2), 'beat', `Beat found: ${Math.round(bpm)} BPM`, `The onsets line up into a steady pulse of ${bpm.toFixed(1)} beats per minute, one beat every ${(60000 / bpm).toFixed(0)} ms.`, 0.3);
        }
        this.phaseUpdate();
      } else {
        this.nextBeat = null;
        if (wasLocked) this.lockedUpdates = 0;
      }
    }
    phaseUpdate() {
      const P = this.P, nF = this.nF, o = this.onset;
      const M = Math.max(2, Math.floor(this.fr * 4 / P));
      const oi = (x) => { if (x < 0) return 0; const i = Math.floor(x), fr_ = x - i; return (1 - fr_) * o[i] + fr_ * (i + 1 < nF ? o[i + 1] : o[i]); };
      let bestPhi = 0, bestS = -1;
      for (let phi = 0; phi < P; phi += 0.25) {
        let s = 0; for (let m = 0; m < M; m++) s += oi(nF - 1 - phi - m * P);
        if (s > bestS) { bestS = s; bestPhi = phi; }
      }
      let next = nF - 1 - bestPhi + P;
      if (this.nextBeat == null) {
        while (next - this.lastEmitted < 0.5 * P) next += P;
        this.nextBeat = next; return;
      }
      let d = ((next - this.nextBeat) % P + P) % P; if (d > P / 2) d -= P;
      if (Math.abs(d) > 0.2 * P) {
        let nb = this.nextBeat + d; while (nb - this.lastEmitted < 0.5 * P) nb += P; this.nextBeat = nb;
      } else this.nextBeat += 0.3 * d;
    }
    beatCheck(f) {
      if (!this.locked || this.nextBeat == null) return;
      let guard = 0;
      while (f >= this.nextBeat && guard++ < 4) {
        const b = this.nextBeat;
        this.lastEmitted = b; this.beatIdx++;
        this.pending.push({ f: b, idx: this.beatIdx });
        this.beatTimes.push(b / this.fr);
        this.emit('beat', { t: b / this.fr, idx: this.beatIdx });
        this.nextBeat += this.P;
      }
    }
    beatRefine(f) {
      if (!this.pending.length) return;
      const P = this.P, o = this.onset;
      while (this.pending.length && f > this.pending[0].f + 0.15 * P + 2) {
        const pb = this.pending.shift();
        const lo = Math.max(1, Math.floor(pb.f - 0.12 * P)), hi = Math.min(f - 1, Math.ceil(pb.f + 0.12 * P));
        let bi = -1, bv = 0; for (let i = lo; i <= hi; i++) if (o[i] > bv) { bv = o[i]; bi = i; }
        if (bi < 1) continue;
        let mean = 0; const n = Math.min(f, Math.round(this.fr * 4)); for (let i = f - n; i < f; i++) mean += o[i]; mean /= n;
        if (bv < mean * 1.8) continue;
        const a = o[bi - 1], b = o[bi], c = o[bi + 1]; const den = a - 2 * b + c;
        const pos = bi + (den !== 0 ? clamp(0.5 * (a - c) / den, -0.5, 0.5) : 0);
        this.actual.push({ t: pos / this.fr, idx: pb.idx });
        if (this.actual.length > 32) this.actual.shift();
      }
      // timing looseness: residual scatter of the last 16 real onsets around a straight tempo line
      const A = this.actual.slice(-16);
      if (A.length >= 10 && A[A.length - 1].idx - A[0].idx < 24) {
        let mx = 0, my = 0; for (const p of A) { mx += p.idx; my += p.t; } mx /= A.length; my /= A.length;
        let sxy = 0, sxx = 0; for (const p of A) { sxy += (p.idx - mx) * (p.t - my); sxx += (p.idx - mx) ** 2; }
        const slope = sxy / sxx; let r = 0;
        for (const p of A) { const e = p.t - (my + slope * (p.idx - mx)); r += e * e; }
        this.looseness = Math.sqrt(r / (A.length - 2)) * 1000;
      }
    }

    /* ---------- envelope moments: drops, bass entrances, build-ups ---------- */
    watchEnvelope(f, t, lv) {
      const warm = this.soundTime < 4;
      const aF = 1 - Math.exp(-1 / (this.fr * 0.06)), aS = 1 - Math.exp(-1 / (this.fr * (warm ? 0.5 : 3)));
      const lvc = Math.max(lv, -100);
      const bass = Math.max(this.bands[f * 6 + 1], this.bands[f * 6]);
      if (!this.envInit) { if (!this.active) return; this.envInit = true; this.lvlFast = this.lvlSlow = lvc; this.bassFast = this.bassSlow = bass; }
      this.lvlFast += (lvc - this.lvlFast) * aF;
      const D = this.drop;
      if (D.state !== 'gap') this.lvlSlow += (lvc - this.lvlSlow) * aS;
      this.bassFast += (bass - this.bassFast) * (1 - Math.exp(-1 / (this.fr * 0.25)));
      this.bassSlow += (bass - this.bassSlow) * (1 - Math.exp(-1 / (this.fr * (warm ? 0.5 : 4))));

      if (D.state === 'normal') {
        if (this.soundTime > 5 && this.lvlFast < this.lvlSlow - 11 && t - D.cool > 8) { D.state = 'gap'; D.t0 = t; D.pre = this.lvlSlow; }
      } else if (D.state === 'gap') {
        if (t - D.t0 > 3) D.state = 'normal';
        else if (lvc > D.pre - 4) { D.state = 'post'; D.tImpact = t; D.gapLen = t - D.t0; D.postSum = 0; D.postN = 0; }
      } else if (D.state === 'post') {
        D.postSum += lvc; D.postN++;
        if (t - D.tImpact > 0.6) {
          D.state = 'normal'; D.cool = t;
          const jump = D.postSum / D.postN - D.pre;
          if (D.gapLen >= 0.1) {
            const b = this.lastBuild && D.t0 - this.lastBuild.t1 < 5 ? this.lastBuild : null;
            const louder = jump > 0.5 ? `, then comes back ${jump.toFixed(1)} dB louder than before` : jump < -2 ? `, then returns ${(-jump).toFixed(1)} dB quieter` : ', then slams back in at full level';
            const detail = `The sound cuts out for ${D.gapLen.toFixed(2)} s${louder}.` +
              (b ? ` It lands right after a ${(b.t1 - b.t0).toFixed(0)}-second build-up, so the tension has somewhere to go.` : '') +
              ' A short silence resets your ears, which makes the return hit harder.';
            this.addMoment(D.tImpact, 'drop', b ? 'The drop' : 'Gap, then impact', detail, 1.0 + clamp(jump / 10, 0, 0.3), { gap: D.gapLen });
          }
        }
      }
      // bass entrance
      if (this.soundTime > 4 && this.bassFast - this.bassSlow > 10 && this.bassFast > this.lvlFast - 14 && t - this.bassCool > 10 && t - D.cool > 3 && D.state !== 'post') {
        this.bassCool = t;
        this.addMoment(Math.max(0, t - 0.4), 'bass', 'Bass comes in', `Energy below 250 Hz jumps about ${(this.bassFast - this.bassSlow).toFixed(0)} dB. Low end is felt as much as heard, so this is where the track gains weight.`, 0.6);
      }
    }
    detectBuild(i) {
      const n = 10; if (i < n + 4) return;
      let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, sxz = 0, syy = 0, szz = 0, m = 0;
      for (let b = i - n + 1; b <= i; b++) {
        if (this.bSilent[b]) return;
        const x = (b - i) * BLOCK, y = Math.log2(Math.max(this.bCent[b], 50)), z = this.bLevel[b];
        sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; sxz += x * z; syy += y * y; szz += z * z; m++;
      }
      const vx = sxx - sx * sx / m, cy = sxy - sx * sy / m, cz = sxz - sx * sz / m, vy = syy - sy * sy / m, vz = szz - sz * sz / m;
      const span = n * BLOCK, rise = cy / vx * span, lift = cz / vx * span;
      const ry = cy / Math.sqrt(vx * vy + 1e-12), rz = cz / Math.sqrt(vx * vz + 1e-12);
      const t = (i + 1) * BLOCK;
      if (rise > 0.6 && ry > 0.75 && lift > 0.5 && rz > 0.2) {
        if (this.lastBuild && t - this.lastBuild.t1 < 1.5) { this.lastBuild.t1 = t; this.lastBuild.m.t1 = t; this.lastBuild.rise = Math.max(this.lastBuild.rise, rise); this.lastBuild.m.detail = this.buildText(this.lastBuild); this.emit('moments-changed'); }
        else if (t - this.buildCool > 12) {
          this.buildCool = t;
          const bb = { t0: t - span, t1: t, rise, lift };
          bb.m = this.addMoment(bb.t0, 'build', 'Build-up', this.buildText(bb), 0.8); bb.m.t1 = t;
          this.lastBuild = bb;
        }
      }
    }
    buildText(b) {
      return `For ${(b.t1 - b.t0).toFixed(0)} seconds the sound gets steadily brighter (about ${b.rise.toFixed(1)} octaves higher in its center of gravity) and louder. Rising noise, faster drums and opening filters all push this way to build anticipation.`;
    }

    /* ---------- structure: blocks, self-similarity, novelty, sections ---------- */
    blockAccumulate(f, t, lv, centroid) {
      const bi = Math.floor(t / BLOCK);
      if (!this.blk) this.blk = this.newBlk(bi);
      if (bi > this.blk.i) { this.finishBlock(); this.blk = this.newBlk(bi); }
      const B = this.blk; B.n++;
      if (this.active) {
        B.act++;
        if (!this.chromaSilent) { for (let i = 0; i < 12; i++) B.chroma[i] += this.chroma[i]; B.cn++; }
        for (let b = 0; b < 6; b++) B.bands[b] += this.bands[f * 6 + b];
        B.cent += centroid; B.pow += Math.pow(10, lv / 10);
      }
    }
    newBlk(i) { return { i, n: 0, act: 0, cn: 0, chroma: new Float64Array(12), bands: new Float64Array(6), cent: 0, pow: 0 }; }

    finishBlock() {
      const B = this.blk, i = this.nB;
      if (i >= this.maxB) return;
      const silent = B.act < B.n * 0.5 || B.act === 0;
      this.bSilent[i] = silent ? 1 : 0;
      if (!silent) {
        let nrm = 0; for (let k = 0; k < 12; k++) nrm += B.chroma[k] * B.chroma[k]; nrm = Math.sqrt(nrm);
        for (let k = 0; k < 12; k++) this.bChroma[i * 12 + k] = nrm > 0 ? B.chroma[k] / nrm : 0;
        let mb = 0; const bd = []; for (let b = 0; b < 6; b++) { bd.push(B.bands[b] / B.act); mb += bd[b]; } mb /= 6;
        for (let b = 0; b < 6; b++) this.bTimb[i * 7 + b] = (bd[b] - mb) / 12;
        const cen = B.cent / B.act; this.bCent[i] = cen;
        this.bTimb[i * 7 + 6] = 0.5 * Math.log2(Math.max(cen, 50) / 1500);
        this.bLevel[i] = 10 * Math.log10(B.pow / B.act + 1e-12);
        const W = this.tStat; W.n++;
        for (let k = 0; k < 8; k++) { const v = k < 7 ? this.bTimb[i * 7 + k] : this.bLevel[i] / 10; const d = v - W.mean[k]; W.mean[k] += d / W.n; W.m2[k] += d * (v - W.mean[k]); }
      } else this.bLevel[i] = -100;
      // similarity row
      const raw = new Float32Array(i + 1), sm = new Float32Array(i + 1);
      for (let j = 0; j <= i; j++) raw[j] = j === i ? (silent ? 0 : 1) : this.sim(i, j, 0);
      this.Sraw.push(raw);
      for (let j = 0; j <= i; j++) {
        let s = 0, n = 0;
        for (let k = 0; k < 4; k++) { if (i - k < 0 || j - k < 0) break; s += this.Sraw[i - k][j - k]; n++; }
        sm[j] = s / n;
        if (i - j >= 4 && !silent && !this.bSilent[j]) { this.sumS += sm[j]; this.sumS2 += sm[j] * sm[j]; this.nS++; }
      }
      this.Ssm.push(sm);
      this.nB++;
      if (this.segStart < 0 && !silent) this.segStart = i;
      const c = this.nB - 1 - NOV_K;
      if (c >= NOV_K) { this.computeNovelty(c); this.pickBoundary(c - NOV_M, false); }
      this.detectRepeat(i);
      this.detectBuild(i);
      this.emit('block', i);
    }
    S(a, b) { return a >= b ? this.Sraw[a][b] : this.Sraw[b][a]; }
    sim(i, j, rot) {
      if (this.bSilent[i] || this.bSilent[j]) return 0;
      const A = i * 12, Bo = j * 12, ch = this.bChroma;
      let cc = 0; for (let p = 0; p < 12; p++) cc += ch[A + ((p + rot) % 12)] * ch[Bo + p];
      let td = 0; for (let k = 0; k < 7; k++) { const d = this.bTimb[i * 7 + k] - this.bTimb[j * 7 + k]; td += d * d; }
      const ed = Math.abs(this.bLevel[i] - this.bLevel[j]);
      return 0.55 * cc + 0.3 * Math.exp(-td / 0.3) + 0.15 * Math.exp(-ed / 6);
    }
    simNov(i, j) {
      if (i === j) return this.bSilent[i] ? 0 : 1;
      if (this.bSilent[i] || this.bSilent[j]) return this.bSilent[i] && this.bSilent[j] ? 1 : 0;
      const A = i * 12, Bo = j * 12, ch = this.bChroma;
      let cc = 0; for (let p = 0; p < 12; p++) cc += ch[A + p] * ch[Bo + p];
      // compare instrumentation in units of this recording's own spread, so hiss or a tiny speaker doesn't flatten contrast
      const W = this.tStat, nn = Math.max(W.n - 1, 1);
      let td = 0; for (let k = 0; k < 7; k++) { const sd = Math.sqrt(W.m2[k] / nn) + 0.03; const d = (this.bTimb[i * 7 + k] - this.bTimb[j * 7 + k]) / sd; td += d * d; }
      td /= 7;
      const sdL = 10 * Math.sqrt(W.m2[7] / nn) + 1;
      const ed = Math.abs(this.bLevel[i] - this.bLevel[j]) / sdL;
      return 0.15 * cc + 0.55 * Math.exp(-td / 1.2) + 0.3 * Math.exp(-ed * ed / 2);
    }
    get statS() { const m = this.nS ? this.sumS / this.nS : 0.5; const v = this.nS ? this.sumS2 / this.nS - m * m : 0.01; return { mean: m, std: Math.sqrt(Math.max(v, 1e-4)) }; }
    computeNovelty(c) {
      const K = NOV_K, sg = K / 2; let s = 0, norm = 0;
      for (let a = -K; a < K; a++) for (let b = -K; b < K; b++) {
        const ia = c + a, ib = c + b; if (ia < 0 || ib < 0 || ia >= this.nB || ib >= this.nB) continue;
        const g = (a < 0 ? -1 : 1) * (b < 0 ? -1 : 1) * Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * sg * sg));
        s += g * this.simNov(ia, ib); norm += Math.abs(g);
      }
      const v = norm ? s / norm : 0;
      this.nov[c] = v; this.novSum += v; this.novSum2 += v * v; this.novN++;
    }
    pickBoundary(c0, final) {
      if (c0 < NOV_K || this.segStart < 0) return;
      const last = final ? this.nB - 1 - NOV_K : c0 + NOV_M;
      const v = this.nov[c0];
      for (let k = Math.max(NOV_K, c0 - NOV_M); k <= Math.min(last, c0 + NOV_M); k++) if (this.nov[k] > v) return;
      // a boundary must stand well above the curve's typical (median) level; the median ignores the big peaks
      if (this.novN < 10) return;
      // early in a song there's little history, so the baseline is capped
      const base = Math.min(0.025, percentile(this.nov.subarray(NOV_K, NOV_K + this.novN), 0.25));
      if (v < Math.max(0.045, 3.5 * base)) return;
      if (c0 - this.segStart < MIN_SEG || c0 - this.lastBoundary < MIN_SEG) return;
      this.lastBoundary = c0;
      this.closeSegment(c0);
      // label the new section from what we have heard of it so far
      const newSeg = { start: c0, end: this.nB, label: null, shift: 0, open: true };
      const guess = this.labelSegment(newSeg.start, Math.min(this.nB, newSeg.start + 16), null);
      newSeg.label = guess.match ? guess.label : this.letter(); newSeg.shift = guess.shift; newSeg.z = guess.z; newSeg.guessMatch = guess.match;
      guess.label = newSeg.label;
      this.segments.push(newSeg); this.segStart = c0;
      const t = c0 * BLOCK;
      if (guess.match) {
        if (guess.shift !== 0) {
          newSeg.moment = this.addMoment(t, 'section', `Section ${guess.label} returns, transposed ${guess.shift > 0 ? 'up' : 'down'} ${Math.abs(guess.shift)} semitone${Math.abs(guess.shift) > 1 ? 's' : ''}`, `This part has the same shape and sound as section ${guess.label} from ${fmtTime(guess.matchT)}, but every note sits ${Math.abs(guess.shift)} semitone${Math.abs(guess.shift) > 1 ? 's' : ''} ${guess.shift > 0 ? 'higher' : 'lower'}. The engine found it by comparing the harmony in all 12 possible transpositions.`, 0.9);
        } else if (!this.moments.some(mm => mm.type === 'repeat' && Math.abs(mm.t - t) < 8)) {
          newSeg.moment = this.addMoment(t, 'section', `Section ${guess.label} returns`, `This matches section ${guess.label} from ${fmtTime(guess.matchT)}. Repetition is what lets a listener recognize a chorus the second time.`, 0.55);
        }
      } else {
        newSeg.moment = this.addMoment(t, 'section', `New section: ${guess.label}`, `The harmony and sound change together here, so this starts a part of the song we haven't heard before.`, 0.5);
      }
      this.emit('section', newSeg);
    }
    closeSegment(end) {
      const open = this.segments[this.segments.length - 1];
      if (open && open.open) {
        open.end = end; open.open = false;
        const lab = this.labelSegment(open.start, end, open);
        const changed = lab.match ? (lab.label !== open.label || lab.shift !== open.shift) : open.guessMatch;
        if (changed) {
          // the early guess was wrong; fix the section and its moment
          if (!lab.match) { open.label = this.letter(); open.shift = 0; }
          else { open.label = lab.label; open.shift = lab.shift; }
          if (open.moment && lab.match && !open.shift && this.moments.some(mm => mm.type === 'repeat' && Math.abs(mm.t - open.start * BLOCK) < 8)) {
            this.moments.splice(this.moments.indexOf(open.moment), 1); open.moment = null; this.emit('moments-changed');
          } else if (open.moment) {
            open.moment.title = lab.match ? (open.shift ? `Section ${open.label} returns, transposed ${open.shift > 0 ? 'up' : 'down'} ${Math.abs(open.shift)}` : `Section ${open.label} returns`) : `New section: ${open.label}`;
            this.emit('moments-changed');
          }
        }
      } else if (this.segStart >= 0 && end > this.segStart) {
        const lab = this.labelSegment(this.segStart, end, null);
        this.segments.push({ start: this.segStart, end, label: lab.match ? lab.label : this.letter(), shift: lab.shift, open: false });
      }
    }
    displayLabels() {
      const map = {}; let n = 0;
      for (const sg of this.segments) if (!(sg.label in map)) map[sg.label] = String.fromCharCode(65 + (n++ % 26));
      return map;
    }
    letter() { const L = String.fromCharCode(65 + (this.nextLabel % 26)); this.nextLabel++; return L; }
    labelSegment(s0, s1, self) {
      const st = this.statS; let best = null;
      for (const E of this.segments) {
        if (E === self || E.open) continue;
        const want = Math.min(s1 - s0, 24);
        if (want < 8 || E.end - E.start < 8) continue;
        for (let o = E.start - 2; o <= E.end - 8; o++) {
          const len = Math.min(want, E.end + 2 - o);
          for (let rot = 0; rot < 12; rot++) {
            let s = 0, n = 0;
            for (let k = 0; k < len; k++) {
              const a = s0 + k, b = o + k; if (b < 0 || b >= a || a >= this.nB) continue;
              s += this.sim(a, b, rot); n++;
            }
            if (n < Math.max(8, len * 0.7)) continue;
            const z = (s / n - st.mean) / st.std;
            const thr = rot === 0 ? 1.5 : 1.8;
            if (z >= thr && (!best || z > best.z + (rot === 0 ? -0.2 : 0))) best = { E, rot, z, o };
          }
        }
      }
      if (!best) return { match: false, label: null, shift: 0, z: 0 };
      let shift = (best.E.shift + best.rot) % 12; if (shift > 6) shift -= 12;
      return { match: true, label: best.E.label, shift, z: best.z, matchT: Math.max(0, best.o) * BLOCK };
    }
    detectRepeat(i) {
      if (i < 40 || this.bSilent[i]) { this.repCand = null; return; }
      const st = this.statS; let bj = -1, bz = -1e9;
      for (let j = 4; j <= i - 30; j++) {
        const v = 0.5 * (this.Ssm[i][j] + this.Ssm[i - 4][j - 4]);
        const z = (v - st.mean) / st.std; if (z > bz) { bz = z; bj = j; }
      }
      const c = this.repCand;
      if (bz > 1.6) {
        this.repeatOf = { i, j: bj, z: bz };
        if (c && Math.abs((bj - c.j0) - (i - c.i0)) <= 2) {
          c.n++; c.miss = 0;
          if (c.n === 8 && !this.repeatActive) {
            this.repeatActive = true;
            const t = (c.i0 - 7) * BLOCK, tj = Math.max(0, (c.j0 - 7) * BLOCK);
            c.m = this.addMoment(t, 'repeat', 'Heard this before', `From here the song closely matches ${fmtTime(tj)}, and keeps matching as it plays. That diagonal bright stripe in the shape above is this repeat.`, 0.7, { i: c.i0 - 7, j: c.j0 - 7 });
          }
        } else if (!c || ++c.miss > 3) this.repCand = { i0: i, j0: bj, n: 1, miss: 0 };
      } else {
        this.repeatOf = null;
        if (c && ++c.miss > 3) { this.repCand = null; this.repeatActive = false; }
      }
    }

    addMoment(t, type, title, detail, score, extra) {
      const m = Object.assign({ id: ++this.momentId, t, type, title, detail, score }, extra || {});
      this.moments.push(m);
      this.emit('moment', m);
      return m;
    }

    /* ---------- lookups for replay ---------- */
    chordAt(t) { const cs = this.chordSegs; for (let k = cs.length - 1; k >= 0; k--) if (cs[k].t0 <= t) return (k === cs.length - 1 || t <= cs[k].t1 + 0.05) ? cs[k].chord : -1; return -1; }
    keyAt(t) { const kt = this.keyTimeline; let k = -1; for (const e of kt) { if (e.t <= t + 1e-6) k = e.key; else break; } return k < 0 && kt.length ? kt[0].key : k; }
    chromaAt(t) { const b = Math.min(this.nB - 1, Math.floor(t / BLOCK)); if (b < 0 || this.bSilent[b]) return null; return this.bChroma.subarray(b * 12, b * 12 + 12); }
    sessionChroma() {
      const c = new Float64Array(12); let n = 0;
      for (let b = 0; b < this.nB; b++) if (!this.bSilent[b]) { for (let k = 0; k < 12; k++) c[k] += this.bChroma[b * 12 + k]; n++; }
      let mx = 0; for (let k = 0; k < 12; k++) if (c[k] > mx) mx = c[k];
      return mx > 0 ? Array.from(c, v => v / mx) : null;
    }
    chordShares() {
      const d = {}; let tot = 0;
      for (const c of this.chordSegs) { const len = Math.max(0, c.t1 - c.t0); d[c.chord] = (d[c.chord] || 0) + len; tot += len; }
      return Object.entries(d).map(([c, v]) => ({ chord: +c, share: v / (tot || 1) })).sort((a, b) => b.share - a.share);
    }
    averages() {
      let n = 0, cent = 0, flat = 0; const bands = new Float64Array(6);
      for (let f = 0; f < this.nF; f++) if (this.activeF[f]) { n++; cent += Math.log2(Math.max(this.cent[f], 50)); flat += Math.log10(this.flat[f] + 1e-9); for (let b = 0; b < 6; b++) bands[b] += Math.pow(10, this.bands[f * 6 + b] / 10); }
      if (!n) return null;
      return { centroid: Math.pow(2, cent / n), flatnessLog: flat / n, bands: Array.from(bands, v => 10 * Math.log10(v / n + 1e-12)) };
    }

    /* ---------- finish a session ---------- */
    finalize() {
      if (this.blk && this.blk.n > 0) { this.finishBlock(); this.blk = null; }
      for (let c = Math.max(NOV_K, this.nB - NOV_K - NOV_M); c <= this.nB - 1 - NOV_K; c++) this.pickBoundary(c, true);
      this.closeSegment(this.nB);
      if (this.chordSegs.length) this.chordSegs[this.chordSegs.length - 1].t1 = this.time;
      this.emit('finalized');
    }

    summary() {
      const dur = this.time;
      const act = []; for (let f = 0; f < this.nF; f++) if (this.activeF[f]) act.push(this.level[f]);
      const swing = act.length > this.fr * 3 ? percentile(act, 0.95) - percentile(act, 0.1) : null;
      const bpm = this.bpmHist.length > 8 ? median(this.bpmHist) : null;
      const lockedFrac = this.tempoUpdates ? this.bpmHist.length / this.tempoUpdates : 0;
      const keys = [];
      for (const k of this.keyTimeline) if (!keys.length || keys[keys.length - 1].key !== k.key) keys.push(k);
      const segs = this.segments.map(s => ({ ...s, t0: s.start * BLOCK, t1: s.end * BLOCK }));
      // chorus guess: the most repeated, loudest section
      const byLabel = {};
      for (const s of segs) {
        let lv = 0, n = 0; for (let b = s.start; b < s.end; b++) if (!this.bSilent[b]) { lv += Math.pow(10, this.bLevel[b] / 10); n++; }
        const o = byLabel[s.label] || (byLabel[s.label] = { count: 0, pow: 0, n: 0 });
        o.count++; o.pow += lv; o.n += n;
      }
      let chorus = null, cs = -1e9;
      for (const [L, o] of Object.entries(byLabel)) if (o.count >= 2) { const s = 10 * Math.log10(o.pow / Math.max(o.n, 1) + 1e-12) + 0.5 * o.count; if (s > cs) { cs = s; chorus = L; } }
      // repetition: share of blocks that strongly echo something earlier
      const st = this.statS; let rep = 0, tot = 0;
      for (let i = 16; i < this.nB; i++) {
        if (this.bSilent[i]) continue; tot++;
        let bz = -1e9; for (let j = 0; j <= i - 16; j++) { const z = (this.Ssm[i][j] - st.mean) / st.std; if (z > bz) bz = z; }
        if (bz > 1.2) rep++;
      }
      let loud = -1, lb = -1e9; for (let b = 0; b < this.nB; b++) if (this.bLevel[b] > lb) { lb = this.bLevel[b]; loud = b; }
      const top = [...this.moments].filter(m => m.type !== 'beat').sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.t - b.t);
      return {
        dur, bpm, lockedFrac, looseness: this.looseness, keys, segments: segs, chorus,
        repetition: tot > 10 ? rep / tot : null, swing, loudestT: loud >= 0 ? loud * BLOCK : null,
        widthSeen: this.stereoSeen, top, chordChanges: this.chordSegs.length
      };
    }
  }

  return { Engine, PC, keyName, chordName, family, fmtTime, BAND_NAMES, BAND_EDGES, SPEC_BINS, SPEC_FMIN, SPEC_OCT, BLOCK, KK_MAJ, KK_MIN };
})();
if (typeof module !== 'undefined') module.exports = AnatomyEngine;

