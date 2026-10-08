/* ============================================================
   ANATOMY APP — audio input, replay, and every visual.
   ============================================================ */
(() => {
  'use strict';
  const { Engine, PC, keyName, chordName, family, fmtTime, BAND_NAMES, SPEC_BINS, SPEC_FMIN, SPEC_OCT, BLOCK } = AnatomyEngine;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const MAX_SEC = 600;

  /* ---------------- color: every note name gets a hue, placed around the circle of fifths ---------------- */
  function oklch(L, C, hDeg) {
    const h = hDeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const f = (x) => { x = clamp(x); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
    return [f(r), f(g), f(bb)];
  }
  const fifthPos = (pc) => (pc * 7) % 12;
  const hueOf = (pc) => (65 + fifthPos(pc) * 30) % 360;
  const PC_RGB = Array.from({ length: 12 }, (_, pc) => oklch(0.8, 0.14, hueOf(pc)));
  const PC_DEEP = Array.from({ length: 12 }, (_, pc) => oklch(0.58, 0.12, hueOf(pc)));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const SECTION_COLORS = ['#8fb3ff', '#f0a35e', '#c39af5', '#6fd0b8', '#f27a8f', '#d9c96b', '#7fb9d4', '#cfa07f'];
  const TYPE = {
    drop: { label: 'Drop', color: '#f3a451' }, build: { label: 'Build', color: '#e46a86' }, key: { label: 'Key', color: '#c39af5' },
    section: { label: 'Section', color: '#8fb3ff' }, repeat: { label: 'Repeat', color: '#6fd0b8' }, bass: { label: 'Bass', color: '#d9c96b' },
    beat: { label: 'Beat', color: '#a69eb2' }
  };
  const INK = { text: '#f1ebe1', muted: '#a69eb2', faint: '#6c6578', line: '#2e2936', panel: '#1a1720', ground: '#121017', raise: '#231f2a', amber: '#f3a451', live: '#ff5d52' };
  const FONT = { display: '"Bricolage Grotesque", "Avenir Next", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace', body: '"IBM Plex Sans", system-ui, sans-serif' };

  // similarity palette for the shape: plum → rose → amber → cream
  const SHAPE_LUT = (() => {
    const stops = [[0, [21, 18, 26]], [0.28, [46, 31, 66]], [0.52, [110, 47, 100]], [0.72, [204, 88, 79]], [0.88, [243, 164, 81]], [1, [255, 241, 207]]];
    const lut = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1]; const u = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * u));
      lut[i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    }
    return lut;
  })();
  // spectrogram palette: brightness from level, hue from the nearest note name
  const SPEC_LUT = (() => {
    const lut = new Uint32Array(SPEC_BINS * 256);
    for (let b = 0; b < SPEC_BINS; b++) {
      const f = SPEC_FMIN * Math.pow(2, SPEC_OCT * (b + 0.5) / SPEC_BINS);
      const midi = 69 + 12 * Math.log2(f / 440), near = Math.round(midi), pc = ((near % 12) + 12) % 12;
      const focus = 1 - 1.6 * Math.abs(midi - near);
      for (let v = 0; v < 256; v++) {
        const t = v / 255;
        const L = 0.19 + 0.68 * Math.pow(t, 1.15), C = 0.012 + Math.min(1, t * 1.6) * (0.07 + 0.13 * clamp(focus));
        const [r, g, bb] = oklch(L, C, t < 0.08 ? 300 : hueOf(pc));
        lut[b * 256 + v] = (255 << 24) | (bb << 16) | (g << 8) | r;
      }
    }
    return lut;
  })();

  /* ---------------- canvas helpers ---------------- */
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function fit(cv) {
    const r = cv.getBoundingClientRect(), d = DPR();
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
    return false;
  }

  /* ---------------- recorder: keeps the session's audio so moments can be replayed ---------------- */
  class Recorder {
    constructor(sr, maxSec) { this.sr = sr; this.cap = Math.ceil(sr * maxSec); this.data = new Int16Array(Math.min(this.cap, sr * 60)); this.n = 0; }
    push(L, R) {
      if (this.n + L.length > this.data.length && this.data.length < this.cap) {
        const grown = new Int16Array(Math.min(this.cap, Math.max(this.data.length * 2, this.n + L.length))); grown.set(this.data.subarray(0, this.n)); this.data = grown;
      }
      const n = Math.min(L.length, this.data.length - this.n), d = this.data;
      for (let i = 0; i < n; i++) { const v = R ? 0.5 * (L[i] + R[i]) : L[i]; d[this.n + i] = v >= 1 ? 32767 : v <= -1 ? -32767 : v * 32767; }
      this.n += n;
    }
    slice(t0, t1) {
      const a = clamp(Math.round(t0 * this.sr), 0, this.n), b = clamp(Math.round(t1 * this.sr), 0, this.n);
      const out = new Float32Array(Math.max(0, b - a)); for (let i = 0; i < out.length; i++) out[i] = this.data[a + i] / 32767;
      return out;
    }
    get dur() { return this.n / this.sr; }
  }

  /* ---------------- state ---------------- */
  let actx = null, engine = null, rec = null, mode = 'boot', source = null;
  let live = null;            // { stream, srcNode, tap, sink, demoSrc }
  let play = null;            // replay in progress
  let workletReady = false;
  let lastBeatWall = -1e9, lastViewT = null;
  let shapeDirty = true, momentsDirty = true, summaryDirty = false;
  let hover = null;           // { kind: 'pair'|'time', ti, tj, t }
  let sessionStamp = new Date();
  const demoCache = {};
  let stopMixAudio = () => { };  // set by the Mix tab, so any other playback stops its previews
  const seenMoments = new Set();

  const WORKLET = `class AnatomyTap extends AudioWorkletProcessor{constructor(){super();this.n=0;this.L=new Float32Array(1024);this.R=new Float32Array(1024);}
process(inputs){const i=inputs[0];if(!i||!i.length)return true;const l=i[0],r=i[1]||i[0];for(let k=0;k<l.length;k++){this.L[this.n]=l[k];this.R[this.n]=r[k];if(++this.n===1024){this.port.postMessage({L:this.L,R:this.R},[this.L.buffer,this.R.buffer]);this.L=new Float32Array(1024);this.R=new Float32Array(1024);this.n=0;}}return true;}}
registerProcessor('anatomy-tap',AnatomyTap);`;

  /* ---------------- status & notices ---------------- */
  function setStatus(text, led) {
    $('status-text').textContent = text;
    $('led').className = 'led' + (led ? ' ' + led : '');
  }
  function notice(msg) { const n = $('notice'); if (!msg) { n.hidden = true; return; } n.textContent = msg; n.hidden = false; }
  function setButtons() {
    const listening = mode === 'listening';
    for (const [id, k] of [['src-mic', 'mic'], ['src-tab', 'tab'], ['src-demo', 'demo']]) {
      const b = $(id); b.setAttribute('aria-pressed', listening && source === k ? 'true' : 'false'); b.disabled = mode === 'boot';
    }
    $('stop').hidden = !listening;
    $('save-dna').disabled = mode !== 'stopped';
    momentsDirty = true;
  }

  /* ---------------- sessions ---------------- */
  function newSession(kind, sr, opts) {
    engine = new Engine(sr, Object.assign({ maxSec: MAX_SEC }, opts));
    rec = new Recorder(sr, MAX_SEC);
    source = kind; sessionStamp = new Date();
    seenMoments.clear(); shapeDirty = true; momentsDirty = true; summaryDirty = false;
    spec.drawnEnd = -1; lastBeatWall = -1e9; lastViewT = null; hover = null;
    engine.on((type, d) => {
      if (type === 'beat') { if (mode === 'listening') lastBeatWall = performance.now(); }
      else if (type === 'moment' || type === 'moments-changed') momentsDirty = true;
      else if (type === 'block' || type === 'section' || type === 'key') shapeDirty = true;
      else if (type === 'full') setTimeout(() => stopListening('Reached the 10-minute limit for one session, so listening stopped. Everything up to here is kept.'), 0);
    });
    clearSummary();
  }
  function ensureCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    return actx;
  }
  async function makeTap() {
    const ctx = actx;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        if (!workletReady) { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })); await ctx.audioWorklet.addModule(url); workletReady = true; }
        const node = new AudioWorkletNode(ctx, 'anatomy-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
        node.port.onmessage = (e) => ingest(e.data.L, e.data.R);
        return node;
      } catch (err) { /* fall through to the older processor */ }
    }
    const sp = ctx.createScriptProcessor(2048, 2, 1);
    sp.onaudioprocess = (e) => { const ib = e.inputBuffer; ingest(ib.getChannelData(0).slice(), ib.numberOfChannels > 1 ? ib.getChannelData(1).slice() : null); };
    return sp;
  }
  function ingest(L, R) {
    if (mode !== 'listening' || !engine) return;
    engine.push(L, R); rec.push(L, R);
  }

  async function start(kind) {
    notice(null);
    if (mode === 'listening') await stopListening();
    stopPlay();
    let ctx;
    try { ctx = ensureCtx(); await ctx.resume(); }
    catch (err) { notice('This browser could not start audio. Try the latest Chrome.'); return; }
    let stream = null, srcNode = null, demoSrc = null;
    try {
      if (kind === 'mic') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error(), { name: 'NoAPI' });
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        srcNode = ctx.createMediaStreamSource(stream);
      } else if (kind === 'tab') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw Object.assign(new Error(), { name: 'NoTab' });
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude' });
        const at = stream.getAudioTracks();
        if (!at.length) { stream.getTracks().forEach(t => t.stop()); notice('No sound came through. In the share window, choose a tab and switch on "Also share tab audio", then try again.'); return; }
        at[0].addEventListener('ended', () => stopListening('The tab stopped sharing its audio.'));
        srcNode = ctx.createMediaStreamSource(new MediaStream(at));
      } else {
        const song = demoCache[ctx.sampleRate] || (demoCache[ctx.sampleRate] = AnatomyDemo.render(ctx.sampleRate));
        const buf = ctx.createBuffer(2, song.L.length, song.sr); buf.copyToChannel(song.L, 0); buf.copyToChannel(song.R, 1);
        demoSrc = ctx.createBufferSource(); demoSrc.buffer = buf; srcNode = demoSrc;
      }
    } catch (err) {
      const n = err && err.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') notice(kind === 'tab' ? 'Sharing was cancelled or blocked. Choose "Listen to a browser tab" again and pick a tab to share.' : 'Microphone access is blocked. Click the icon at the left of the address bar, allow the microphone, then try again.');
      else if (n === 'NotFoundError') notice('No microphone was found. Plug one in or check your sound settings, then try again.');
      else if (n === 'NoAPI') notice('This browser does not allow microphone access from this page. Open it in Chrome, or serve it from localhost.');
      else if (n === 'NoTab') notice('This browser cannot share another tab\'s audio. Chrome and Edge on a computer can.');
      else notice('Could not start listening' + (err && err.message ? `: ${err.message}` : '.'));
      return;
    }
    newSession(kind, ctx.sampleRate, {});
    const tap = await makeTap();
    const sink = ctx.createGain(); sink.gain.value = 0;
    srcNode.connect(tap); tap.connect(sink); sink.connect(ctx.destination);
    if (demoSrc) { demoSrc.connect(ctx.destination); demoSrc.onended = () => stopListening(); demoSrc.start(); }
    live = { stream, srcNode, tap, sink, demoSrc };
    mode = 'listening';
    setStatus(kind === 'mic' ? 'Listening to your microphone' : kind === 'tab' ? 'Listening to the shared tab' : 'Playing and analyzing the demo song', 'live');
    $('mom-hint').textContent = 'Found as they happen. New sections are confirmed about 9 seconds after they start, then placed at the right time.';
    setButtons();
  }

  async function stopListening(reason) {
    if (mode !== 'listening') return;
    mode = 'stopped';
    const L = live; live = null;
    if (L) {
      try { L.srcNode.disconnect(); } catch (e) { }
      try { L.tap.disconnect(); if (L.tap.port) L.tap.port.onmessage = null; else L.tap.onaudioprocess = null; } catch (e) { }
      try { L.sink.disconnect(); } catch (e) { }
      if (L.demoSrc) { L.demoSrc.onended = null; try { L.demoSrc.stop(); } catch (e) { } }
      if (L.stream) L.stream.getTracks().forEach(t => t.stop());
    }
    engine.finalize();
    setStatus('Session finished. Click the timeline, the shape or a moment to replay it.', 'done');
    $('mom-hint').textContent = 'Press Play on any moment to hear it again.';
    summaryDirty = true; shapeDirty = true;
    setButtons();
    if (reason) notice(reason);
  }

  function runExample() {
    mode = 'boot'; setButtons();
    setStatus('Analyzing the built-in demo song…', 'busy');
    const sr = 44100;
    setTimeout(() => {
      const song = AnatomyDemo.render(sr);
      newSession('example', sr, { pitchEvery: 6 });
      mode = 'example';
      let i = 0; const n = song.L.length, CH = 4096;
      const step = () => {
        const until = performance.now() + 18;
        while (i < n && performance.now() < until) {
          const L = song.L.subarray(i, i + CH), R = song.R.subarray(i, i + CH);
          engine.push(L, R); rec.push(L, R); i += CH;
        }
        $('clock').textContent = fmtTime(engine.time);
        if (i < n) setTimeout(step, 0);
        else {
          engine.finalize(); mode = 'stopped'; summaryDirty = true; shapeDirty = true; setButtons();
          exampleSession = { engine, rec, stamp: sessionStamp };
          setStatus('This is the built-in demo song, already analyzed. Choose a source above to analyze your own sound.', 'done');
          $('mom-hint').textContent = 'Press Play on any moment to hear it.';
        }
      };
      step();
    }, 40);
  }

  /* ---------------- replay ---------------- */
  function playSegments(segs) {
    if (mode === 'listening' || mode === 'boot' || !rec || !rec.n) return;
    stopPlay();
    const ctx = ensureCtx(); ctx.resume();
    const gap = 0.4, sr = rec.sr; let total = 0;
    for (const s of segs) { s.t0 = clamp(s.t0, 0, rec.dur); s.dur = Math.min(s.dur, rec.dur - s.t0); total += s.dur + gap; }
    if (total <= gap) return;
    const buf = ctx.createBuffer(1, Math.ceil(total * sr), sr), data = buf.getChannelData(0);
    let at = 0; const fade = Math.round(0.01 * sr);
    for (const s of segs) {
      const x = rec.slice(s.t0, s.t0 + s.dur); const o = Math.round(at * sr);
      for (let i = 0; i < x.length; i++) { const g = Math.min(1, i / fade, (x.length - i) / fade); data[o + i] = x[i] * g; }
      s.at = at; at += s.dur + gap;
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
    play = { segs, src, start: ctx.currentTime, total: at };
    src.onended = () => { if (play && play.src === src) { play = null; spec.drawnEnd = -1; } };
  }
  function stopPlay() { stopMixAudio(); if (play) { try { play.src.onended = null; play.src.stop(); } catch (e) { } play = null; spec.drawnEnd = -1; } }
  function viewTime() {
    if (!play || !actx) return null;
    const el = actx.currentTime - play.start;
    for (const s of play.segs) if (el >= s.at && el < s.at + s.dur) return s.t0 + (el - s.at);
    return null;
  }

  /* ---------------- geometry shared by the shape and the timeline ---------------- */
  const LABEL_W = 64;
  function timeSpan() { return Math.max(30, engine ? engine.nB * BLOCK : 30); }
  function plotX(cv) { const d = DPR(); return { x0: LABEL_W * d, x1: cv.width - 8 * d }; }

  /* ---------------- the shape (self-similarity triangle) ---------------- */
  const shapeCv = document.createElement('canvas'); let shapeImg = null, shapeCap = 0;
  function rebuildShape() {
    const N = engine.nB; if (!N) return;
    if (N > shapeCap) {
      shapeCap = Math.min(Math.ceil(MAX_SEC / BLOCK) + 8, Math.max(256, Math.ceil(N / 128) * 128));
      shapeCv.width = shapeCap; shapeCv.height = shapeCap;
      shapeImg = shapeCv.getContext('2d').createImageData(shapeCap, shapeCap);
    }
    const u32 = new Uint32Array(shapeImg.data.buffer), W = shapeCap;
    const st = engine.statS, lo = st.mean - 0.9 * st.std, hi = st.mean + 3.2 * st.std, k = 255 / (hi - lo);
    const ground = SHAPE_LUT[0];
    for (let i = 0; i < N; i++) {
      const row = engine.Ssm[i], off = i * W, si = engine.bSilent[i];
      for (let j = 0; j <= i; j++) {
        if (si || engine.bSilent[j]) { u32[off + j] = ground; continue; }
        const v = j === i ? 150 : Math.round(clamp((row[j] - lo) * k, 0, 255));
        u32[off + j] = SHAPE_LUT[v];
      }
    }
    shapeCv.getContext('2d').putImageData(shapeImg, 0, 0, 0, 0, N, N);
  }
  function triGeom(cv) {
    const { x0, x1 } = plotX(cv), d = DPR();
    const span = timeSpan() / BLOCK, s = (x1 - x0) / span, base = cv.height - 2 * d, vs = (cv.height - 8 * d) / (span / 2);
    return { x0, x1, s, base, vs, span };
  }
  function drawShape(view) {
    const cv = $('tri'); fit(cv); const g = cv.getContext('2d'), d = DPR();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const { x0, x1, s, base, vs } = triGeom(cv);
    // axis caption
    g.fillStyle = INK.faint; g.font = `${10 * d}px ${FONT.mono}`; g.textBaseline = 'top';
    g.fillText('FAR', 4 * d, 6 * d); g.fillText('APART', 4 * d, 18 * d);
    g.textBaseline = 'bottom'; g.fillText('CLOSE', 4 * d, base - 2 * d);
    if (!engine || !engine.nB) { g.fillStyle = INK.faint; g.font = `${13 * d}px ${FONT.body}`; g.textBaseline = 'middle'; g.fillText('The shape draws itself as sound comes in.', x0 + 12 * d, cv.height / 2); return; }
    const N = engine.nB;
    g.save();
    g.beginPath(); g.rect(x0, 0, x1 - x0 + 1, base + 1); g.clip();
    g.imageSmoothingEnabled = s < 5; g.imageSmoothingQuality = 'high';
    g.setTransform(s / 2, vs / 2, s / 2, -vs / 2, x0, base);
    g.drawImage(shapeCv, 0, 0, N, N, 0, 0, N, N);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // relations of the current moment: a Λ opening from the playhead
    const tNow = view.mode === 'live' ? engine.time : view.mode === 'replay' ? view.t : null;
    const lam = (t, color, width) => {
      const b = t / BLOCK, xb = x0 + s * b;
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath(); g.moveTo(x0 + s * b / 2, base - vs * b / 2); g.lineTo(xb, base);
      const r = Math.max(0, N - b); g.lineTo(xb + s * r / 2, base - vs * r / 2); g.stroke();
    };
    if (tNow != null) lam(tNow, view.mode === 'live' ? 'rgba(255,93,82,0.55)' : 'rgba(241,235,225,0.5)', 1.2 * d);
    if (hover && hover.kind === 'time') lam(hover.t, 'rgba(241,235,225,0.35)', 1 * d);
    // live repeat: mark the matched point
    const rep = view.mode === 'live' && engine.repeatOf;
    const mark = (i, j, color) => {
      const x = x0 + s * (i + j + 1) / 2, y = base - vs * (i - j) / 2;
      g.strokeStyle = color; g.lineWidth = 2 * d; g.beginPath(); g.arc(x, y, 6 * d, 0, Math.PI * 2); g.stroke();
    };
    if (rep) mark(rep.i, rep.j, 'rgba(111,208,184,0.95)');
    if (hover && hover.kind === 'pair') mark(hover.i, hover.j, INK.text);
    g.restore();
    // baseline
    g.strokeStyle = INK.line; g.lineWidth = d; g.beginPath(); g.moveTo(x0, base + 0.5); g.lineTo(x1, base + 0.5); g.stroke();
  }

  /* ---------------- timeline lanes ---------------- */
  const LANES = { pins: [2, 14], sec: [18, 42], chord: [46, 64], key: [68, 80], energy: [86, 128], axis: [132, 148] };
  function drawLanes(view) {
    const cv = $('lanes'); fit(cv); const g = cv.getContext('2d'), d = DPR();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const { x0, x1 } = plotX(cv), span = timeSpan(), X = (t) => x0 + (t / span) * (x1 - x0), Y = (v) => v * d;
    g.font = `${10 * d}px ${FONT.mono}`; g.textBaseline = 'middle'; g.fillStyle = INK.faint;
    const lab = (txt, lane) => g.fillText(txt, 4 * d, Y((LANES[lane][0] + LANES[lane][1]) / 2));
    lab('SECTIONS', 'sec'); lab('CHORDS', 'chord'); lab('KEY', 'key'); lab('ENERGY', 'energy');
    if (!engine) return;
    const now = engine.time;
    // sections
    const labels = engine.displayLabels();
    const segs = engine.segments.slice();
    for (const sg of segs) {
      const endT = sg.open ? now : sg.end * BLOCK;
      const a = X(sg.start * BLOCK), b = X(endT), L = labels[sg.label] || '?';
      const col = SECTION_COLORS[(L.charCodeAt(0) - 65) % SECTION_COLORS.length];
      g.fillStyle = col; g.globalAlpha = sg.open ? 0.55 : 0.9;
      roundRect(g, a + d, Y(LANES.sec[0]), Math.max(1, b - a - 2 * d), Y(LANES.sec[1] - LANES.sec[0]), 3 * d); g.fill();
      g.globalAlpha = 1;
      if (b - a > 18 * d) {
        g.fillStyle = '#16131b'; g.font = `600 ${11 * d}px ${FONT.mono}`; g.textBaseline = 'middle';
        const txt = L + (sg.shift ? (sg.shift > 0 ? ` +${sg.shift}` : ` ${sg.shift}`) : '');
        g.fillText(txt, a + 6 * d, Y((LANES.sec[0] + LANES.sec[1]) / 2));
      }
    }
    if (engine.segStart >= 0 && !segs.length) {
      const a = X(engine.segStart * BLOCK), b = X(now);
      g.strokeStyle = INK.line; g.setLineDash([3 * d, 3 * d]); g.strokeRect(a + d, Y(LANES.sec[0]) + 0.5, Math.max(1, b - a - 2 * d), Y(LANES.sec[1] - LANES.sec[0]) - 1); g.setLineDash([]);
    }
    // chords
    const cs = engine.chordSegs;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k], t1 = k === cs.length - 1 && mode === 'listening' && engine.chordCur === c.chord ? now : c.t1;
      if (t1 <= c.t0) continue;
      const a = X(c.t0), b = X(t1), root = c.chord % 12, minor = c.chord >= 12;
      g.fillStyle = rgba(minor ? PC_DEEP[root] : PC_RGB[root], 0.95);
      g.fillRect(a, Y(LANES.chord[0]), Math.max(1, b - a - d), Y(LANES.chord[1] - LANES.chord[0]));
      if (b - a > 24 * d) { g.fillStyle = '#16131b'; g.font = `600 ${10.5 * d}px ${FONT.mono}`; g.fillText(chordName(c.chord), a + 4 * d, Y((LANES.chord[0] + LANES.chord[1]) / 2)); }
    }
    // key
    const kt = engine.keyTimeline;
    for (let k = 0; k < kt.length; k++) {
      const t0 = kt[k].t, t1 = k + 1 < kt.length ? kt[k + 1].t : now; const a = X(t0), b = X(t1);
      const tonic = kt[k].key % 12;
      g.fillStyle = rgba(PC_RGB[tonic], 0.35); g.fillRect(a, Y(LANES.key[0]), Math.max(1, b - a - d), Y(LANES.key[1] - LANES.key[0]));
      g.fillStyle = rgba(PC_RGB[tonic], 1); g.fillRect(a, Y(LANES.key[0]), 2 * d, Y(LANES.key[1] - LANES.key[0]));
      if (b - a > 70 * d) { g.fillStyle = INK.text; g.font = `${10.5 * d}px ${FONT.mono}`; g.fillText(keyName(kt[k].key), a + 6 * d, Y((LANES.key[0] + LANES.key[1]) / 2)); }
    }
    // energy (block loudness)
    const N = engine.nB;
    if (N > 1) {
      let lo = 1e9, hi = -1e9; for (let b = 0; b < N; b++) if (!engine.bSilent[b]) { lo = Math.min(lo, engine.bLevel[b]); hi = Math.max(hi, engine.bLevel[b]); }
      if (hi > lo) {
        lo = Math.max(lo, hi - 40);
        const top = Y(LANES.energy[0]), bot = Y(LANES.energy[1]), yv = (v) => bot - (bot - top) * clamp((v - lo) / (hi - lo));
        g.beginPath(); g.moveTo(X(0), bot);
        for (let b = 0; b < N; b++) g.lineTo(X((b + 0.5) * BLOCK), engine.bSilent[b] ? bot : yv(engine.bLevel[b]));
        g.lineTo(X(N * BLOCK), bot); g.closePath();
        const grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, 'rgba(243,164,81,0.55)'); grad.addColorStop(1, 'rgba(243,164,81,0.04)');
        g.fillStyle = grad; g.fill();
        g.beginPath();
        for (let b = 0; b < N; b++) { const x = X((b + 0.5) * BLOCK), y = engine.bSilent[b] ? bot : yv(engine.bLevel[b]); b ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.strokeStyle = INK.amber; g.lineWidth = 1.4 * d; g.stroke();
      }
    }
    // moment pins
    for (const m of engine.moments) {
      if (m.type === 'beat') continue;
      const x = X(m.t), col = (TYPE[m.type] || TYPE.section).color;
      g.fillStyle = col; g.beginPath(); g.moveTo(x - 4 * d, Y(LANES.pins[0])); g.lineTo(x + 4 * d, Y(LANES.pins[0])); g.lineTo(x, Y(LANES.pins[1])); g.closePath(); g.fill();
    }
    // time axis
    const pxPerSec = (x1 - x0) / span / d; const steps = [5, 10, 15, 30, 60, 120, 300];
    const step = steps.find(s2 => s2 * pxPerSec >= 56) || 300;
    g.fillStyle = INK.faint; g.font = `${10 * d}px ${FONT.mono}`; g.textBaseline = 'middle';
    for (let t = 0; t <= span + 0.01; t += step) {
      const x = X(t); g.fillRect(x, Y(LANES.axis[0]), d, 4 * d);
      g.fillText(fmtTime(t), x + 3 * d, Y(LANES.axis[0] + 10));
    }
    // playhead & hover
    const vline = (t, color, dash) => { const x = X(t); g.strokeStyle = color; g.lineWidth = 1.3 * d; if (dash) g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, Y(LANES.energy[1])); g.stroke(); g.setLineDash([]); };
    if (view.mode === 'live') vline(now, INK.live);
    if (view.mode === 'replay') vline(view.t, INK.text);
    if (hover && hover.kind === 'time') vline(hover.t, 'rgba(241,235,225,0.6)', true);
    if (hover && hover.kind === 'pair') { vline(hover.tj, 'rgba(241,235,225,0.7)', true); vline(hover.ti, 'rgba(241,235,225,0.7)', true); }
  }
  function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------------- spectrogram ---------------- */
  const spec = { W: 0, img: null, u32: null, cv: document.createElement('canvas'), drawnEnd: -1 };
  function specColumn(f, col) {
    const u = spec.u32, W = spec.W, S = engine.spec, ok = f >= 0 && f < engine.nF, off = f * SPEC_BINS;
    for (let b = 0; b < SPEC_BINS; b++) { const v = ok ? S[off + b] : 0; u[(SPEC_BINS - 1 - b) * W + col] = SPEC_LUT[b * 256 + v]; }
  }
  function drawSpec(view) {
    const cv = $('spec'); const resized = fit(cv); const g = cv.getContext('2d');
    const W = cv.width;
    if (resized || spec.W !== W) { spec.W = W; spec.cv.width = W; spec.cv.height = SPEC_BINS; spec.img = spec.cv.getContext('2d').createImageData(W, SPEC_BINS); spec.u32 = new Uint32Array(spec.img.data.buffer); spec.drawnEnd = -1; }
    if (!engine) return;
    const endF = view.mode === 'replay' ? Math.round(view.t * engine.fr) : engine.nF;
    const sctx = spec.cv.getContext('2d');
    if (spec.drawnEnd < 0 || endF < spec.drawnEnd || endF - spec.drawnEnd >= W) {
      for (let f = endF - W; f < endF; f++) specColumn(f, ((f % W) + W) % W);
      sctx.putImageData(spec.img, 0, 0);
    } else if (endF > spec.drawnEnd) {
      for (let f = spec.drawnEnd; f < endF; f++) specColumn(f, f % W);
      const a = spec.drawnEnd % W, b = endF % W;
      if (b > a) sctx.putImageData(spec.img, 0, 0, a, 0, b - a, SPEC_BINS);
      else { sctx.putImageData(spec.img, 0, 0, a, 0, W - a, SPEC_BINS); sctx.putImageData(spec.img, 0, 0, 0, 0, b, SPEC_BINS); }
    }
    spec.drawnEnd = endF;
    const p = ((endF % W) + W) % W;
    g.imageSmoothingEnabled = true;
    g.drawImage(spec.cv, p, 0, W - p, SPEC_BINS, 0, 0, W - p, cv.height);
    if (p > 0) g.drawImage(spec.cv, 0, 0, p, SPEC_BINS, W - p, 0, p, cv.height);
  }
  function drawSpecAxis() {
    const cv = $('spec-axis'); if (!fit(cv) && cv.dataset.done) return; cv.dataset.done = '1';
    const g = cv.getContext('2d'), d = DPR(), H = cv.height, W = cv.width;
    g.clearRect(0, 0, W, H);
    const y = (f) => H * (1 - Math.log2(f / SPEC_FMIN) / SPEC_OCT);
    for (let m = 24; m <= 120; m++) {
      const f = 440 * Math.pow(2, (m - 69) / 12); if (f < SPEC_FMIN || f > 16000) continue;
      const pc = m % 12, yy = y(f), isC = pc === 0;
      g.fillStyle = rgba(PC_RGB[pc], isC ? 1 : 0.75);
      g.fillRect(W - (isC ? 12 : 6) * d, yy - 0.5 * d, (isC ? 12 : 6) * d, Math.max(1, d));
      if (isC) { g.fillStyle = INK.muted; g.font = `${9.5 * d}px ${FONT.mono}`; g.textBaseline = 'middle'; g.fillText('C' + (Math.floor(m / 12) - 1), 0, Math.min(H - 6 * d, Math.max(6 * d, yy))); }
    }
  }

  /* ---------------- rail cards ---------------- */
  const meterDefs = [['Dark', 'Bright', 'bright'], ['Noisy', 'Tonal', 'tonal'], ['Smooth', 'Punchy', 'punch'], ['Free', 'Pulsing', 'pulse'], ['Unpitched', 'Pitched', 'pitched']];
  const meterEls = {}, barEls = [];
  (() => {
    const box = $('meters');
    for (const [a, b, k] of meterDefs) {
      const row = document.createElement('div'); row.className = 'meter';
      row.innerHTML = `<span>${a}</span><div class="meter-track"><div class="meter-dot"></div></div><span>${b}</span>`;
      box.appendChild(row); meterEls[k] = row.querySelector('.meter-dot');
    }
    const bars = $('bars');
    BAND_NAMES.forEach((n, i) => {
      const el = document.createElement('div'); el.className = 'bar';
      el.innerHTML = `<div class="bar-fill"></div><div class="bar-label" title="${AnatomyEngine.BAND_EDGES[i]}–${AnatomyEngine.BAND_EDGES[i + 1]} Hz">${n}</div>`;
      bars.appendChild(el); barEls.push(el.firstChild);
    });
  })();
  const smooth = { bands: new Float64Array(6).fill(-90) };
  const ROMAN = { 0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♭V', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' };
  function roman(chord, key) {
    if (chord < 0 || key < 0) return null;
    const tonic = key % 12, root = chord % 12, r = ROMAN[(root - tonic + 12) % 12];
    return chord >= 12 ? r.toLowerCase() : r;
  }
  function relativeOf(key) { return key < 12 ? 12 + (key + 9) % 12 : (key - 12 + 3) % 12; }
  function loosenessText(ms) {
    if (ms == null) return null;
    if (ms < 6) return `Hits land within ${ms.toFixed(1)} ms of a perfectly steady grid. That's tighter than human hands, which usually means programmed drums or a click track.`;
    if (ms < 15) return `Hits land within about ${ms.toFixed(0)} ms of a steady grid: tight playing, possibly to a click track.`;
    return `Hits drift about ${ms.toFixed(0)} ms around a steady grid, the way a live band breathes.`;
  }
  let cardsAt = 0;
  function updateCards(view, now) {
    if (now - cardsAt < 50) return; cardsAt = now;
    const e = engine; if (!e) return;
    const sum = view.mode !== 'live' && mode === 'stopped' ? (e._sumCache || (e._sumCache = e.summary())) : null;
    // ---- pulse
    let bpmTxt = '—', chip = ['Quiet', ''], why = 'Waiting for a steady beat.';
    if (view.mode === 'live') {
      if (e.locked) { bpmTxt = Math.round(e.bpm); chip = ['Locked', 'good']; why = loosenessText(e.looseness) || `One beat every ${(60000 / e.bpm).toFixed(0)} ms. Measuring how steady it is…`; }
      else if (e.active) { chip = ['Searching', 'warm']; why = 'No steady beat yet. The hits aren\'t lining up at one spacing.'; }
    } else if (sum) {
      if (sum.bpm) { bpmTxt = sum.bpm.toFixed(0); chip = [view.mode === 'replay' ? 'Replay' : 'Whole session', 'good']; why = (loosenessText(sum.looseness) || '') + ` A steady beat was found ${Math.round(sum.lockedFrac * 100)}% of the time.`; }
      else { chip = ['No steady beat', '']; why = 'Nothing in this session lined up into a steady pulse.'; }
    }
    $('bpm').textContent = bpmTxt; setChip('pulse-chip', chip); $('pulse-why').textContent = why;
    // ---- harmony
    let chroma = null, chord = -1, key = -1, keyConf = null, harmWhy = '';
    if (view.mode === 'live') { chroma = e.active && e.chromaStrength > 0.15 ? e.cS : null; chord = e.chordCur; key = e.keyDisp; keyConf = e.keyConf; }
    else if (view.mode === 'replay') { chroma = e.chromaAt(view.t); chord = e.chordAt(view.t); key = e.keyAt(view.t); }
    else if (sum) { chroma = memo(e, 'chroma', () => e.sessionChroma()); key = sum.keys.length ? sum.keys[sum.keys.length - 1].key : -1; }
    const center = view.mode === 'summary' ? (key >= 0 ? { big: keyName(key).replace(' major', '').replace(' minor', 'm'), small: 'key' } : null) : (chord >= 0 ? { big: chordName(chord), small: roman(chord, key) || 'chord' } : null);
    drawWheel(chroma, key, center);
    if (key >= 0) setChip('key-chip', [keyName(key) + (keyConf != null ? ` · ${keyConf > 0.6 ? 'clear' : keyConf > 0.3 ? 'likely' : 'unsure'}` : ''), keyConf != null && keyConf > 0.6 ? 'good' : '']); else setChip('key-chip', ['—', '']);
    if (view.mode === 'summary' && sum) {
      const top = memo(e, 'shares', () => e.chordShares()).slice(0, 4).map(c => `${chordName(c.chord)} ${Math.round(c.share * 100)}%`);
      harmWhy = (sum.keys.length > 1 ? `The key moves: ${sum.keys.map(k => keyName(k.key)).join(' → ')}. ` : key >= 0 ? `Home key: ${keyName(key)}. It shares every note with ${keyName(relativeOf(key))}, so either reading can be fair. ` : '') + (top.length ? `Most-used chords: ${top.join(', ')}.` : '');
    } else if (chord >= 0 && key >= 0) harmWhy = `Now playing ${chordName(chord)}, the ${roman(chord, key)} chord in ${keyName(key)}. The ring marks the seven notes of the key.`;
    else if (key >= 0) harmWhy = `Key so far: ${keyName(key)}. The ring marks its seven notes.`;
    else harmWhy = 'Notes light up around the circle of fifths. Neighbors on the circle sound good together.';
    $('harm-why').textContent = harmWhy;
    // ---- character
    let ch, desc;
    if (view.mode === 'live') { ch = { bright: e.ch.bright, tonal: 1 - e.ch.noisy, punch: e.ch.punch, pulse: e.ch.pulse, pitched: e.ch.pitched }; desc = e.description; }
    else if (view.mode === 'replay') { ch = frameCharacter(e, Math.round(view.t * e.fr)); desc = `Replaying ${fmtTime(view.t)}.`; }
    else if (sum) { ch = memo(e, 'char', () => sessionCharacter(e, sum)); desc = memo(e, 'desc', () => sessionDescription(e, sum)); }
    else { ch = { bright: 0, tonal: 0, punch: 0, pulse: 0, pitched: 0 }; desc = '—'; }
    for (const [, , k] of meterDefs) meterEls[k].style.left = (clamp(ch[k]) * 100) + '%';
    $('sounds').textContent = desc;
    // ---- balance
    let bands = null, lvl = null;
    if (view.mode === 'live' && e.nF) { const f = e.nF - 1; bands = Array.from({ length: 6 }, (_, b) => e.bands[f * 6 + b]); lvl = e.level[f]; }
    else if (view.mode === 'replay') { const f = clamp(Math.round(view.t * e.fr), 0, e.nF - 1); bands = Array.from({ length: 6 }, (_, b) => e.bands[f * 6 + b]); lvl = e.level[f]; }
    else if (sum) { const av = memo(e, 'avg', () => e.averages()); bands = av ? av.bands : null; }
    if (bands) {
      const a = view.mode === 'summary' ? 1 : 0.5;
      for (let b = 0; b < 6; b++) smooth.bands[b] += (bands[b] - smooth.bands[b]) * a;
      const mx = Math.max(...smooth.bands);
      barEls.forEach((el, b) => { el.style.height = (4 + 96 * clamp((smooth.bands[b] - (mx - 30)) / 30)) + '%'; });
    }
    setChip('level-chip', [lvl != null ? `${Math.max(-99, lvl).toFixed(0)} dBFS` : sum && sum.swing != null ? `${sum.swing.toFixed(0)} dB range` : '—', '']);
    $('bal-why').textContent = view.mode === 'summary' && sum ? (sum.swing != null ? `Average balance for the session. Quiet and loud passages differ by about ${sum.swing.toFixed(0)} dB.` : 'Average balance for the session.') : 'How the energy splits from deep sub-bass up to the airy top end. Level depends on volume and mic distance, so compare shapes rather than numbers.';
    const wr = $('width-row'); wr.hidden = !e.stereoSeen;
    if (e.stereoSeen) { const w = clamp(e.width / 0.35); $('width-fill').style.width = (w * 100) + '%'; $('width-val').textContent = w < 0.08 ? 'mono' : w < 0.4 ? 'narrow' : w < 0.75 ? 'wide' : 'very wide'; }
  }
  function memo(e, k, fn) { const c = e._memo || (e._memo = {}); return k in c ? c[k] : (c[k] = fn()); }
  function setChip(id, [txt, cls]) { const el = $(id); el.textContent = txt; el.className = 'chip' + (cls ? ' ' + cls : ''); }
  function frameCharacter(e, f) {
    f = clamp(f, 0, e.nF - 1); const w = Math.round(e.fr * 0.4); let n = 0, cent = 0, flat = 0, conf = 0, pit = 0, pk = 0, pw = 0;
    for (let i = Math.max(0, f - w); i <= Math.min(e.nF - 1, f + w); i++) { n++; cent += Math.log2(Math.max(e.cent[i], 100)); flat += Math.log10(e.flat[i] + 1e-9); conf += e.confF[i]; pit += e.clarF[i] > 0.85 ? 1 : 0; pk = Math.max(pk, e.peaks[i]); pw += Math.pow(10, e.level[i] / 10); }
    const crest = 20 * Math.log10(pk / Math.sqrt(pw / n + 1e-12) + 1e-9);
    return { bright: clamp((cent / n - Math.log2(200)) / Math.log2(30)), tonal: 1 - clamp((flat / n + 2) / 1.8), punch: clamp((crest - 6) / 14), pulse: conf / n, pitched: pit / n };
  }
  function sessionCharacter(e, sum) {
    const av = e.averages(); if (!av) return { bright: 0, tonal: 0, punch: 0, pulse: 0, pitched: 0 };
    let pit = 0, act = 0; for (let f = 0; f < e.nF; f++) if (e.activeF[f]) { act++; if (e.clarF[f] > 0.85) pit++; }
    return { bright: clamp((Math.log2(av.centroid) - Math.log2(200)) / Math.log2(30)), tonal: 1 - clamp((av.flatnessLog + 2) / 1.8), punch: e.ch.punch, pulse: sum.lockedFrac, pitched: act ? pit / act : 0 };
  }
  function sessionDescription(e, sum) {
    if (!sum.dur || e.soundTime < 1) return 'Mostly quiet.';
    const parts = [];
    if (sum.lockedFrac > 0.5) parts.push(`A steady beat${sum.bpm ? ` around ${sum.bpm.toFixed(0)} BPM` : ''} for most of it`);
    else if (sum.lockedFrac > 0.15) parts.push('A beat that comes and goes');
    else parts.push('No steady beat');
    if (sum.keys.length) parts.push(`harmony centered on ${keyName(sum.keys[0].key)}${sum.keys.length > 1 ? ' before moving' : ''}`);
    if (sum.segments.length > 1) parts.push(`${sum.segments.length} sections`);
    return parts.join(', ') + '.';
  }

  /* ---------------- harmony wheel ---------------- */
  function drawWheel(chroma, key, center) {
    const cv = $('wheel'); fit(cv); const g = cv.getContext('2d'), d = DPR(), W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4 * d, r0 = R * 0.46, r1 = R * 0.84;
    const ang = (pos) => -Math.PI / 2 + pos * Math.PI / 6;
    // key ring: the seven notes of the key sit next to each other on this circle
    if (key >= 0) {
      const fam = family(key), p0 = fifthPos(fam) - 1;
      g.strokeStyle = 'rgba(241,235,225,0.75)'; g.lineWidth = 3 * d; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, R * 0.93, ang(p0) - Math.PI / 12 + 0.04, ang(p0 + 6) + Math.PI / 12 - 0.04); g.stroke();
      const tp = fifthPos(key % 12); g.fillStyle = INK.text; g.beginPath(); g.arc(cx + Math.cos(ang(tp)) * R * 0.93, cy + Math.sin(ang(tp)) * R * 0.93, 5 * d, 0, Math.PI * 2); g.fill();
    }
    for (let pc = 0; pc < 12; pc++) {
      const p = fifthPos(pc), a0 = ang(p) - Math.PI / 12 + 0.02, a1 = ang(p) + Math.PI / 12 - 0.02;
      const v = chroma ? clamp(Math.pow(chroma[pc] / Math.max(...chroma, 1e-9), 1.3)) : 0;
      g.beginPath(); g.arc(cx, cy, r1, a0, a1); g.arc(cx, cy, r0, a1, a0, true); g.closePath();
      g.fillStyle = rgba(PC_RGB[pc], 0.1 + 0.9 * v); g.fill();
      const lx = cx + Math.cos(ang(p)) * (r0 + r1) / 2, ly = cy + Math.sin(ang(p)) * (r0 + r1) / 2;
      g.fillStyle = v > 0.55 ? '#16131b' : INK.muted; g.font = `600 ${11.5 * d}px ${FONT.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(PC[pc], lx, ly);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (center) {
      g.fillStyle = INK.text; g.font = `700 ${Math.round(R * 0.26)}px ${FONT.display}`; g.fillText(center.big, cx, cy - R * 0.04);
      g.fillStyle = INK.muted; g.font = `${10.5 * d}px ${FONT.mono}`; g.fillText(center.small, cx, cy + R * 0.2);
    } else { g.fillStyle = INK.faint; g.font = `${11 * d}px ${FONT.mono}`; g.fillText('no chord', cx, cy); }
    g.textAlign = 'start';
  }

  /* ---------------- beat pulse & logo ---------------- */
  function drawBeat(view, now) {
    const cv = $('beat'); fit(cv); const g = cv.getContext('2d'), d = DPR(), W = cv.width, c = W / 2;
    g.clearRect(0, 0, W, W);
    if (view.mode === 'replay' && engine && lastViewT != null) {
      for (const bt of engine.beatTimes) if (bt > lastViewT && bt <= view.t) { lastBeatWall = now; break; }
    }
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = Math.exp(-(now - lastBeatWall) / 170);
    const r = W * 0.3 * (reduce ? 1 : 1 + 0.35 * a);
    g.strokeStyle = `rgba(243,164,81,${0.25 + 0.75 * a})`; g.lineWidth = 3 * d; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = `rgba(243,164,81,${0.12 + 0.6 * a})`; g.beginPath(); g.arc(c, c, W * 0.17, 0, Math.PI * 2); g.fill();
  }
  function drawLogo() {
    const cv = $('logo'), g = cv.getContext('2d'), W = cv.width, c = W / 2;
    g.clearRect(0, 0, W, W);
    const ch = engine && mode === 'listening' && engine.active ? engine.cS : null; const mx = ch ? Math.max(...ch, 1e-9) : 1;
    for (let pc = 0; pc < 12; pc++) {
      const p = fifthPos(pc), a = -Math.PI / 2 + p * Math.PI / 6, v = ch ? ch[pc] / mx : 0.55;
      g.fillStyle = rgba(PC_RGB[pc], 0.35 + 0.65 * v);
      g.beginPath(); g.arc(c + Math.cos(a) * W * 0.36, c + Math.sin(a) * W * 0.36, W * (0.055 + 0.05 * v), 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------------- moments list ---------------- */
  function renderMoments() {
    momentsDirty = false;
    const list = $('moments'); list.textContent = '';
    if (!engine) return;
    const ms = engine.moments.slice().sort((a, b) => mode === 'listening' ? b.t - a.t : a.t - b.t);
    if (!ms.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = mode === 'listening' ? 'Nothing yet. Moments appear here as the engine notices them.' : 'No moments in this session.'; list.appendChild(li); return; }
    const canPlay = mode === 'stopped';
    for (const m of ms) {
      const li = document.createElement('li'); li.className = 'moment';
      if (!seenMoments.has(m.id)) { if (mode === 'listening') li.classList.add('fresh'); seenMoments.add(m.id); }
      const tp = TYPE[m.type] || TYPE.section;
      const time = document.createElement('span'); time.className = 'm-time'; time.textContent = fmtTime(m.t);
      const title = document.createElement('div'); title.className = 'm-title';
      const tag = document.createElement('span'); tag.className = 'm-tag'; tag.style.color = tp.color; tag.textContent = tp.label;
      title.append(tag, document.createTextNode(m.title));
      const detail = document.createElement('div'); detail.className = 'm-detail'; detail.textContent = m.detail;
      const btn = document.createElement('button'); btn.className = 'm-play'; btn.type = 'button'; btn.textContent = 'Play'; btn.disabled = !canPlay;
      btn.setAttribute('aria-label', `Play ${m.title} at ${fmtTime(m.t)}`);
      btn.addEventListener('click', () => playSegments(m.i != null && m.j != null && m.type === 'repeat' ? [{ t0: m.j * BLOCK, dur: 5 }, { t0: m.i * BLOCK, dur: 5 }] : [{ t0: Math.max(0, m.t - 2.5), dur: 7 }]));
      li.append(time, title, btn, detail);
      list.appendChild(li);
    }
  }

  /* ---------------- summary & song DNA ---------------- */
  function clearSummary() {
    $('facts').textContent = ''; $('sum-hint').textContent = 'Fills in when you stop listening.';
    const cv = $('dna'); cv.width = 1200; cv.height = 630; const g = cv.getContext('2d'); g.fillStyle = INK.ground; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = INK.faint; g.font = `22px ${FONT.body}`; g.fillText('The Song DNA card appears here when the session ends.', 60, 320);
  }
  function sourceName() { return { example: 'Demo song', demo: 'Demo song', mic: 'Microphone session', tab: 'Browser tab session' }[source] || 'Session'; }
  function renderSummary() {
    summaryDirty = false; if (!engine) return;
    engine._memo = null; engine._sumCache = null; const s = engine.summary(); engine._sumCache = s;
    const labels = engine.displayLabels();
    $('sum-hint').textContent = source === 'example' ? 'For the built-in demo song. Your own sessions replace it.' : `${sourceName()}, ${sessionStamp.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`;
    const facts = $('facts'); facts.textContent = '';
    const add = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); facts.append(dt, dd); };
    add('Length', fmtTime(s.dur));
    add('Tempo', s.bpm ? `${s.bpm.toFixed(1)} BPM${s.looseness != null ? `, hits within ${s.looseness.toFixed(1)} ms of a steady grid` : ''}` : 'No steady beat');
    add('Key', s.keys.length ? s.keys.map(k => keyName(k.key)).join(' → ') : 'No clear key');
    if (s.segments.length) {
      const box = document.createElement('div'); box.className = 'form';
      for (const sg of s.segments) {
        const L = labels[sg.label] || '?'; const sp = document.createElement('span');
        sp.style.background = SECTION_COLORS[(L.charCodeAt(0) - 65) % SECTION_COLORS.length];
        sp.textContent = L + (sg.shift ? (sg.shift > 0 ? `+${sg.shift}` : `${sg.shift}`) : '');
        sp.title = `${fmtTime(sg.t0)}–${fmtTime(sg.t1)}`; box.appendChild(sp);
      }
      if (s.chorus) { const note = document.createElement('span'); note.style.background = 'transparent'; note.style.color = INK.muted; note.textContent = `${labels[s.chorus]} is likely the chorus`; box.appendChild(note); }
      add('Form', box);
    }
    if (s.repetition != null) add('Repetition', `${Math.round(s.repetition * 100)}% of it echoes something heard earlier`);
    if (s.swing != null) add('Dynamics', `${s.swing.toFixed(0)} dB between quiet and loud passages`);
    add('Moments', `${engine.moments.filter(m => m.type !== 'beat').length} found`);
    drawDNA(s, labels);
  }
  function drawDNA(s, labels) {
    const cv = $('dna'); cv.width = 1200; cv.height = 630; const g = cv.getContext('2d');
    g.fillStyle = INK.ground; g.fillRect(0, 0, 1200, 630);
    // shape
    const N = engine.nB, L = 56, R = 700, base = 470, span = Math.max(N, 20), px = (R - L) / span, vs = 380 / (span / 2);
    if (N) {
      g.save(); g.beginPath(); g.rect(L, 60, R - L, base - 60); g.clip();
      g.imageSmoothingEnabled = true; g.setTransform(px / 2, vs / 2, px / 2, -vs / 2, L, base); g.drawImage(shapeCv, 0, 0, N, N, 0, 0, N, N); g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    const X = (t) => L + (t / (span * BLOCK)) * (R - L);
    for (const sg of s.segments) {
      const Lb = labels[sg.label] || '?'; g.fillStyle = SECTION_COLORS[(Lb.charCodeAt(0) - 65) % SECTION_COLORS.length];
      roundRect(g, X(sg.t0) + 1, 486, Math.max(2, X(sg.t1) - X(sg.t0) - 2), 26, 4); g.fill();
      if (X(sg.t1) - X(sg.t0) > 28) { g.fillStyle = '#16131b'; g.font = `600 15px ${FONT.mono}`; g.textBaseline = 'middle'; g.fillText(Lb + (sg.shift ? (sg.shift > 0 ? ` +${sg.shift}` : ` ${sg.shift}`) : ''), X(sg.t0) + 8, 499); }
    }
    for (const c of engine.chordSegs) { if (c.t1 <= c.t0) continue; g.fillStyle = rgba(c.chord >= 12 ? PC_DEEP[c.chord % 12] : PC_RGB[c.chord % 12]); g.fillRect(X(c.t0), 518, Math.max(1, X(c.t1) - X(c.t0) - 1), 14); }
    g.fillStyle = INK.faint; g.font = `13px ${FONT.mono}`; g.textBaseline = 'alphabetic';
    g.fillText('SECTIONS', L, 552); g.fillText('0:00', R - 150, 552); g.textAlign = 'right'; g.fillText(fmtTime(s.dur), R, 552); g.textAlign = 'left';
    // text column
    const cx = 760; let y = 92;
    g.fillStyle = INK.muted; g.font = `500 15px ${FONT.mono}`; g.fillText('ANATOMY · SONG DNA', cx, y);
    y += 58; g.fillStyle = INK.text; g.font = `800 50px ${FONT.display}`; g.fillText(sourceName(), cx, y);
    y += 30; g.fillStyle = INK.muted; g.font = `17px ${FONT.body}`; g.fillText(sessionStamp.toLocaleDateString([], { dateStyle: 'long' }) + ` · ${fmtTime(s.dur)}`, cx, y);
    y += 62; g.fillStyle = INK.text; g.font = `700 54px ${FONT.display}`; const bpm = s.bpm ? s.bpm.toFixed(0) : '—'; g.fillText(bpm, cx, y);
    const bw = g.measureText(bpm).width; g.fillStyle = INK.muted; g.font = `17px ${FONT.body}`; g.fillText('BPM', cx + bw + 10, y);
    y += 42; g.fillStyle = INK.text; g.font = `600 24px ${FONT.body}`;
    const keyTxt = s.keys.length ? s.keys.map(k => keyName(k.key)).join(' → ') : 'No clear key'; g.fillText(fitText(g, keyTxt, 400), cx, y);
    y += 36; g.fillStyle = INK.muted; g.font = `17px ${FONT.body}`;
    const form = s.segments.map(sg => (labels[sg.label] || '?') + (sg.shift ? `(${sg.shift > 0 ? '+' : ''}${sg.shift})` : '')).join(' ');
    if (form) { g.fillText(fitText(g, 'Form  ' + form, 400), cx, y); y += 28; }
    if (s.repetition != null) { g.fillText(`${Math.round(s.repetition * 100)}% repeats earlier material`, cx, y); y += 28; }
    y += 14; g.fillStyle = INK.text; g.font = `600 15px ${FONT.mono}`; g.fillText('TOP MOMENTS', cx, y); y += 8;
    g.font = `16px ${FONT.body}`;
    for (const m of s.top.slice(0, 4)) { y += 28; g.fillStyle = (TYPE[m.type] || TYPE.section).color; g.fillText(fmtTime(m.t), cx, y); g.fillStyle = INK.text; g.fillText(fitText(g, m.title, 340), cx + 56, y); }
    // note balance strip
    const sc = engine.sessionChroma();
    if (sc) {
      const x0 = cx, w = 30, gap = 3, yb = 590;
      for (let p = 0; p < 12; p++) { const pc = (p * 7) % 12, h = 6 + 44 * sc[pc]; g.fillStyle = rgba(PC_RGB[pc]); g.fillRect(x0 + p * (w + gap), yb - h, w, h); }
      g.fillStyle = INK.faint; g.font = `12px ${FONT.mono}`; g.fillText('NOTE BALANCE, AROUND THE CIRCLE OF FIFTHS', x0, 612);
    }
  }
  function fitText(g, txt, max) { if (g.measureText(txt).width <= max) return txt; while (txt.length > 2 && g.measureText(txt + '…').width > max) txt = txt.slice(0, -1); return txt + '…'; }
  $('save-dna').addEventListener('click', () => {
    $('dna').toBlob((b) => {
      if (!b) return; const url = URL.createObjectURL(b); const a = document.createElement('a');
      a.href = url; a.download = `anatomy-${source === 'example' ? 'demo' : source}-${sessionStamp.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  });

  /* ---------------- hover & click ---------------- */
  function pointerTri(ev) {
    const cv = $('tri'), r = cv.getBoundingClientRect(), d = DPR();
    const x = (ev.clientX - r.left) * d, y = (ev.clientY - r.top) * d;
    if (!engine || !engine.nB) return null;
    const { x0, s, base, vs } = triGeom(cv);
    const u = (x - x0) / (s / 2), w = (base - y) / (vs / 2);
    const i = Math.floor((u + w) / 2), j = Math.floor((u - w) / 2);
    if (j < 0 || i >= engine.nB || j > i) return null;
    return { kind: 'pair', i, j, ti: i * BLOCK, tj: j * BLOCK, sim: engine.Ssm[i][j] };
  }
  function pointerLanes(ev) {
    const cv = $('lanes'), r = cv.getBoundingClientRect(), d = DPR(); const { x0, x1 } = plotX(cv);
    const x = (ev.clientX - r.left) * d; if (x < x0 || !engine) return null;
    const t = ((x - x0) / (x1 - x0)) * timeSpan(); if (t > engine.time) return null;
    return { kind: 'time', t };
  }
  function describeTime(t) {
    const labels = engine.displayLabels(); const bi = Math.floor(t / BLOCK);
    const sg = engine.segments.find(g => bi >= g.start && bi < (g.open ? engine.nB : g.end));
    const c = engine.chordAt(t), k = engine.keyAt(t);
    const parts = [`<b>${fmtTime(t)}</b>`];
    if (sg) parts.push(`section ${labels[sg.label]}${sg.shift ? ` (${sg.shift > 0 ? '+' : ''}${sg.shift})` : ''}`);
    if (c >= 0) parts.push(`chord ${chordName(c)}`);
    if (k >= 0) parts.push(keyName(k));
    if (bi < engine.nB && !engine.bSilent[bi]) parts.push(`${engine.bLevel[bi].toFixed(0)} dB`);
    return parts.join(' · ');
  }
  const readout = $('readout');
  const idleReadout = () => { readout.innerHTML = mode === 'stopped' ? 'Hover to compare moments. Click to hear them.' : 'Hover the shape or the timeline to compare moments.'; };
  $('tri').addEventListener('pointermove', (ev) => {
    hover = pointerTri(ev);
    if (hover) {
      const z = (hover.sim - engine.statS.mean) / engine.statS.std;
      const word = hover.i === hover.j ? 'the same moment' : z > 2.2 ? 'almost the same' : z > 1.2 ? 'very similar' : z > 0.3 ? 'somewhat alike' : z > -0.6 ? 'loosely related' : 'different';
      readout.innerHTML = `<b>${fmtTime(hover.tj)}</b> and <b>${fmtTime(hover.ti)}</b> · ${word}${mode === 'stopped' && hover.i !== hover.j ? ' · click to hear both' : ''}`;
    }
    else idleReadout();
  });
  $('tri').addEventListener('pointerleave', () => { hover = null; idleReadout(); });
  $('tri').addEventListener('click', (ev) => { const h = pointerTri(ev); if (h && mode === 'stopped') playSegments([{ t0: h.tj, dur: 4 }, { t0: h.ti, dur: 4 }]); });
  $('lanes').addEventListener('pointermove', (ev) => { hover = pointerLanes(ev); if (hover) readout.innerHTML = describeTime(hover.t) + (mode === 'stopped' ? ' · click to play from here' : ''); else idleReadout(); });
  $('lanes').addEventListener('pointerleave', () => { hover = null; idleReadout(); });
  $('lanes').addEventListener('click', (ev) => { const h = pointerLanes(ev); if (h && mode === 'stopped') playSegments([{ t0: h.t, dur: 15 }]); });
  $('src-mic').addEventListener('click', () => start('mic'));
  $('src-tab').addEventListener('click', () => start('tab'));
  $('src-demo').addEventListener('click', () => start('demo'));
  $('stop').addEventListener('click', () => stopListening());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (mode === 'listening') stopListening(); else stopPlay(); }
    if (ev.key === ' ' && play && ev.target === document.body) { ev.preventDefault(); stopPlay(); }
  });

  /* ============================================================
     VISUALS — the song as light, shape and motion.
     Nothing here is random decoration: every parameter follows a
     measurement from the engine. The "Why it looks like this"
     drawer on the page lists each mapping.
     ============================================================ */
  let page = 'visuals';
  let exampleSession = null;      // the pre-analyzed demo, kept so it can be watched again later
  let pausedAt = null, fullBuf = null;

  /* ---------- whole-session replay (one buffer, seekable) ---------- */
  function playFrom(t0) {
    if (mode !== 'stopped' || !rec || !rec.n) return;
    stopPlay();
    const ctx = ensureCtx(); ctx.resume();
    if (!fullBuf || fullBuf.rec !== rec || fullBuf.n !== rec.n) {
      const b = ctx.createBuffer(1, rec.n, rec.sr), d = b.getChannelData(0), s = rec.data;
      for (let i = 0; i < rec.n; i++) d[i] = s[i] / 32767;
      fullBuf = { rec, n: rec.n, buf: b };
    }
    t0 = clamp(t0, 0, Math.max(0, rec.dur - 0.05));
    const src = ctx.createBufferSource(); src.buffer = fullBuf.buf; src.connect(ctx.destination); src.start(0, t0);
    play = { segs: [{ t0: 0, dur: rec.dur, at: 0 }], src, start: ctx.currentTime - t0, total: rec.dur };
    src.onended = () => { if (play && play.src === src) { play = null; spec.drawnEnd = -1; } };
    pausedAt = null;
  }
  function pauseReplay() { const t = viewTime(); stopPlay(); pausedAt = t; }
  async function watchDemo() {
    if (mode === 'listening') await stopListening();
    if (exampleSession && engine !== exampleSession.engine) {
      stopPlay();
      engine = exampleSession.engine; rec = exampleSession.rec; source = 'example'; sessionStamp = exampleSession.stamp;
      seenMoments.clear(); shapeDirty = true; momentsDirty = true; summaryDirty = true;
      spec.drawnEnd = -1; lastBeatWall = -1e9; lastViewT = null; hover = null; mode = 'stopped';
      setStatus('Watching the built-in demo song. Choose a source above to analyze your own sound.', 'done');
      setButtons();
    }
    if (exampleSession && engine === exampleSession.engine && mode === 'stopped') playFrom(0);
    else start('demo');
  }

  const VZ = (() => {
    const stage = $('stage'), glc = $('vz-gl'), c2d = $('vz-2d');
    const TAU = Math.PI * 2;
    // geometry uses the 12-note clock (C at the top), so major and minor triads are true mirror-image triangles;
    // color keeps the circle-of-fifths hues used everywhere else in Anatomy
    const angOf = (pc) => -Math.PI / 2 + pc * Math.PI / 6;
    const VZ_RGB = Array.from({ length: 12 }, (_, pc) => oklch(0.76, 0.2, hueOf(pc)));
    const reduceQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const rnd = Math.random;
    const lerp = (a, b, u) => a + (b - a) * u;
    const FORM_NAMES = ['orbits', 'lattice', 'petals', 'spiral', 'star', 'waves'];
    const KAL_N = [6, 8, 5, 12, 7, 10];

    /* ---------- glow sprites, one per note color ---------- */
    function sprite(rgb) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, rgba(rgb, 0.95)); gr.addColorStop(0.42, rgba(rgb, 0.33)); gr.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    }
    const GLOW = VZ_RGB.map(sprite), GLOW_W = sprite([255, 240, 220]);

    /* ---------- WebGL: feedback loop + noise field + bloom ---------- */
    let gl = null, useGL = false, P = {}, texShp = null, fbs = [], blm = [], floatOK = false, ping = 0;
    let shp = document.createElement('canvas'), g2 = null;
    let W = 0, H = 0, BW = 0, BH = 0;
    const VS = `#version 300 es
in vec2 aP; out vec2 vUv; void main(){ vUv = aP*0.5+0.5; gl_Position = vec4(aP,0.0,1.0); }`;
    const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
vec2 h2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453)*2.0-1.0; }
float gn(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f);
  return mix(mix(dot(h2(i),f), dot(h2(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x), mix(dot(h2(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)), dot(h2(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*gn(p); p=m*p; a*=0.5; } return s; }
float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
`;
    const FS_FEED = HEAD + `
uniform sampler2D uPrev, uShp; uniform vec2 uRes; uniform float uTime, uZoom, uRot, uWarp, uDecay, uFloor, uEcho, uKN;
vec2 kal(vec2 v, float n){ float a = atan(v.y, v.x), r = length(v), s = 6.2831853/n; a = mod(a, s); a = abs(a - 0.5*s); return r*vec2(cos(a), sin(a)); }
vec3 samp(vec2 w, float asp){ vec2 uv = w/vec2(asp,1.0) + 0.5; vec2 e = min(uv, 1.0-uv); float m = smoothstep(0.0, 0.02, min(e.x, e.y)); return texture(uPrev, uv).rgb * m; }
void main(){
  float asp = uRes.x/uRes.y; vec2 v = (vUv-0.5)*vec2(asp,1.0);
  float c = cos(uRot), s = sin(uRot);
  vec2 w = mat2(c, s, -s, c) * v * uZoom;
  w += vec2(gn(v*2.3 + vec2(uTime*0.2, 0.0)), gn(v*2.3 + vec2(3.1, 7.7 - uTime*0.2))) * uWarp;
  vec3 a = samp(w, asp);
  if (uEcho > 0.002) a = mix(a, samp(kal(w, uKN), asp), uEcho);
  a = max(a*uDecay - uFloor, 0.0);
  vec3 sh = texture(uShp, vUv).rgb;
  o = vec4(max(a, sh), 1.0);
}`;
    const FS_BRIGHT = HEAD + `
uniform sampler2D uT; uniform vec2 uTexel;
void main(){
  vec3 c = texture(uT, vUv + uTexel*vec2(-1.0,-1.0)).rgb + texture(uT, vUv + uTexel*vec2(1.0,-1.0)).rgb
         + texture(uT, vUv + uTexel*vec2(-1.0,1.0)).rgb + texture(uT, vUv + uTexel*vec2(1.0,1.0)).rgb;
  c *= 0.25; float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.3, 0.95, l), 1.0);
}`;
    const FS_BLUR = HEAD + `
uniform sampler2D uT; uniform vec2 uDir;
void main(){
  vec3 c = texture(uT, vUv).rgb*0.2270270270;
  c += (texture(uT, vUv+uDir*1.3846153846).rgb + texture(uT, vUv-uDir*1.3846153846).rgb)*0.3162162162;
  c += (texture(uT, vUv+uDir*3.2307692308).rgb + texture(uT, vUv-uDir*3.2307692308).rgb)*0.0702702703;
  o = vec4(c, 1.0);
}`;
    const FS_COMP = HEAD + `
uniform sampler2D uFB, uBloom; uniform vec2 uRes;
uniform vec3 uCol[12]; uniform float uW[12]; uniform vec3 uTonic;
uniform float uTime, uEnergy, uBass, uSharp, uGrain, uLight, uWarm, uSat, uFlash, uVoid, uAberr, uHue, uGain, uBloomK;
vec3 notes(float pos){ float i = floor(pos); float fr = fract(pos); fr = fr*fr*(3.0-2.0*fr);
  int a = int(i) % 12; int b = (a + 1) % 12;
  return mix(uCol[a]*uW[a], uCol[b]*uW[b], fr); }
void main(){
  float asp = uRes.x/uRes.y;
  vec2 v = (vUv-0.5)*vec2(asp,1.0);
  float r = length(v), t = uTime;
  vec2 p = v*(1.0 - 0.24*uBass*exp(-r*r*4.0))*1.7;
  vec2 q = vec2(fbm(p + vec2(0.0, t*0.07)), fbm(p + vec2(5.2,1.3) - t*0.05));
  vec2 w = vec2(fbm(p + 3.0*q + vec2(1.7,9.2) + t*0.11), fbm(p + 3.0*q + vec2(8.3,2.8) - t*0.09));
  float f = fbm(p + 3.2*w);
  float soft = smoothstep(-0.3, 0.55, f);
  float ridge = clamp(1.0 - abs(f)*3.2, 0.0, 1.0);
  float veins = pow(ridge, mix(1.5, 9.0, uSharp));
  float shape = pow(mix(soft*soft, veins, 0.25 + 0.7*uSharp), 1.4);
  float pos = fract(length(w)*0.8 + f*0.9 + uHue) * 12.0;
  vec3 nc = notes(pos);
  vec3 base = mix(vec3(0.020,0.024,0.060), vec3(0.062,0.036,0.030), uWarm) * (0.45 + uLight);
  vec3 col = base*(1.0 - uVoid) + nc * shape * (0.07 + 0.6*uEnergy) * uGain * (1.0 - 0.92*uVoid);
  col += uTonic * uBass * 0.45 * exp(-r*r*3.0) * (1.0 - uVoid);
  col += (h1(vUv*uRes + fract(t)*91.0) - 0.5) * 0.07 * uGrain * (0.3 + uEnergy);
  vec2 dir = vUv - 0.5;
  vec3 fb = vec3(texture(uFB, vUv - dir*uAberr).r, texture(uFB, vUv).g, texture(uFB, vUv + dir*uAberr).b);
  col += fb + texture(uBloom, vUv).rgb * uBloomK;
  col += uFlash * vec3(1.0,0.96,0.9) * (0.35 + 0.65*exp(-r*r*3.0));
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col = max(mix(vec3(l), col, uSat), 0.0);
  col *= mix(1.0, smoothstep(1.3, 0.2, r), 0.55);
  col = 1.0 - exp(-col*1.35);
  col += (h1(gl_FragCoord.xy + fract(t*7.0)*113.0) - 0.5)/255.0;
  o = vec4(col, 1.0);
}`;
    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(fs) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, a.name); }
      return { p, u: new Proxy(u, { get: (o, k) => (k in o ? o[k] : null) }) };
    }
    function initGL() {
      try {
        gl = glc.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        if (!gl) return false;
        floatOK = !!gl.getExtension('EXT_color_buffer_float');
        P.feed = program(FS_FEED); P.bright = program(FS_BRIGHT); P.blur = program(FS_BLUR); P.comp = program(FS_COMP);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        texShp = makeTex();
        glc.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); toFallback(); });
        return true;
      } catch (err) { console.warn('Anatomy visuals: WebGL unavailable, using the simpler renderer.', err); gl = null; return false; }
    }
    function makeTex() {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function target(w, h) {
      const tryMake = (fl) => {
        const tex = makeTex();
        if (fl) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (ok) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!ok) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); return null; }
        return { tex, fbo, w, h };
      };
      let t = floatOK ? tryMake(true) : null;
      if (!t) { floatOK = false; t = tryMake(false); }
      return t;
    }
    function freeTargets() { for (const t of [...fbs, ...blm]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } fbs = []; blm = []; }
    function allocTargets() {
      freeTargets();
      fbs = [target(W, H), target(W, H)];
      BW = Math.max(2, Math.round(W / 4)); BH = Math.max(2, Math.round(H / 4));
      blm = [target(BW, BH), target(BW, BH)];
      if (fbs.some(x => !x) || blm.some(x => !x)) toFallback();
    }
    function toFallback() {
      useGL = false; glc.hidden = true; c2d.hidden = false;
      shp = c2d; W = 0; H = 0; g2 = null;
    }
    useGL = initGL();
    if (!useGL) toFallback();

    function ensureSize() {
      const r = stage.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      let w = r.width * d, h = r.height * d; const s = Math.min(1, Math.sqrt(1.25e6 / (w * h)));
      w = Math.max(16, Math.round(w * s)); h = Math.max(16, Math.round(h * s));
      if (w === W && h === H && g2) return true;
      W = w; H = h; shp.width = W; shp.height = H; g2 = shp.getContext('2d', { alpha: false });
      g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);
      if (useGL) { glc.width = W; glc.height = H; allocTargets(); if (!useGL) return ensureSize(); }
      return true;
    }

    /* ---------- visual state: every field follows a measurement ---------- */
    const S = {
      energy: 0, energyLong: 0, bass: 0, air: 0, bright: 0.4, noisy: 0.3, punch: 0.3, tension: 0, echo: 0, width: 0, strength: 0,
      chroma: new Float64Array(12), valence: 0.5, arousal: 0.25,
      beat: 0, beatAt: -1e9, flash: 0, abb: 0, void: 0, kick: 0,
      flow: 0, hue: 0, formRot: 0,
      triA: 0, starA: 0, tri: [0, TAU / 3, 2 * TAU / 3], triT: [0, TAU / 3, 2 * TAU / 3], triPC: [0, 4, 7], chord: -1, key: -1, keyFam: -1, bpm: 0,
      section: -1, sectionShift: 0, formIdx: 0, formPrev: -1, formMix: 1,
      comet: { x: 0, y: 0, vis: 0, pc: 0, on: false },
      lastF: -1, lastT: null, beatPtr: 0, dropState: 'normal', onsetMean: 0, lastSpawnF: -1e9, hits: [],
      fol: { init: false, peak: -40, bass: -40, bf: -60, bs: -60 },
      slowF: -1e9, tensionRaw: 0, punchRaw: 0.3, echoBlock: -1, echoRaw: 0, secCache: null,
      mood: '', moodCand: '', moodSince: 0, seen: new Set(), eng: null, kind: 'idle', sparkAcc: 0, streakAcc: 0,
      idleSec: 0, idleSecAt: 0
    };
    const parts = [], rings = [];
    let lastNow = 0, lastHud = 0, lastLegend = 0, legendOpen = false;
    let U = 1, CX = 0, CY = 0;

    function resetFor(e) {
      S.eng = e; parts.length = 0; rings.length = 0;
      S.lastF = -1; S.lastT = null; S.beatPtr = e ? e.beatTimes.length : 0; S.dropState = 'normal'; S.onsetMean = 0; S.hits.length = 0;
      S.fol.init = false; S.slowF = -1e9; S.echoBlock = -1; S.echoRaw = 0; S.tensionRaw = 0; S.secCache = null;
      S.seen = new Set(e ? e.moments.map(m => m.id) : []); S.chord = -1; S.keyFam = -1; S.section = -1; S.formPrev = -1; S.formMix = 1;
      pausedAt = null; caption(null);
    }

    /* ---------- reading the engine ---------- */
    const bandPow = (e, f, b) => Math.pow(10, e.bands[f * 6 + b] / 10);
    function bassDb(e, f) { return 10 * Math.log10(bandPow(e, f, 0) + bandPow(e, f, 1) + 1e-12); }
    function shares(e, f) {
      let tot = 0; for (let b = 0; b < 6; b++) tot += bandPow(e, f, b);
      return { bass: (bandPow(e, f, 0) + bandPow(e, f, 1)) / (tot || 1), air: (bandPow(e, f, 4) + bandPow(e, f, 5)) / (tot || 1) };
    }
    function sessionBpm(e) {
      return memo(e, 'vzBpm', () => { if (e.bpmHist.length < 8) return 0; const s = e.bpmHist.slice().sort((a, b) => a - b); return s[s.length >> 1]; });
    }
    function computePunch(e, f) {
      const n = Math.min(f + 1, Math.round(e.fr)); let pk = 0, pw = 0, act = 0;
      for (let i = f - n + 1; i <= f; i++) { if (e.peaks[i] > pk) pk = e.peaks[i]; pw += Math.pow(10, e.level[i] / 10); act += e.activeF[i]; }
      if (act < n * 0.5 || pw <= 0) return S.punchRaw;
      const crest = 20 * Math.log10(pk / Math.sqrt(pw / n) + 1e-9);
      return clamp((crest - 6) / 14);
    }
    function computeTension(e, f, t) {
      // brightness and loudness rising together over the last 4 s: the shape of a build-up
      const n = Math.round(e.fr * 4); if (f < n) return 0;
      let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, sxz = 0, syy = 0, szz = 0, m = 0;
      for (let i = f - n + 1; i <= f; i += 2) {
        if (!e.activeF[i]) continue;
        const x = (i - f) / e.fr, y = Math.log2(Math.max(e.cent[i], 50)), z = e.level[i];
        sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; sxz += x * z; syy += y * y; szz += z * z; m++;
      }
      let ten = 0;
      if (m > n * 0.3) {
        const vx = sxx - sx * sx / m, cy = sxy - sx * sy / m, cz = sxz - sx * sz / m, vy = syy - sy * sy / m, vz = szz - sz * sz / m;
        const rise = cy / vx * 4, lift = cz / vx * 4;
        const ry = cy / Math.sqrt(vx * vy + 1e-12), rz = cz / Math.sqrt(vx * vz + 1e-12);
        ten = Math.sqrt(clamp((rise - 0.15) / 0.7) * clamp((lift - 0.5) / 5)) * clamp((ry - 0.3) / 0.4) * clamp((rz + 0.1) / 0.4);
      }
      for (const mo of e.moments) if (mo.type === 'build' && t >= mo.t && t <= (mo.t1 || mo.t + 5) + 0.5) ten = Math.max(ten, 0.75);
      return ten;
    }
    function computeEcho(e, i) {
      // how strongly this moment repeats something from at least 15 s earlier (the same test the engine uses)
      if (i < 40 || i >= e.nB || e.bSilent[i]) return 0;
      const st = e.statS; let bz = -1e9;
      for (let j = 4; j <= i - 30; j++) { const z = (0.5 * (e.Ssm[i][j] + e.Ssm[i - 4][j - 4]) - st.mean) / st.std; if (z > bz) bz = z; }
      return clamp((bz - 1.4) / 1.4);
    }
    function sectionAt(e, t) {
      const bi = Math.floor(t / BLOCK); let sg = null;
      for (const s of e.segments) if (bi >= s.start && (s.open || bi < s.end)) sg = s;
      if (!sg) return e.segStart >= 0 && bi >= e.segStart ? { idx: 0, shift: 0, letter: 'A' } : { idx: -1, shift: 0, letter: '' };
      const L = e.displayLabels()[sg.label] || 'A';
      return { idx: L.charCodeAt(0) - 65, shift: sg.shift || 0, letter: L };
    }

    function pickSource(view) {
      if (!engine || mode === 'boot' || mode === 'example' || !engine.nF) return { kind: 'idle' };
      const e = engine;
      if (mode === 'listening') return { kind: 'live', t: e.time, f: e.nF - 1 };
      if (view && view.mode === 'replay') return { kind: 'replay', t: view.t, f: clamp(Math.round(view.t * e.fr), 0, e.nF - 1) };
      if (pausedAt != null) return { kind: 'paused', t: pausedAt, f: clamp(Math.round(pausedAt * e.fr), 0, e.nF - 1) };
      return { kind: 'idle', portrait: true };
    }

    function targets(src, dt, now) {
      const T = { active: false, chroma: null, strength: 0, key: -1, chord: -1, bpm: 0, locked: false, f0: 0, clar: 0, energy: 0, bass: 0, air: 0, bright: S.bright, noisy: S.noisy, punch: S.punchRaw, tension: 0, echo: 0, section: -1, shift: 0, inGap: false, keyConf: 0.8 };
      const e = engine;
      if (src.kind === 'idle') {
        if (src.portrait) {
          // a still portrait of the whole session, cycling through its sections
          const sc = memo(e, 'chroma', () => e.sessionChroma()); const av = memo(e, 'avg', () => e.averages());
          if (sc) { T.chroma = sc.map(v => Math.pow(v, 1.6)); T.strength = 0.6; }
          if (av) { T.bright = clamp((Math.log2(av.centroid) - Math.log2(200)) / Math.log2(30)); T.noisy = clamp((av.flatnessLog + 2) / 1.8); }
          const kt = e.keyTimeline; T.key = kt.length ? kt[kt.length - 1].key : -1;
          T.energy = 0.3; T.bass = 0.15; T.bpm = sessionBpm(e);
          const segs = e.segments;
          if (segs.length) { if (now - S.idleSecAt > 7000) { S.idleSec = (S.idleSec + 1) % segs.length; S.idleSecAt = now; } const s = sectionAt(e, (segs[S.idleSec % segs.length].start + 1) * BLOCK); T.section = s.idx; }
        } else {
          // nothing measured yet: a slow, quiet wheel through all twelve colors
          const ph = now / 9000; T.chroma = Array.from({ length: 12 }, (_, pc) => Math.pow(0.5 + 0.5 * Math.cos(TAU * (fifthPos(pc) / 12 - ph)), 3));
          T.strength = 0.4; T.energy = 0.22; T.bright = 0.35; T.noisy = 0.2; T.section = Math.floor(now / 12000) % 6;
        }
        return T;
      }
      const f = src.f, t = src.t, fr = e.fr, live = src.kind === 'live', k = src.kind === 'paused' ? 0 : dt;
      T.active = e.activeF[f] === 1;
      const lv = e.level[f], fol = S.fol, bd = bassDb(e, f);
      if (!fol.init || src.jump) {
        let pk = -70, pb = -70;
        for (let i = Math.max(0, f - Math.round(fr * 8)); i <= f; i++) if (e.activeF[i]) { pk = Math.max(pk, e.level[i]); pb = Math.max(pb, bassDb(e, i)); }
        fol.peak = pk; fol.bass = pb; fol.bf = fol.bs = bd; fol.init = true;
      }
      // loudness relative to the recent loudest moment, so mic distance and volume don't matter
      fol.peak = Math.max(lv, fol.peak - 1.2 * k);
      T.energy = T.active ? clamp((lv - (fol.peak - 26)) / 26) : 0;
      fol.bass = Math.max(bd, fol.bass - 1.5 * k);
      fol.bf += (bd - fol.bf) * (1 - Math.exp(-k / 0.08)); fol.bs += (bd - fol.bs) * (1 - Math.exp(-k / 1.5));
      const sh = shares(e, f);
      const bassRel = clamp((bd - (fol.bass - 22)) / 22), bassHit = clamp((fol.bf - fol.bs) / 8), bassShare = clamp((sh.bass - 0.25) / 0.6);
      T.bass = T.active ? clamp(0.6 * bassRel * (0.35 + 0.65 * bassShare) + 0.5 * bassHit) : 0;
      T.air = T.active ? clamp((10 * Math.log10(sh.air + 1e-9) + 32) / 24) : 0;
      if (T.active) {
        T.bright = clamp((Math.log2(Math.max(e.cent[f], 100)) - Math.log2(200)) / Math.log2(30));
        T.noisy = clamp((Math.log10(e.flat[f] + 1e-9) + 2) / 1.8);
      }
      // chroma: which of the 12 notes are sounding
      const ch = live ? (e.active && e.chromaStrength > 0.12 ? e.cS : null) : e.chromaAt(t);
      if (ch) { let mx = 1e-9; for (let i = 0; i < 12; i++) if (ch[i] > mx) mx = ch[i]; T.chroma = Array.from(ch, v => Math.pow(Math.max(v, 0) / mx, 1.6)); }
      T.strength = live ? e.chromaStrength : e.strF[f];
      T.key = live ? e.keyDisp : e.keyAt(t); T.keyConf = live ? e.keyConf : 0.8;
      T.chord = live ? e.chordCur : e.chordAt(t);
      T.locked = live ? e.locked : e.confF[f] > 0;
      T.bpm = T.locked ? (live ? e.bpm : sessionBpm(e) || e.bpm) : 0;
      T.f0 = e.f0F ? e.f0F[f] : 0; T.clar = e.clarF[f];
      T.width = clamp(e.width / 0.35);
      // slower measurements, ten times a second
      if (Math.abs(f - S.slowF) >= 8 || src.jump) {
        S.slowF = f;
        S.punchRaw = computePunch(e, f);
        S.tensionRaw = computeTension(e, f, t);
        const bi = live ? e.nB - 1 : Math.min(e.nB - 1, Math.floor(t / BLOCK));
        if (bi !== S.echoBlock) { S.echoBlock = bi; S.echoRaw = computeEcho(e, bi); }
        S.secCache = sectionAt(e, t);
      }
      T.punch = S.punchRaw; T.tension = S.tensionRaw; T.echo = S.echoRaw;
      if (S.secCache) { T.section = S.secCache.idx; T.shift = S.secCache.shift; T.letter = S.secCache.letter; }
      // sudden silence (the breath before a drop)
      if (live) T.inGap = e.drop.state === 'gap' && t - e.drop.t0 > 0.08;
      else for (const m of e.moments) if (m.type === 'drop' && m.gap && t >= m.t - m.gap && t < m.t) T.inGap = true;
      if (src.kind === 'paused') { T.energy *= 0.55; T.tension = 0; }
      return T;
    }

    /* ---------- smoothing + derived mood ---------- */
    const toward = (x, y, dt, up, down) => x + (y - x) * (1 - Math.exp(-dt / (y > x ? up : (down == null ? up : down))));
    function update(T, dt, now) {
      S.energy = toward(S.energy, T.energy, dt, 0.04, 0.22);
      S.energyLong = toward(S.energyLong, T.energy, dt, 1.5);
      S.bass = toward(S.bass, T.bass, dt, 0.03, 0.2);
      S.air = toward(S.air, T.air, dt, 0.12, 0.3);
      S.bright = toward(S.bright, T.bright, dt, 0.35);
      S.noisy = toward(S.noisy, T.noisy, dt, 0.5);
      S.punch = toward(S.punch, T.punch, dt, 0.6);
      S.tension = toward(S.tension, T.tension, dt, 0.35, 0.8);
      S.echo = toward(S.echo, T.echo, dt, 0.6, 1.2);
      S.strength = toward(S.strength, T.strength, dt, 0.2);
      S.width = T.width != null ? toward(S.width, T.width, dt, 1) : S.width;
      for (let i = 0; i < 12; i++) S.chroma[i] = toward(S.chroma[i], T.chroma ? T.chroma[i] : 0, dt, 0.12, T.chroma ? 0.18 : 0.6);
      S.void = toward(S.void, T.inGap ? 1 : 0, dt, 0.05, 0.25);
      S.flash *= Math.exp(-dt / 0.35); S.abb *= Math.exp(-dt / 0.3); S.kick *= Math.exp(-dt / 0.45);
      S.beat = Math.exp(-(now - S.beatAt) / 170);
      if (T.bpm) S.bpm = T.bpm;
      // how the music feels: a rough estimate on two axes (calm to energetic, dark to bright)
      const tempoN = T.bpm ? clamp((T.bpm - 60) / 100) : null;
      const modeV = T.key < 0 ? 0 : (T.key < 12 ? 1 : -1) * (0.4 + 0.6 * clamp(T.keyConf));
      const rate = S.hits.filter(h => now - h < 2000).length / 2;
      const val = clamp(0.5 + 0.3 * modeV + 0.12 * ((tempoN == null ? 0.4 : tempoN) * 2 - 1) + 0.1 * (S.bright * 2 - 1));
      const aro = clamp(0.35 * S.energyLong + 0.3 * (tempoN == null ? 0.1 : tempoN) + 0.15 * S.bright + 0.2 * clamp(rate / 4) + 0.2 * S.tension);
      S.valence = toward(S.valence, val, dt, 2); S.arousal = toward(S.arousal, aro, dt, 1.2);
      const moodNow = moodWord(S.valence, S.arousal);
      if (moodNow !== S.moodCand) { S.moodCand = moodNow; S.moodSince = now; }
      if (!S.mood || (S.moodCand !== S.mood && now - S.moodSince > 1500)) S.mood = S.moodCand;
      const reduce = reduceQ.matches;
      S.flow += dt * (0.15 + 0.9 * S.arousal + 1.2 * S.tension) * (reduce ? 0.35 : 1);
      S.hue += dt * 0.012 * (0.3 + S.arousal) * (reduce ? 0.35 : 1);
      S.formRot += dt * ((S.formIdx % 2 ? -1 : 1) * (0.05 + 0.25 * (S.bpm ? clamp((S.bpm - 60) / 120) : 0.2)) * (1 + 2 * S.tension)) * (reduce ? 0.3 : 1);
      S.formMix = Math.min(1, S.formMix + dt / 1.2);
      // chord triangle: its corners glide to the new chord's notes
      S.triA = toward(S.triA, T.chord >= 0 ? clamp(0.35 + S.strength * 1.3) : 0, dt, 0.15, 0.5);
      S.starA = toward(S.starA, T.chord < 0 && T.chroma ? clamp(S.strength * 1.4) : 0, dt, 0.3, 0.3);
      for (let j = 0; j < 3; j++) { let d = S.triT[j] - S.tri[j]; d = Math.atan2(Math.sin(d), Math.cos(d)); S.tri[j] += d * (1 - Math.exp(-dt / 0.13)); }
    }
    function moodWord(v, a) {
      const A = a > 0.62 ? 2 : a > 0.36 ? 1 : 0, V = v > 0.6 ? 2 : v > 0.42 ? 1 : 0;
      return [['somber', 'calm', 'warm and relaxed'], ['brooding', 'steady', 'upbeat'], ['tense', 'driving', 'euphoric']][A][V];
    }

    /* ---------- events: beats, onsets, chords, sections, drops ---------- */
    function topNote() { let b = 0; for (let i = 1; i < 12; i++) if (S.chroma[i] > S.chroma[b]) b = i; return S.chroma[b] > 0.02 ? b : (S.key >= 0 ? S.key % 12 : 0); }
    function pickNote() {
      let tot = 0; for (let i = 0; i < 12; i++) tot += S.chroma[i] * S.chroma[i];
      if (tot < 1e-6) return topNote();
      let r = rnd() * tot; for (let i = 0; i < 12; i++) { r -= S.chroma[i] * S.chroma[i]; if (r <= 0) return i; } return 11;
    }
    function sidesNow() { const b = S.bright; return b < 0.3 ? 0 : Math.max(3, Math.round(9 - 6 * clamp((b - 0.3) / 0.45))); }
    const triR = () => U * (0.3 + 0.14 * S.energy) * (1 + 0.1 * S.beat * (0.4 + S.punch));
    function addPart(p) { if (parts.length > 900) parts.splice(0, parts.length - 900); parts.push(p); }
    function spray(n, from, spread, speed, opts) {
      const wide = 1 + 1.2 * S.width;
      for (let i = 0; i < n; i++) {
        const o = typeof from === 'function' ? from() : from;
        const a = o.a + (rnd() - 0.5) * spread, v = speed * (0.4 + rnd() * 0.9);
        addPart(Object.assign({ x: o.x, y: o.y, vx: Math.cos(a) * v * wide, vy: Math.sin(a) * v, age: 0, life: 0.6 + rnd() * 0.9, size: U * (0.008 + rnd() * 0.02), pc: pickNote(), kind: S.bright > 0.5 ? 1 : 0, rot: rnd() * TAU, vr: (rnd() - 0.5) * 6, drag: 1.6 }, opts || {}));
      }
    }
    function fireBeat(now) {
      S.beatAt = now;
      const pc = topNote();
      rings.push({ kind: 'poly', born: now, life: 0.8 + 0.9 * (1 - S.punch), r0: triR(), v: U * (0.8 + 1.6 * S.energy), sides: sidesNow(), rot: S.formRot, pc, w: U * (0.004 + 0.012 * S.punch), a: 0.35 + 0.65 * S.energy });
      const n = Math.round(3 + 12 * S.punch * S.energy);
      if (n > 0) spray(n, () => { const a = rnd() * TAU; return { x: CX + Math.cos(a) * triR(), y: CY + Math.sin(a) * triR(), a }; }, 0.5, U * 0.9, { life: 0.7 });
    }
    function onsetShards(norm) {
      const n = Math.min(26, Math.round((norm - 2) * 4 * (0.6 + S.punch)) + 3);
      const R = triR();
      spray(n, () => { const j = Math.floor(rnd() * 3), a = S.tri[j]; return { x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R, a }; }, 0.9, U * (0.7 + 1.6 * S.energy));
    }
    function burst(now) {
      const reduce = reduceQ.matches;
      S.flash = reduce ? 0.25 : 1; S.abb = reduce ? 0.2 : 1; S.kick = 1;
      for (let i = 0; i < 3; i++) rings.push({ kind: 'poly', born: now + i * 90, life: 1.6, r0: U * 0.05, v: U * (2.6 - i * 0.6), sides: sidesNow(), rot: rnd() * TAU, pc: pickNote(), w: U * (0.02 - i * 0.005), a: 1 });
      spray(reduce ? 60 : 190, () => ({ x: CX, y: CY, a: rnd() * TAU }), TAU, U * 3.2, { life: 1.2, drag: 1.1 });
      spray(reduce ? 20 : 70, () => ({ x: CX, y: CY, a: rnd() * TAU }), TAU, U * 5.5, { kind: 3, life: 0.7, drag: 0.8, size: U * 0.004 });
    }
    function keySweep(now, key) {
      const tonic = key % 12, minor = key >= 12, rel = minor ? (tonic + 3) % 12 : tonic;
      const scale = [0, 2, 4, 5, 7, 9, 11].map(s => (rel + s) % 12);
      rings.push({ kind: 'key', born: now, life: 2.4, r0: U * 0.1, v: U * 1.1, pcs: scale, w: U * 0.03, a: 1, rot: 0 });
    }
    function setChord(c, now) {
      if (c === S.chord) return;
      const prev = S.chord; S.chord = c;
      if (c < 0) return;
      const r = c % 12, pcs = [r, (r + (c >= 12 ? 3 : 4)) % 12, (r + 7) % 12];
      const tgt = pcs.map(angOf);
      // match corners to notes so the triangle moves as little as possible (voice leading, made visible)
      const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
      let best = perms[0], bd = 1e9;
      for (const p of perms) { let d = 0; for (let j = 0; j < 3; j++) { const x = tgt[p[j]] - S.tri[j]; d += Math.abs(Math.atan2(Math.sin(x), Math.cos(x))); } if (d < bd) { bd = d; best = p; } }
      for (let j = 0; j < 3; j++) { S.triT[j] = tgt[best[j]]; S.triPC[j] = pcs[best[j]]; }
      if (prev < 0 && S.triA < 0.05) for (let j = 0; j < 3; j++) S.tri[j] = S.triT[j];
      if (prev >= 0) for (let j = 0; j < 3; j++) { const a = S.triT[j], R = triR(); spray(4, { x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R, a }, 1.2, U * 0.5, { pc: S.triPC[j], kind: 0, life: 0.8 }); }
    }

    function events(src, T, now, dt) {
      const e = engine; const reduce = reduceQ.matches;
      if (src.kind === 'live' || src.kind === 'replay') {
        const t = src.t, jump = src.jump;
        // beats
        const bt = e.beatTimes;
        if (jump || S.lastT == null) { let lo = 0, hi = bt.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bt[m] <= t) lo = m + 1; else hi = m; } S.beatPtr = lo; }
        else while (S.beatPtr < bt.length && bt[S.beatPtr] <= t) { if (t - bt[S.beatPtr] < 0.25) fireBeat(now); S.beatPtr++; }
        // onsets: sudden rises in energy throw shards off the chord
        const f = src.f;
        if (jump || S.lastF < 0 || f - S.lastF > e.fr) S.lastF = f;
        for (let ff = S.lastF + 1; ff <= f; ff++) {
          const o = e.onset[ff]; S.onsetMean += (o - S.onsetMean) * 0.02;
          if (e.activeF[ff] && S.onsetMean > 1e-6 && o > 2.3 * S.onsetMean && ff - S.lastSpawnF > e.fr * 0.07) { S.lastSpawnF = ff; S.hits.push(now); onsetShards(o / S.onsetMean); }
        }
        S.lastF = f;
        while (S.hits.length && now - S.hits[0] > 2500) S.hits.shift();
        // drops: live from the engine's own gap detector, replay from the moments it found
        if (src.kind === 'live') {
          const st = e.drop.state;
          if (S.dropState === 'gap' && st === 'post' && e.drop.gapLen >= 0.1) burst(now);
          S.dropState = st;
          for (const m of e.moments) if (!S.seen.has(m.id)) { S.seen.add(m.id); caption(m); }
        } else if (!jump && S.lastT != null) {
          for (const m of e.moments) if (m.t > S.lastT && m.t <= t) { if (m.type === 'drop') burst(now); caption(m); }
        }
        S.lastT = t;
      } else { S.lastT = null; S.lastF = -1; }
      // chord, key and section changes
      setChord(T.chord, now);
      const fam = T.key >= 0 ? family(T.key) : -1;
      if (fam >= 0 && S.keyFam >= 0 && fam !== S.keyFam && !src.jump && src.kind !== 'idle') keySweep(now, T.key);
      if (fam >= 0) S.keyFam = fam; S.key = T.key;
      const sec = T.section < 0 ? S.section : T.section;
      if (sec !== S.section) {
        if (S.section >= 0 && !src.jump && src.kind !== 'idle') rings.push({ kind: 'poly', born: now, life: 1.8, r0: U * 0.4, v: U * 1.3, sides: [0, 6, 5, 8, 7, 12][sec % 6], rot: S.formRot, pc: topNote(), w: U * 0.012, a: 0.9 });
        S.formPrev = S.formIdx; S.formIdx = Math.max(0, sec) % 6; S.formMix = S.section < 0 || src.jump ? 1 : 0; S.section = sec;
      }
      S.sectionShift = T.shift || 0; S.letter = T.letter;
      // melody comet: one clear pitch at a time
      const cm = S.comet;
      cm.on = T.clar > 0.85 && T.f0 > 70 && T.f0 < 2000 && src.kind !== 'idle' && src.kind !== 'paused';
      if (cm.on) {
        const midi = 69 + 12 * Math.log2(T.f0 / 440), pc = ((Math.round(midi) % 12) + 12) % 12, a = angOf(pc);
        const r = U * (0.16 + 0.82 * clamp(Math.log2(T.f0 / 70) / Math.log2(2000 / 70)));
        const tx = CX + Math.cos(a) * r, ty = CY + Math.sin(a) * r;
        if (cm.vis < 0.05) { cm.x = tx; cm.y = ty; }
        const k = 1 - Math.exp(-dt / 0.07); cm.x += (tx - cm.x) * k; cm.y += (ty - cm.y) * k; cm.pc = pc;
      }
      cm.vis = toward(cm.vis, cm.on ? 1 : 0, dt, 0.05, 0.25);
      // air: sparkles; build-ups: hyperspace streaks
      if (src.kind !== 'idle' && src.kind !== 'paused') {
        S.sparkAcc += dt * S.air * S.energy * (reduce ? 12 : 45);
        while (S.sparkAcc >= 1) {
          S.sparkAcc--; const a = rnd() * TAU, r = U * (0.55 + rnd() * 1.1);
          addPart({ x: CX + Math.cos(a) * r * (1 + 0.6 * S.width), y: CY + Math.sin(a) * r, vx: 0, vy: 0, age: 0, life: 0.35 + rnd() * 0.6, size: U * (0.006 + rnd() * 0.012), pc: pickNote(), kind: 2, rot: 0, vr: 0, drag: 0 });
        }
        S.streakAcc += dt * S.tension * (reduce ? 15 : 70);
        while (S.streakAcc >= 1) {
          S.streakAcc--; const a = rnd() * TAU, r = U * (0.15 + rnd() * 0.4), v = U * (1.5 + 5 * S.tension);
          addPart({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.5 + rnd() * 0.4, size: U * 0.003, pc: pickNote(), kind: 3, rot: 0, vr: 0, drag: 0 });
        }
      }
    }

    /* ---------- drawing the shapes (fed into the feedback loop) ---------- */
    function noteAt(a) { const p = Math.round((a + Math.PI / 2) / (Math.PI / 6)); return ((p % 12) + 12) % 12; }
    function polyPath(g, x, y, r, sides, rot) {
      g.beginPath();
      if (!sides) { g.arc(x, y, Math.max(0.1, r), 0, TAU); return; }
      for (let i = 0; i <= sides; i++) { const a = rot + i * TAU / sides; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      g.closePath();
    }
    function drawForm(g, idx, amp, now) {
      if (amp < 0.01) return;
      const rot = S.formRot, pulse = 1 + 0.05 * S.beat, t = now / 1000;
      const base = amp * (0.22 + 0.55 * S.energy) * (1 - S.void);
      const colAt = (a, k) => { const pc = noteAt(a); const w = 0.15 + 0.85 * S.chroma[pc]; return rgba(VZ_RGB[pc], base * w * (k || 1)); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (idx === 0) {            // orbits: two rings of beads turning against each other
        for (const [r, n, dir, s] of [[0.8, 24, 1, 0.014], [0.98, 16, -1.4, 0.02]]) {
          for (let i = 0; i < n; i++) {
            const a = dir * rot + i * TAU / n, x = CX + Math.cos(a) * U * r * pulse, y = CY + Math.sin(a) * U * r * pulse;
            const pc = noteAt(a), sz = U * s * (0.6 + 0.8 * S.chroma[pc]);
            g.globalAlpha = base * (0.3 + 0.7 * S.chroma[pc]); g.drawImage(GLOW[pc], x - sz * 2, y - sz * 2, sz * 4, sz * 4);
          }
        }
        g.globalAlpha = 1;
      } else if (idx === 1) {     // lattice: nested hexagons, alternately turning
        for (let k = 0; k < 4; k++) {
          const r = U * (0.62 + k * 0.14) * pulse, a0 = (k % 2 ? -1 : 1) * rot + k * 0.25;
          for (let i = 0; i < 6; i++) {
            const a = a0 + i * TAU / 6, b = a0 + (i + 1) * TAU / 6;
            g.strokeStyle = colAt((a + b) / 2); g.lineWidth = U * 0.006;
            g.beginPath(); g.moveTo(CX + Math.cos(a) * r, CY + Math.sin(a) * r); g.lineTo(CX + Math.cos(b) * r, CY + Math.sin(b) * r); g.stroke();
          }
        }
      } else if (idx === 2) {     // petals: a rose curve
        const n = 240;
        for (let i = 0; i < n; i++) {
          const th0 = i * TAU * 2 / n, th1 = (i + 1) * TAU * 2 / n;
          const r0 = U * (0.5 + 0.48 * Math.abs(Math.cos(2.5 * th0))) * pulse, r1 = U * (0.5 + 0.48 * Math.abs(Math.cos(2.5 * th1))) * pulse;
          g.strokeStyle = colAt(th0 + rot); g.lineWidth = U * 0.006;
          g.beginPath(); g.moveTo(CX + Math.cos(th0 + rot) * r0, CY + Math.sin(th0 + rot) * r0); g.lineTo(CX + Math.cos(th1 + rot) * r1, CY + Math.sin(th1 + rot) * r1); g.stroke();
        }
      } else if (idx === 3) {     // spiral: arms of beads winding outward
        for (let arm = 0; arm < 6; arm++) for (let i = 0; i < 16; i++) {
          const r = U * (0.45 + i * 0.05) * pulse, a = rot * 1.3 + arm * TAU / 6 + i * 0.22;
          const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r, pc = noteAt(a), sz = U * (0.008 + i * 0.0012) * (0.6 + 0.8 * S.chroma[pc]);
          g.globalAlpha = base * (0.3 + 0.7 * S.chroma[pc]); g.drawImage(GLOW[pc], x - sz * 2, y - sz * 2, sz * 4, sz * 4);
        }
        g.globalAlpha = 1;
      } else if (idx === 4) {     // star: {7/3} and {5/2} star polygons
        for (const [n, step, r, dir] of [[7, 3, 0.95, 1], [5, 2, 0.7, -1]]) {
          for (let i = 0; i < n; i++) {
            const a = dir * rot + i * step * TAU / n, b = dir * rot + (i + 1) * step * TAU / n;
            g.strokeStyle = colAt(a); g.lineWidth = U * 0.006;
            g.beginPath(); g.moveTo(CX + Math.cos(a) * U * r * pulse, CY + Math.sin(a) * U * r * pulse); g.lineTo(CX + Math.cos(b) * U * r * pulse, CY + Math.sin(b) * U * r * pulse); g.stroke();
          }
        }
      } else {                    // waves: rings that ripple
        for (let k = 0; k < 3; k++) {
          const n = 120;
          for (let i = 0; i < n; i++) {
            const a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
            const rr = (a) => U * (0.62 + k * 0.15 + 0.035 * Math.sin(a * (6 + k * 2) + t * (1.5 + k) + rot * 3)) * pulse;
            g.strokeStyle = colAt(a0); g.lineWidth = U * 0.005;
            g.beginPath(); g.moveTo(CX + Math.cos(a0) * rr(a0), CY + Math.sin(a0) * rr(a0)); g.lineTo(CX + Math.cos(a1) * rr(a1), CY + Math.sin(a1) * rr(a1)); g.stroke();
          }
        }
      }
    }
    function drawShapes(dt, now, src) {
      const g = g2;
      if (useGL) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
      else {
        // simple renderer: fade the last frame instead of a feedback shader
        const hl = lerp(0.1, 0.7, clamp((1 - S.punch * 0.9) * (0.35 + 0.65 * S.strength)));
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = `rgba(6,5,10,${1 - Math.pow(0.5, dt / hl)})`; g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = 'lighter';
      const vis = clamp(0.3 + S.energy) * (1 - 0.85 * S.void);
      // section motif (outer geometry)
      if (S.formMix < 1 && S.formPrev >= 0) drawForm(g, S.formPrev, 1 - S.formMix, now);
      drawForm(g, S.formIdx, S.formMix, now);
      // shockwave rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], age = (now - r.born) / 1000;
        if (age < 0) continue;
        if (age > r.life) { rings.splice(i, 1); continue; }
        const u = age / r.life, rad = r.r0 + r.v * r.life * (1 - Math.pow(1 - u, 2.2)) * 0.8, al = Math.pow(1 - u, 1.4) * r.a;
        if (r.kind === 'key') {
          const n = r.pcs.length, seg = TAU / n;
          for (let k = 0; k < n; k++) { g.strokeStyle = rgba(VZ_RGB[r.pcs[k]], al); g.lineWidth = r.w * (1 - u * 0.7); g.beginPath(); g.arc(CX, CY, rad, -Math.PI / 2 + k * seg + 0.04, -Math.PI / 2 + (k + 1) * seg - 0.04); g.stroke(); }
        } else {
          g.strokeStyle = rgba(VZ_RGB[r.pc], al); g.lineWidth = Math.max(1, r.w * (1 - u * 0.6));
          polyPath(g, CX, CY, rad, r.sides, r.rot + u * 0.4); g.stroke();
        }
      }
      // the twelve notes, around the circle of fifths
      const R = triR();
      for (let pc = 0; pc < 12; pc++) {
        const w = S.chroma[pc]; if (w < 0.03) continue;
        const a = angOf(pc), x = CX + Math.cos(a) * R, y = CY + Math.sin(a) * R, sz = U * (0.012 + 0.05 * w) * (1 + 0.35 * S.beat);
        g.globalAlpha = clamp((0.25 + 0.75 * w) * vis); g.drawImage(GLOW[pc], x - sz * 2, y - sz * 2, sz * 4, sz * 4);
      }
      g.globalAlpha = 1;
      // the chord as a triangle between its three notes
      if (S.triA > 0.01) {
        const A = S.triA * vis, pts = S.tri.map(a => [CX + Math.cos(a) * R, CY + Math.sin(a) * R]);
        const mix = [0, 1, 2].map(k => (VZ_RGB[S.triPC[0]][k] + VZ_RGB[S.triPC[1]][k] + VZ_RGB[S.triPC[2]][k]) / 3);
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.closePath();
        g.fillStyle = rgba(mix, 0.09 * A); g.fill();
        for (let j = 0; j < 3; j++) {
          const p = pts[j], q = pts[(j + 1) % 3];
          const gr = g.createLinearGradient(p[0], p[1], q[0], q[1]);
          gr.addColorStop(0, rgba(VZ_RGB[S.triPC[j]], A)); gr.addColorStop(1, rgba(VZ_RGB[S.triPC[(j + 1) % 3]], A));
          g.strokeStyle = gr; g.lineCap = 'round';
          g.lineWidth = U * 0.03 * (1 + 0.8 * S.beat * S.punch); g.globalAlpha = 0.3; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
          g.lineWidth = U * 0.009; g.globalAlpha = 1; g.stroke();
          g.strokeStyle = `rgba(255,248,238,${0.55 * A})`; g.lineWidth = U * 0.0025; g.stroke();
        }
        // an inner, counter-rotated echo of the chord
        const ir = 0.42 + 0.08 * S.beat;
        g.globalAlpha = 0.5 * A; g.strokeStyle = rgba(mix, 1); g.lineWidth = U * 0.004;
        g.beginPath(); for (let j = 0; j <= 3; j++) { const a = S.tri[j % 3] + Math.PI + S.formRot * 0.5; const x = CX + Math.cos(a) * R * ir, y = CY + Math.sin(a) * R * ir; if (j) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
        g.globalAlpha = 1;
        for (let j = 0; j < 3; j++) { const sz = U * (0.08 + 0.05 * S.chroma[S.triPC[j]]) * (1 + 0.5 * S.beat); g.globalAlpha = A; g.drawImage(GLOW[S.triPC[j]], pts[j][0] - sz, pts[j][1] - sz, sz * 2, sz * 2); }
        g.globalAlpha = 1;
      }
      // no clear chord: a star whose spikes are the note strengths
      if (S.starA > 0.02) {
        const pc0 = topNote(); g.strokeStyle = rgba(VZ_RGB[pc0], S.starA * vis * 0.9); g.lineWidth = U * 0.005; g.lineJoin = 'round';
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const pc = (k >> 1) % 12, a = -Math.PI / 2 + (k / 2) * Math.PI / 6;
          const r = k % 2 ? R * 0.22 : R * (0.25 + 0.8 * S.chroma[pc]);
          const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      // holding its breath: a thin ring while the sound is cut
      if (S.void > 0.2) { g.strokeStyle = `rgba(255,244,228,${0.7 * S.void})`; g.lineWidth = U * 0.004; g.beginPath(); g.arc(CX, CY, U * (0.06 + 0.01 * Math.sin(now / 90)), 0, TAU); g.stroke(); }
      // melody comet
      const cm = S.comet;
      if (cm.vis > 0.02) { const sz = U * 0.05; g.globalAlpha = cm.vis; g.drawImage(GLOW[cm.pc], cm.x - sz, cm.y - sz, sz * 2, sz * 2); g.drawImage(GLOW_W, cm.x - sz * 0.35, cm.y - sz * 0.35, sz * 0.7, sz * 0.7); g.globalAlpha = 1; }
      // particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        const dg = Math.exp(-p.drag * dt); p.vx *= dg; p.vy *= dg; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const al = Math.pow(1 - p.age / p.life, 1.3) * (0.35 + 0.65 * vis);
        if (p.kind === 0) { const s = p.size * 2.5; g.globalAlpha = al; g.drawImage(GLOW[p.pc], p.x - s, p.y - s, s * 2, s * 2); }
        else if (p.kind === 1) {
          const sp = Math.hypot(p.vx, p.vy) + 1e-6, ux = p.vx / sp, uy = p.vy / sp, L = p.size * 2.4, Wd = p.size * 0.55;
          g.globalAlpha = al; g.fillStyle = rgba(VZ_RGB[p.pc], 1);
          g.beginPath(); g.moveTo(p.x + ux * L, p.y + uy * L); g.lineTo(p.x - uy * Wd, p.y + ux * Wd); g.lineTo(p.x + uy * Wd, p.y - ux * Wd); g.closePath(); g.fill();
        } else if (p.kind === 2) {
          const tw = Math.sin(Math.PI * p.age / p.life), s = p.size * (0.6 + tw);
          g.globalAlpha = tw; g.drawImage(GLOW[p.pc], p.x - s * 1.5, p.y - s * 1.5, s * 3, s * 3);
          g.strokeStyle = 'rgba(255,248,236,0.8)'; g.lineWidth = Math.max(1, U * 0.0015);
          g.beginPath(); g.moveTo(p.x - s * 2, p.y); g.lineTo(p.x + s * 2, p.y); g.moveTo(p.x, p.y - s * 2); g.lineTo(p.x, p.y + s * 2); g.stroke();
        } else {
          const L = 0.05; g.globalAlpha = al; g.strokeStyle = rgba(VZ_RGB[p.pc], 1); g.lineWidth = Math.max(1, p.size * 1.5);
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * L, p.y - p.vy * L); g.stroke();
        }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    /* ---------- GPU passes ---------- */
    const COLF = new Float32Array(36), WF = new Float32Array(12);
    for (let p = 0; p < 12; p++) { const pc = (p * 7) % 12; COLF[p * 3] = VZ_RGB[pc][0] / 255; COLF[p * 3 + 1] = VZ_RGB[pc][1] / 255; COLF[p * 3 + 2] = VZ_RGB[pc][2] / 255; }
    function pass(prog, tgt, texes, set) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null);
      gl.viewport(0, 0, tgt ? tgt.w : W, tgt ? tgt.h : H);
      gl.useProgram(prog.p);
      texes.forEach(([name, tex], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(prog.u[name], i); });
      set(prog.u);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function render(dt, src) {
      const reduce = reduceQ.matches;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texShp);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shp);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const a = fbs[ping], b = fbs[1 - ping];
      const tempoN = S.bpm ? clamp((S.bpm - 60) / 120) : 0.2;
      // trails: sustained sound lingers, percussive sound vanishes fast
      const sustain = clamp((1 - S.punch * 0.9) * (0.35 + 0.65 * S.strength));
      const half = lerp(lerp(0.1, 0.85, sustain), 0.07, S.void);
      const decay = Math.pow(0.5, dt / half);
      // forward motion: energy and build-ups rush outward; a sudden silence pulls inward
      const outRate = 0.03 + 0.25 * S.energy + 1.2 * S.tension + 1.6 * S.kick + 0.6 * S.beat * S.punch;
      const zoom = Math.exp(-(outRate * (1 - S.void) - 1.4 * S.void) * dt * (reduce ? 0.4 : 1));
      const rot = dt * (S.formIdx % 2 ? -1 : 1) * (0.03 + 0.18 * tempoN + 0.5 * S.tension) * (reduce ? 0.3 : 1);
      pass(P.feed, b, [['uPrev', a.tex], ['uShp', texShp]], (u) => {
        gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uTime, S.flow);
        gl.uniform1f(u.uZoom, zoom); gl.uniform1f(u.uRot, rot);
        gl.uniform1f(u.uWarp, (0.0015 + 0.008 * S.noisy + 0.004 * S.energy) * (reduce ? 0.4 : 1));
        gl.uniform1f(u.uDecay, decay); gl.uniform1f(u.uFloor, floatOK ? 0.0006 : 1.5 / 255);
        gl.uniform1f(u.uEcho, S.echo * 0.55); gl.uniform1f(u.uKN, KAL_N[S.formIdx % KAL_N.length]);
      });
      pass(P.bright, blm[0], [['uT', b.tex]], (u) => gl.uniform2f(u.uTexel, 1.5 / W, 1.5 / H));
      pass(P.blur, blm[1], [['uT', blm[0].tex]], (u) => gl.uniform2f(u.uDir, 1.6 / BW, 0));
      pass(P.blur, blm[0], [['uT', blm[1].tex]], (u) => gl.uniform2f(u.uDir, 0, 1.6 / BH));
      for (let p = 0; p < 12; p++) WF[p] = S.chroma[(p * 7) % 12];
      const tonic = S.key >= 0 ? S.key % 12 : topNote();
      pass(P.comp, null, [['uFB', b.tex], ['uBloom', blm[0].tex]], (u) => {
        gl.uniform2f(u.uRes, W, H); gl.uniform3fv(u.uCol, COLF); gl.uniform1fv(u.uW, WF);
        gl.uniform3f(u.uTonic, PC_DEEP[tonic][0] / 255, PC_DEEP[tonic][1] / 255, PC_DEEP[tonic][2] / 255);
        gl.uniform1f(u.uTime, S.flow); gl.uniform1f(u.uEnergy, S.energy); gl.uniform1f(u.uBass, S.bass);
        gl.uniform1f(u.uSharp, clamp((S.bright - 0.15) / 0.6)); gl.uniform1f(u.uGrain, S.noisy);
        gl.uniform1f(u.uLight, 0.3 + 0.6 * S.valence); gl.uniform1f(u.uWarm, S.valence);
        gl.uniform1f(u.uSat, 0.95 + 0.45 * S.arousal); gl.uniform1f(u.uFlash, S.flash); gl.uniform1f(u.uVoid, S.void);
        gl.uniform1f(u.uAberr, reduce ? 0.001 : 0.0015 + 0.022 * S.abb + 0.005 * S.beat * S.punch);
        gl.uniform1f(u.uHue, S.hue); gl.uniform1f(u.uGain, src.kind === 'idle' ? 0.85 : 1); gl.uniform1f(u.uBloomK, 0.9);
      });
      ping = 1 - ping;
    }

    /* ---------- HUD, captions, legend, ribbon ---------- */
    let capTimer = null;
    function caption(m) {
      const el = $('vz-cap');
      if (!m) { el.classList.remove('show'); el.textContent = ''; return; }
      if (m.type === 'beat' && S.kind !== 'live') return;
      const tp = TYPE[m.type] || TYPE.section;
      el.textContent = '';
      const tag = document.createElement('span'); tag.className = 'vz-cap-tag'; tag.style.color = tp.color; tag.textContent = tp.label;
      el.append(tag, document.createTextNode(m.title));
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(capTimer); capTimer = setTimeout(() => el.classList.remove('show'), 4200);
    }
    const hudEls = {};
    ['vz-chip-t', 'vz-chip', 'vz-feel', 'vz-feel-w', 'vz-chord', 'vz-sub', 'vz-intro', 'vz-play', 'vz-replay-last', 'vz-demo', 'vz-intro-note', 'vz-ribbon', 'vz-legend'].forEach(id => hudEls[id] = $(id));
    function hud(src, T, now) {
      if (now - lastHud < 120) return; lastHud = now;
      const e = engine, k = src.kind;
      const chip = hudEls['vz-chip'];
      chip.dataset.state = k;
      hudEls['vz-chip-t'].textContent = k === 'live' ? `Live · ${fmtTime(src.t)}` : k === 'replay' ? `Replay · ${fmtTime(src.t)} / ${fmtTime(rec ? rec.dur : 0)}` : k === 'paused' ? `Paused · ${fmtTime(src.t)}` : (mode === 'example' || mode === 'boot') ? 'Preparing the demo…' : e && e.nF ? 'Portrait of the last session' : 'Waiting for sound';
      const showFeel = k === 'live' || k === 'replay' || k === 'paused';
      hudEls['vz-feel'].hidden = !showFeel;
      if (showFeel) hudEls['vz-feel-w'].textContent = S.mood;
      // readout: chord, its role in the key, section, tempo
      let big = '', sub = [];
      if (k !== 'idle') {
        if (T.chord >= 0) big = chordName(T.chord); else if (T.key >= 0) big = keyName(T.key).replace(' major', '').replace(' minor', 'm'); else big = '';
        if (T.chord >= 0 && T.key >= 0) sub.push(`${roman(T.chord, T.key)} in ${keyName(T.key)}`); else if (T.key >= 0) sub.push(keyName(T.key));
        if (S.letter && T.section >= 0) sub.push(`section ${S.letter}${S.sectionShift ? ` (${S.sectionShift > 0 ? '+' : ''}${S.sectionShift})` : ''}`);
        if (T.bpm) sub.push(`${Math.round(T.bpm)} BPM`);
      } else if (e && e.nF && src.portrait) {
        const s = e._sumCache; big = s && s.keys.length ? keyName(s.keys[s.keys.length - 1].key).replace(' major', '').replace(' minor', 'm') : '';
        if (s && s.bpm) sub.push(`${Math.round(s.bpm)} BPM`); if (s && s.segments.length) sub.push(`${s.segments.length} sections`); sub.push(sourceName());
      }
      hudEls['vz-chord'].textContent = big || ' '; hudEls['vz-sub'].textContent = sub.join(' · ');
      // intro overlay only when nothing is playing
      const idle = k === 'idle';
      hudEls['vz-intro'].hidden = !idle;
      stage.classList.toggle('is-idle', idle);
      const ready = !!exampleSession, preparing = !ready && (mode === 'example' || mode === 'boot');
      const demo = hudEls['vz-demo']; demo.disabled = preparing; demo.textContent = ready ? 'Watch the demo song' : preparing ? 'Preparing the demo…' : 'Play the demo song';
      const own = e && mode === 'stopped' && rec && rec.n && source !== 'example';
      const rl = hudEls['vz-replay-last']; rl.hidden = !own; if (own) rl.textContent = source === 'mic' ? 'Replay your microphone session' : source === 'tab' ? 'Replay your tab session' : 'Replay this session';
      const pb = hudEls['vz-play']; const canReplay = mode === 'stopped' && rec && rec.n;
      pb.hidden = !canReplay || idle;
      if (canReplay) pb.textContent = k === 'replay' ? 'Pause' : pausedAt != null ? 'Resume' : 'Replay';
      drawRibbon(src);
      if (legendOpen && now - lastLegend > 150) { lastLegend = now; legend(T); }
    }
    function drawRibbon(src) {
      const cv = hudEls['vz-ribbon']; fit(cv); const g = cv.getContext('2d'), d = DPR(), Wd = cv.width, Hd = cv.height;
      g.clearRect(0, 0, Wd, Hd);
      const e = engine; if (!e || !e.nF || mode === 'example' || mode === 'boot') return;
      const dur = mode === 'listening' ? Math.max(30, e.time) : Math.max(1, rec ? rec.dur : e.time);
      const X = (t) => (t / dur) * Wd, labels = e.displayLabels(), y0 = Hd - 6 * d, hh = 4 * d;
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y0, Wd, hh);
      for (const sg of e.segments) {
        const L = labels[sg.label] || 'A', t0 = sg.start * BLOCK, t1 = sg.open ? e.time : sg.end * BLOCK;
        g.fillStyle = SECTION_COLORS[(L.charCodeAt(0) - 65) % SECTION_COLORS.length]; g.globalAlpha = 0.85;
        g.fillRect(X(t0) + 1, y0, Math.max(1, X(t1) - X(t0) - 2), hh);
      }
      g.globalAlpha = 1;
      for (const m of e.moments) { if (m.type === 'beat') continue; g.fillStyle = (TYPE[m.type] || TYPE.section).color; g.fillRect(X(m.t) - d, y0 - 5 * d, 2 * d, 4 * d); }
      const t = src.kind === 'live' ? e.time : src.t;
      if (t != null) { g.fillStyle = '#fff'; g.fillRect(X(t) - d, y0 - 7 * d, 2 * d, hh + 7 * d); }
    }
    // legend with live values
    const lv = {};
    ['lv-notes', 'lv-light', 'lv-shape', 'lv-beat', 'lv-trail', 'lv-chord', 'lv-echo', 'lv-form', 'lv-build', 'lv-drop', 'lv-bass', 'lv-air', 'lv-comet', 'lv-grain'].forEach(id => lv[id] = $(id));
    const noteCells = [];
    for (let p = 0; p < 12; p++) { const pc = (p * 7) % 12, s = document.createElement('i'); s.style.background = rgba(VZ_RGB[pc]); s.title = PC[pc]; lv['lv-notes'].appendChild(s); noteCells.push([s, pc]); }
    const bar = (el, v, txt) => { el.innerHTML = `<span class="vz-bar"><i style="width:${Math.round(clamp(v) * 100)}%"></i></span>${txt ? `<span class="vz-val">${txt}</span>` : ''}`; };
    function legend(T) {
      for (const [s, pc] of noteCells) s.style.opacity = (0.12 + 0.88 * S.chroma[pc]).toFixed(2);
      const kn = T.key >= 0 ? keyName(T.key) : 'no key yet';
      const tone = `${S.valence > 0.58 ? 'lighter, warmer' : S.valence < 0.42 ? 'darker, cooler' : 'neutral'}${S.arousal > 0.55 ? ', vivid' : S.arousal < 0.3 ? ', muted' : ''}`;
      lv['lv-light'].textContent = `${kn}${T.bpm ? ` · ${Math.round(T.bpm)} BPM` : ''} → ${tone}`;
      bar(lv['lv-shape'], S.bright, S.bright > 0.55 ? 'bright → angular' : S.bright < 0.3 ? 'dark → round' : 'in between');
      bar(lv['lv-beat'], S.punch, T.bpm ? `${Math.round(T.bpm)} BPM · punch` : 'no steady beat');
      bar(lv['lv-trail'], clamp((1 - S.punch * 0.9) * (0.35 + 0.65 * S.strength)), 'sustain');
      lv['lv-chord'].textContent = T.chord >= 0 ? `${chordName(T.chord)} · ${T.chord >= 12 ? 'minor' : 'major'} triangle` : 'no clear chord → note star';
      bar(lv['lv-echo'], S.echo, S.echo > 0.2 ? 'repeating' : 'new material');
      lv['lv-form'].textContent = S.section >= 0 ? `section ${S.letter || String.fromCharCode(65 + S.section)} · ${FORM_NAMES[S.formIdx]}` : '—';
      bar(lv['lv-build'], S.tension, S.tension > 0.3 ? 'building' : '');
      lv['lv-drop'].textContent = S.void > 0.3 ? 'silence now…' : '';
      bar(lv['lv-bass'], S.bass); bar(lv['lv-air'], S.air); bar(lv['lv-grain'], S.noisy);
      lv['lv-comet'].textContent = S.comet.on ? `${PC[S.comet.pc]} · clear pitch` : 'no single clear pitch';
      drawMood();
    }
    function drawMood() {
      const cv = $('vz-mood'); fit(cv); const g = cv.getContext('2d'), d = DPR(), Wd = cv.width, Hd = cv.height;
      g.clearRect(0, 0, Wd, Hd);
      const pad = 18 * d, x0 = pad, x1 = Wd - pad, y0 = 8 * d, y1 = Hd - 20 * d;
      const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, 'rgba(90,110,200,0.28)'); gr.addColorStop(1, 'rgba(243,164,81,0.28)');
      g.fillStyle = gr; roundRect(g, x0, y0, x1 - x0, y1 - y0, 8 * d); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = d; g.beginPath(); g.moveTo((x0 + x1) / 2, y0); g.lineTo((x0 + x1) / 2, y1); g.moveTo(x0, (y0 + y1) / 2); g.lineTo(x1, (y0 + y1) / 2); g.stroke();
      g.fillStyle = INK.muted; g.font = `${10 * d}px ${FONT.mono}`; g.textBaseline = 'alphabetic';
      g.fillText('darker', x0, Hd - 5 * d); g.textAlign = 'right'; g.fillText('brighter', x1, Hd - 5 * d); g.textAlign = 'center';
      g.fillText('energetic', (x0 + x1) / 2, y0 + 12 * d); g.fillText('calm', (x0 + x1) / 2, y1 - 5 * d); g.textAlign = 'left';
      const x = lerp(x0, x1, S.valence), y = lerp(y1, y0, S.arousal);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5 * d, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x, y, 10 * d, 0, TAU); g.stroke();
    }

    /* ---------- controls ---------- */
    function setLegend(open) {
      legendOpen = open; hudEls['vz-legend'].hidden = !open; $('vz-why').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) legend({ key: S.key, bpm: S.bpm, chord: S.chord });
    }
    $('vz-why').addEventListener('click', () => setLegend(!legendOpen));
    $('vz-why-x').addEventListener('click', () => setLegend(false));
    const toggleClean = () => { const on = !stage.classList.contains('clean'); stage.classList.toggle('clean', on); $('vz-clean').setAttribute('aria-pressed', on ? 'true' : 'false'); $('vz-clean').textContent = on ? 'Show text' : 'Hide text'; };
    $('vz-clean').addEventListener('click', toggleClean);
    const toggleFull = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => notice('Full screen is not available in this browser.'));
    };
    $('vz-full').addEventListener('click', toggleFull);
    document.addEventListener('fullscreenchange', () => { $('vz-full').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
    $('vz-play').addEventListener('click', () => { if (play) pauseReplay(); else playFrom(pausedAt != null ? pausedAt : 0); });
    $('vz-demo').addEventListener('click', () => watchDemo());
    $('vz-replay-last').addEventListener('click', () => playFrom(0));
    $('vz-tab').addEventListener('click', () => start('tab'));
    $('vz-mic').addEventListener('click', () => start('mic'));
    hudEls['vz-ribbon'].addEventListener('click', (ev) => {
      if (mode !== 'stopped' || !rec || !rec.n) return;
      const r = hudEls['vz-ribbon'].getBoundingClientRect(); playFrom(clamp((ev.clientX - r.left) / r.width) * rec.dur);
    });
    document.addEventListener('keydown', (ev) => {
      if (page !== 'visuals' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); toggleFull(); }
      else if (ev.key === 'h' || ev.key === 'H') { ev.preventDefault(); toggleClean(); }
    });

    /* ---------- one frame ---------- */
    let lastSrc = null;
    function frame(view, now) {
      const dt = clamp((now - (lastNow || now)) / 1000, 0, 0.1); lastNow = now;
      if (!ensureSize()) return;
      U = Math.min(W, H) * 0.5; CX = W / 2; CY = H / 2;
      if (engine !== S.eng) resetFor(engine);
      const src = pickSource(view);
      src.jump = !!(lastSrc && lastSrc.t != null && src.t != null && (src.t < lastSrc.t - 0.05 || src.t - lastSrc.t > 0.6)) || (lastSrc && lastSrc.kind !== src.kind && src.kind === 'replay');
      S.kind = src.kind;
      const T = targets(src, dt, now);
      update(T, dt, now);
      events(src, T, now, dt);
      drawShapes(dt, now, src);
      if (useGL) render(dt, src);
      hud(src, T, now);
      lastSrc = src;
    }
    function onShow() { lastNow = 0; lastSrc = null; }
    if (/[?&]debug\b/.test(location.search)) window.__vz = { playFrom, pauseReplay, S };
    return { frame, onShow };
  })();


  /* ============================================================
     MIX — two songs, and ideas for getting from one to the other.
     The thinking happens in AnatomyMix (its own script, no DOM);
     this part loads and analyzes the songs, draws the results and
     renders the audible previews.
     ============================================================ */
  const MX = (() => {
    const M = AnatomyMix, TCOL = ['#f3a451', '#6fd0b8'], SR_PREVIEW = 44100;
    const DEMOS = [{ id: 'a', name: 'Demo 1 · Gear Change' }, { id: 'b', name: 'Demo 2 · Night Drive' }];
    const decks = [null, null];   // { status, token, name, source, L, R, sr, dur, profile, progress, phase, error, note, abuf }
    let result = null, level = 1, seq = 0, queue = [], running = false;
    const showAll = { 1: false, 2: false, 3: false }, SHOW = 6;
    const visibleIdeas = () => result ? result.byLevel[level].filter(x => showAll[level] || x.rank <= SHOW) : [];
    const selected = { 1: null, 2: null, 3: null };   // idea id picked at each level
    let stage = null;                                   // { idea, cv, btn } of the transition on the stage
    const currentIdea = () => { if (!result) return null; const L = result.byLevel[level]; return L.find(x => x.id === selected[level]) || L[0] || null; };
    let pv = null;                // what's playing: { id, kind: 'idea'|'deck'|'pair', src, start, off, len, idea, deck }
    const rendered = new Map();   // idea id → rendered preview AudioBuffer (a few recent ones)
    let mapCv = null, mapHover = null, fileTarget = 0;
    try { const v = +localStorage.getItem('anatomy.mix.level'); if (v >= 1 && v <= 3) level = v; } catch (e) { /* storage unavailable: default level */ }

    const h = (tag, cls, text, attrs) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
    const btn = (label, fn, cls = 'btn') => { const b = h('button', cls, label, { type: 'button' }); b.addEventListener('click', fn); return b; };
    const secColor = (letter) => SECTION_COLORS[((letter || 'A').charCodeAt(0) - 65) % SECTION_COLORS.length];
    const cleanName = (n) => n.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled';
    const fmtDur = (s) => fmtTime(s);
    const lastSessionOK = () => mode === 'stopped' && rec && rec.n > rec.sr * 20 && source !== 'example' && engine;

    /* ---------------- decks: loading ---------------- */
    function setDeck(i, d) { decks[i] = d; renderDeck(i); onDecksChanged(); }
    function onDecksChanged() {
      $('mx-swap').disabled = !(decks[0] && decks[1] && decks[0].status === 'ready' && decks[1].status === 'ready');
      stopPreview(); rendered.clear();
      if (decks[0] && decks[1] && decks[0].status === 'ready' && decks[1].status === 'ready') {
        result = M.match(decks[0].profile, decks[1].profile);
        renderCompat(); renderReport(); renderIdeas(); buildMap();
      } else { result = null; stage = null; renderCompat(); $('mx-tiles').innerHTML = '<p class="fit-empty">Load two songs to see how their tempo, key, loudness and beat grids line up.</p>'; $('mx-ideas').hidden = true; $('mx-mappanel').hidden = true; }
      renderDeck(0); renderDeck(1);
    }
    async function loadFile(i, file) {
      if (!file) return;
      const token = ++seq;
      setDeck(i, { status: 'loading', token, name: cleanName(file.name), source: 'file', progress: 0, phase: 'Reading the file…' });
      try {
        const bytes = await file.arrayBuffer();
        if (!alive(i, token)) return;
        decks[i].phase = 'Decoding…'; renderDeck(i);
        const ab = await ensureCtx().decodeAudioData(bytes);
        if (!alive(i, token)) return;
        const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
        Object.assign(decks[i], { L, R, sr: ab.sampleRate, dur: ab.duration, abuf: ab, phase: 'Waiting to analyze…' });
        enqueue(i, token);
      } catch (err) {
        if (alive(i, token)) setDeck(i, { status: 'error', token, name: cleanName(file.name), error: 'This browser couldn\'t decode that file as audio. Try an mp3, wav, m4a, ogg or flac.' });
      }
    }
    function loadDemo(i, which) {
      const token = ++seq, dm = DEMOS[which];
      setDeck(i, { status: 'loading', token, name: dm.name, source: 'demo', progress: 0, phase: 'Synthesizing the demo song…' });
      setTimeout(() => {
        if (!alive(i, token)) return;
        const song = demoCache['mix-' + dm.id] || (demoCache['mix-' + dm.id] = AnatomyDemo.render(44100, dm.id));
        Object.assign(decks[i], { L: song.L, R: song.R, sr: song.sr, dur: song.L.length / song.sr, phase: 'Waiting to analyze…' });
        enqueue(i, token);
      }, 30);
    }
    function loadSession(i) {
      if (!lastSessionOK()) return;
      const token = ++seq, x = new Float32Array(rec.n); for (let k = 0; k < rec.n; k++) x[k] = rec.data[k] / 32767;
      const name = `Your ${source === 'tab' ? 'browser-tab' : source === 'mic' ? 'microphone' : 'demo'} session, ${sessionStamp.toLocaleTimeString([], { timeStyle: 'short' })}`;
      setDeck(i, { status: 'loading', token, name, source: 'session', L: x, R: x, sr: rec.sr, dur: rec.n / rec.sr, progress: 0, phase: 'Waiting to analyze…' });
      enqueue(i, token);
    }
    const alive = (i, token) => decks[i] && decks[i].token === token;
    function enqueue(i, token) { queue.push({ i, token }); pump(); }
    function pump() {
      if (running) return;
      const job = queue.shift(); if (!job) return;
      if (!alive(job.i, job.token)) { pump(); return; }
      running = true;
      const d = decks[job.i], n = d.L.length > MAX_SEC * d.sr ? Math.floor(MAX_SEC * d.sr) : d.L.length;
      const e = new Engine(d.sr, { maxSec: n / d.sr + 2, pitchEvery: 6 });
      let k = 0; const CH = 4096;
      d.phase = 'Analyzing'; renderDeck(job.i);
      const step = () => {
        if (!alive(job.i, job.token)) { running = false; pump(); return; }
        const until = performance.now() + 22;
        while (k < n && performance.now() < until) { const b = Math.min(n, k + CH); e.push(d.L.subarray(k, b), d.R.subarray(k, b)); k = b; }
        d.progress = k / n; updateProgress(job.i);
        if (k < n) { setTimeout(step, 0); return; }
        d.phase = 'Listening for vocals…'; d.progress = 1; updateProgress(job.i);
        e.finalize();
        let profile = null, err = null;
        try { profile = M.profile(e, { name: d.name, source: d.source, audio: { L: d.L.subarray(0, n), R: d.R.subarray(0, n), sr: d.sr } }); } catch (x) { err = x; }
        running = false;
        if (err || !profile.nB) setDeck(job.i, { status: 'error', token: job.token, name: d.name, error: 'Analysis failed on this file' + (err ? `: ${err.message}` : '.') });
        else {
          Object.assign(d, { status: 'ready', profile, note: n < d.L.length ? `Only the first ${Math.round(MAX_SEC / 60)} minutes were analyzed.` : '' });
          onDecksChanged();
        }
        pump();
      };
      setTimeout(step, 0);
    }

    /* ---------------- decks: drawing ----------------
       Each song is drawn as a 3-band waveform: lows in a deep shade of its deck color, mids in the deck color,
       highs in warm white, all measured from the audio (the same kick/mid/snare bands the beat grid uses).
       Track 1's waveform grows up from the fit strip and Track 2's grows down from it, so they face each other. */
    const ICON_PLAY = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>';
    const ICON_STOP = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>';
    function renderDeck(i) {
      const el = $('deck-' + i), d = decks[i], who = i ? 'Track 2, comes in' : 'Track 1, plays out';
      el.textContent = ''; if (d && d.cv) d.cv = null; el.classList.toggle('empty', !d);
      if (!d) {
        const z = h('div', 'deck-drop'), p = h('p');
        p.append(h('b', null, i ? 'Track 2: the song that comes in' : 'Track 1: the song that plays out'), document.createTextNode('Drop an mp3, wav, m4a or flac here, or choose one. It stays on your computer.'));
        const row = h('div', 'row');
        row.append(btn('Choose a file', () => { fileTarget = i; $('mx-file').click(); }), btn(`Use ${DEMOS[i].name.split(' · ')[0].toLowerCase()}`, () => loadDemo(i, i)));
        if (lastSessionOK()) row.append(btn('Use your last session', () => loadSession(i)));
        z.append(p, row); el.append(z); el.append(h('span', null, null, { id: `deck-${i}-h`, hidden: '' })); return;
      }
      const name = h('p', 'deck-name', null, { id: `deck-${i}-h` }); name.append(h('b', null, d.name, { title: d.name }), h('span', null, who));
      el.append(name);
      if (d.status === 'loading') {
        const b = h('div', 'deck-busy'), pr = h('div', 'deck-prog'); pr.append(h('i')); b.append(pr, h('p', null, d.phase || 'Working…'));
        el.append(b); updateProgress(i);
        const foot = h('div', 'deck-foot'); foot.append(h('span', null, 'Analyzed in this page. A 4-minute song takes a few seconds.'), btn('Cancel', () => setDeck(i, null), 'linkbtn')); el.append(foot);
        return;
      }
      if (d.status === 'error') {
        el.append(h('p', 'deck-err', d.error));
        const foot = h('div', 'deck-foot'), ln = h('div', 'links'); ln.append(btn('Try another file', () => { fileTarget = i; $('mx-file').click(); }, 'linkbtn'), btn('Clear', () => setDeck(i, null), 'linkbtn')); foot.append(h('span'), ln); el.append(foot);
        return;
      }
      const P = d.profile, nums = h('div', 'deck-nums');
      const num = (big, small, cls) => { const x = h('div', 'deck-num' + (cls ? ' ' + cls : '')); x.append(h('b', null, big), h('small', null, small)); nums.append(x); };
      num(P.bpm ? P.bpm.toFixed(1) : '—', P.bpm ? 'BPM' : 'no steady beat');
      if (P.home >= 0) num(M.camelot(P.home), keyName(P.home), 'key');
      num(fmtDur(P.dur), P.sung == null ? 'length' : P.mono ? 'mono file' : `about ${Math.round(P.sung * 100)}% sung`);
      el.append(nums);
      const cv = h('canvas', 'deck-wave', null, { 'aria-label': `Waveform of ${d.name}, colored by bass, mids and highs. Click to listen from a point.` });
      cv.addEventListener('click', (ev) => { const r = cv.getBoundingClientRect(); toggleDeck(i, clamp((ev.clientX - r.left) / r.width) * P.dur); });
      el.append(cv); d.cv = cv; cv._dirty = true;
      const foot = h('div', 'deck-foot'), ln = h('div', 'links');
      foot.append(h('span', null, d.note || (d.source === 'demo' ? 'A synthesized demo song with known answers. Click the waveform to listen. Triangles mark its drops.' : 'Click the waveform to listen from any point. Triangles mark drops; the dotted line marks likely vocals.')));
      ln.append(btn('Replace', () => { fileTarget = i; $('mx-file').click(); }, 'linkbtn'), btn('Clear', () => setDeck(i, null), 'linkbtn'));
      foot.append(ln); el.append(foot);
    }
    function updateProgress(i) {
      const d = decks[i], el = $('deck-' + i); if (!d || d.status !== 'loading') return;
      const bar = el.querySelector('.deck-prog i'), p = el.querySelector('.deck-busy p');
      if (bar) bar.style.width = `${Math.round((d.progress || 0) * 100)}%`;
      if (p) p.textContent = d.phase === 'Analyzing' ? `Analyzing… ${Math.round((d.progress || 0) * 100)}%` : d.phase;
    }
    // band amplitudes of a song, normalized so the three layers nest (lows tallest, highs smallest)
    function bandsOf(P) {
      if (P._wf) return P._wf;
      const f = P.feat; if (!f) return null;
      // one shared reference (the loudest moments of all three bands together) keeps the bands' natural balance;
      // the weights nest the layers (bass tallest, highs smallest), as in DJ software's 3-band waveforms
      const tot = new Float32Array(f.eLo.length); for (let i = 0; i < tot.length; i++) tot[i] = Math.sqrt(f.eLo[i] + f.eMid[i] + f.eHi[i]);
      const s = Array.from(tot).filter((_, i) => i % 4 === 0).sort((x, y) => x - y), top = s[Math.floor(s.length * 0.985)] || 1;
      const amp = (E, w) => { const a = new Float32Array(E.length); for (let i = 0; i < E.length; i++) a[i] = Math.min(1, Math.pow(w * Math.sqrt(E[i]) / top, 0.8)); return a; };
      return (P._wf = { hop: f.hop, lo: amp(f.eLo, 1.25), mid: amp(f.eMid, 0.95), hi: amp(f.eHi, 1.0) });
    }
    function bandAt(W, t0, t1) {   // peak of each band over [t0, t1) in song time
      const a = Math.max(0, Math.floor(t0 / W.hop)), b = Math.min(W.lo.length, Math.max(a + 1, Math.ceil(t1 / W.hop)));
      let lo = 0, mi = 0, hi = 0; for (let f = a; f < b; f++) { if (W.lo[f] > lo) lo = W.lo[f]; if (W.mid[f] > mi) mi = W.mid[f]; if (W.hi[f] > hi) hi = W.hi[f]; }
      return [lo, mi, hi];
    }
    const deckCols = (i) => i ? ['#2c6e60', TCOL[1], '#c8efe3'] : ['#8a5320', TCOL[0], '#ffe2c0'];
    function drawDeckWave(i, playT) {
      const d = decks[i]; if (!d || d.status !== 'ready' || !d.cv) return;
      const cv = d.cv, P = d.profile, W = bandsOf(P); fit(cv); const g = cv.getContext('2d'), dd = DPR(), Wd = cv.width, H = cv.height;
      g.clearRect(0, 0, Wd, H); if (!W) return;
      const up = i === 0, X = (t) => (t / P.dur) * Wd, secH = 5 * dd, base = up ? H - secH - 3 * dd : secH + 3 * dd, span = H - secH - 10 * dd;
      // the part of the song the chosen transition uses
      const idea = currentIdea();
      if (idea) {
        const dp = idea.plan.decks[i]; let a = Infinity, b = -Infinity;
        for (let t = 0; t < idea.plan.len; t += 0.1) { const st = M.songTime(dp, t); if (st != null) { a = Math.min(a, st); b = Math.max(b, st); } }
        if (a < b) { g.fillStyle = 'rgba(241,235,225,0.07)'; g.fillRect(X(a), 0, Math.max(2, X(b) - X(a)), H); }
      }
      const cols = deckCols(i), step = Math.max(1, Math.round(dd));
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = cols[layer];
        for (let x = 0; x < Wd; x += step) {
          const v = bandAt(W, x / Wd * P.dur, (x + step) / Wd * P.dur)[layer], hh = Math.max(0.5, v * span);
          g.fillRect(x, up ? base - hh : base, step, hh);
        }
      }
      // likely vocals: a dotted line just off the facing edge
      if (P.vocal && !P.mono) { g.fillStyle = 'rgba(246,239,228,0.75)'; const y = up ? H - 2 * dd : 1 * dd; for (let b = 0; b < P.nB; b += 1) { const v = P.vocal[b]; if (v < 0.35) continue; g.globalAlpha = 0.3 + 0.7 * v; g.fillRect(X(b * BLOCK), y, Math.max(1, X(BLOCK) - X(0) - dd), 1.5 * dd); } g.globalAlpha = 1; }
      // drops (v7): small triangles on the facing edge, bigger for bigger drops
      g.fillStyle = INK.text;
      for (const dr of P.drops || []) { if (dr.kind === 'gap' && !dr.gap) continue; const x = X(dr.t), r = (dr.kind === 'drop' ? 5 : 3.5) * dd, y = up ? H - 1 : 1; g.globalAlpha = dr.kind === 'drop' ? 0.95 : 0.6; g.beginPath(); g.moveTo(x - r, up ? y - 1.6 * r : y + 1.6 * r); g.lineTo(x + r, up ? y - 1.6 * r : y + 1.6 * r); g.lineTo(x, y); g.closePath(); g.fill(); }
      g.globalAlpha = 1;
      // sections as a thin band on the outer edge
      for (const s of P.secs) { g.fillStyle = secColor(s.letter); g.globalAlpha = 0.75; g.fillRect(X(s.t0) + dd, up ? 0 : H - secH, Math.max(1, X(s.t1) - X(s.t0) - 2 * dd), secH); }
      g.globalAlpha = 1;
      if (idea) {
        const t = i === 0 ? idea.cueA : idea.cueB, xx = X(t);
        g.fillStyle = INK.text; g.fillRect(xx - dd * 0.75, 0, 1.5 * dd, H);
        g.font = `600 ${10.5 * dd}px ${FONT.mono}`; g.textBaseline = up ? 'top' : 'bottom';
        const lab = fmtTime(t), w = g.measureText(lab).width, lx = xx + 5 * dd + w > Wd ? xx - 5 * dd - w : xx + 5 * dd;
        g.fillStyle = 'rgba(18,16,23,0.85)'; g.fillRect(lx - 3 * dd, up ? secH + 2 * dd : H - secH - 16 * dd, w + 6 * dd, 14 * dd);
        g.fillStyle = INK.text; g.fillText(lab, lx, up ? secH + 3.5 * dd : H - secH - 3.5 * dd);
      }
      if (playT != null) { g.fillStyle = INK.live; g.fillRect(X(playT) - dd, 0, 2 * dd, H); }
    }

    /* ---------------- compatibility (v7): one number at the top ---------------- */
    function renderCompat() {
      const box = $('mx-compat'), C = result && result.compat; box.textContent = '';
      if (!C) { box.hidden = true; return; } box.hidden = false; box.dataset.v = verdictOf(C.v);
      const sc = h('div', 'cmp-score'); sc.append(h('b', null, String(Math.round(C.v * 100))), h('span', null, C.word, { id: 'mx-compat-h' }), h('small', null, 'Compatibility, out of 100'));
      const ul = h('ul', 'cmp-parts', null, { 'aria-label': 'What the score is made of' });
      for (const p of C.parts) {
        const li = h('li', null, null, { 'data-v': verdictOf(p.v) }), hh = h('h3'); hh.append(document.createTextNode(p.label), h('i', null, String(Math.round(p.v * 100))));
        const bar = h('span', 'check-bar', null, { title: `${Math.round(p.v * 100)} of 100` }), fill = h('i'); fill.style.width = `${Math.round(p.v * 100)}%`; bar.append(fill);
        li.append(hh, bar, h('p', null, p.text)); ul.append(li);
      }
      box.append(sc, ul);
    }

    /* ---------------- how they fit: the strip between the decks ---------------- */
    function renderReport() {
      const R = result, box = $('mx-tiles'); box.textContent = '';
      const item = (title, verdict, valHTML, text, cls) => { const t = h('div', 'fit' + (cls ? ' ' + cls : ''), null, { 'data-verdict': verdict }); t.append(h('h3', null, title)); const v = h('div', 'v'); v.innerHTML = valHTML; t.append(v, h('p', null, text)); box.append(t); return t; };
      const ev = { easy: 'pass', ok: 'pass', stretch: 'close', none: 'fail' }[R.T.ease];
      item('Tempo', ev, `<i class="t1">${R.A.bpm ? R.A.bpm.toFixed(1) : '—'}</i> → <i class="t2">${R.B.bpm ? R.B.bpm.toFixed(1) : '—'}</i>`, R.T.pct == null ? 'No steady beat in one song: cuts and echoes only.' : R.T.ease === 'none' ? `${Math.abs(R.T.pct * 100).toFixed(0)}% apart even at half or double time: too far to beatmatch.` : `Track 2 needs ${pctTxt2(R.T.pct)}${R.T.r !== 1 ? ` (at ${R.T.r > 1 ? 'double' : 'half'} time)` : ''}. ${R.T.ease === 'easy' ? 'A small nudge.' : R.T.ease === 'ok' ? 'Inside a normal pitch fader.' : 'Needs a wide pitch range.'}`);
      const kt = item('Key', R.K.rel.shared >= 6 ? 'pass' : R.K.rel.shared === 5 ? 'close' : 'fail', `<i class="t1">${M.camelot(R.K.a)}</i> → <i class="t2">${M.camelot(R.K.b)}</i>`, `${keyName(R.K.a)} to ${keyName(R.K.b)}: ${R.K.rel.word}, ${R.K.rel.shared} of 7 notes shared.` + (R.K.shift ? ` Shifting Track 2 ${R.K.shift > 0 ? 'up' : 'down'} ${Math.abs(R.K.shift)} semitone${Math.abs(R.K.shift) > 1 ? 's' : ''} makes it ${R.K.relShift.shared} of 7.` : ''), 'fit-key');
      const wc = h('canvas', null, null, { 'aria-label': 'Camelot wheel with both keys marked' }); kt.prepend(wc); wc._draw = () => drawCamelot(wc, R.K.a, R.K.b, R.K.shift ? M.transposeKey(R.K.b, R.K.shift) : -1);
      const dl = -R.trim;
      item('Loudness', Math.abs(dl) < 1.5 ? 'pass' : 'close', Math.abs(dl) < 0.5 ? 'Even' : `<i class="t2">${dl > 0 ? '+' : '−'}${Math.abs(dl).toFixed(1)}</i> dB`, Math.abs(dl) < 0.5 ? 'Both songs are equally loud (LUFS).' : `Track 2 is ${Math.abs(dl).toFixed(1)} dB ${dl > 0 ? 'louder' : 'quieter'} (LUFS). Previews correct for it; trim it ${dl > 0 ? 'down' : 'up'} on your mixer.`);
      const tight = [R.A, R.B].every(P => P.grid && P.grid.driftMs < 15 && P.grid.barConf >= 0.75), gOK = [R.A, R.B].every(P => P.grid && P.grid.steady && P.grid.barConf >= 0.5);
      const gl = [R.A, R.B].map((P, k) => !P.grid ? `Track ${k + 1}: no steady beat.` : `Track ${k + 1}: ${P.grid.driftMs < 15 ? `steady to ${Math.max(1, Math.round(P.grid.driftMs))} ms` : `${Math.round(P.grid.driftMs)} ms of drift`}, bar 1 ${P.grid.barConf >= 0.75 ? 'clear' : P.grid.barConf >= 0.5 ? 'likely' : 'uncertain'}.`);
      item('Beat grid', tight || gOK ? 'pass' : 'close', tight ? 'Locked' : gOK ? 'Mostly locked' : 'Check by ear', gl.join(' '));
    }
    const pctTxt2 = (p) => `${p >= 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1)}% tempo`;
    function drawCamelot(cv, ka, kb, kShift) {
      fit(cv); const g = cv.getContext('2d'), d = DPR(), W = cv.width, c = W / 2; g.clearRect(0, 0, W, W);
      if (W < 30 * d) return;
      const Ro = W * 0.48, Rm = W * 0.34, Ri = W * 0.2;
      const pos = (k) => { const n = parseInt(M.camelot(k), 10); return { a: -Math.PI / 2 + (n - 1) * Math.PI / 6, ring: k < 12 ? 1 : 0 }; };
      for (let n = 0; n < 12; n++) for (let ring = 0; ring < 2; ring++) {
        const a0 = -Math.PI / 2 + n * Math.PI / 6 - Math.PI / 12 + 0.03, a1 = a0 + Math.PI / 6 - 0.06, r0 = ring ? Rm : Ri, r1 = ring ? Ro : Rm - 1.5 * d;
        const majPc = (((n + 1 - 8) % 12 + 12) % 12 * 7) % 12;
        g.beginPath(); g.arc(c, c, r1, a0, a1); g.arc(c, c, r0, a1, a0, true); g.closePath(); g.fillStyle = rgba(PC_RGB[majPc], 0.2); g.fill();
      }
      const at = (k) => { const p = pos(k), rr = p.ring ? (Rm + Ro) / 2 : (Ri + Rm) / 2; return [c + Math.cos(p.a) * rr, c + Math.sin(p.a) * rr]; };
      if (kShift >= 0) { const [x, y] = at(kShift); g.strokeStyle = TCOL[1]; g.lineWidth = 1.2 * d; g.beginPath(); g.arc(x, y, 4.5 * d, 0, Math.PI * 2); g.stroke(); }
      for (const [k, col, r] of [[ka, TCOL[0], 4 * d], [kb, TCOL[1], 3.2 * d]]) { if (k < 0) continue; const [x, y] = at(k); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }

    /* ---------------- transitions: the list ---------------- */
    const LEVEL_NOTES = {
      1: 'Moves that work on any mixer, each landing Track 2\'s drop: a blend into it, a filter riser, a cut, an echo or a tape stop.',
      2: 'Drop swaps, double drops, rolls, washes, spinbacks and key lifts: more tension, still clean.',
      3: 'Fake-out drops, back-to-back build-ups, silence switches, look-alike moments and key tricks.'
    };
    const verdictOf = (v) => v >= 0.75 ? 'pass' : v >= 0.5 ? 'close' : 'fail';
    function scoreRing(v) {
      const r = 15, c = 2 * Math.PI * r, col = { pass: 'var(--pass)', close: 'var(--close)', fail: 'var(--fail)' }[verdictOf(v)];
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 38 38'); s.setAttribute('class', 'pick-score'); s.setAttribute('aria-hidden', 'true');
      s.innerHTML = `<circle cx="19" cy="19" r="${r}" fill="none" stroke="var(--raise)" stroke-width="3"/><circle cx="19" cy="19" r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 19 19)"/><text x="19" y="19" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-size="11" font-weight="600" font-family="IBM Plex Sans, sans-serif">${Math.round(v * 100)}</text>`;
      return s;
    }
    function renderIdeas() {
      const R = result; $('mx-ideas').hidden = false;
      document.querySelectorAll('#mx-levels .mx-level').forEach(b => { const on = +b.dataset.level === level; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
      const list = R.byLevel[level];
      $('mx-level-note').textContent = LEVEL_NOTES[level];
      const ol = $('mx-list'); ol.textContent = '';
      if (!list.length) ol.append(h('li', 'mx-empty', 'Nothing at this level suits these two songs. See why below, or try another level.'));
      const cur = currentIdea();
      if (cur && list.indexOf(cur) >= SHOW) showAll[level] = true;
      list.forEach((idea, k) => {
        if (k >= SHOW && !showAll[level]) return;
        const li = h('li'), b = h('button', 'pick', null, { type: 'button', 'data-id': idea.id, title: `Sound check ${Math.round(idea.check.total * 100)} of 100` });
        b.append(h('span', 'pick-rank', String(idea.rank)), h('span', 'pick-name', idea.name), h('span', 'pick-sub', idea.title), scoreRing(idea.check.total));
        if (cur && cur.id === idea.id) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => {
          if (selected[level] !== idea.id) { selected[level] = idea.id; stopPreview(); renderIdeas(); }
          // on narrow screens the stage sits below the list, so bring it into view
          if (window.matchMedia('(max-width: 1080px)').matches) $('mx-stage').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
        li.append(b); ol.append(li);
      });
      if (list.length > SHOW) { const more = h('li', 'mx-more'); more.append(btn(showAll[level] ? 'Show fewer' : `Show ${list.length - SHOW} more`, () => { showAll[level] = !showAll[level]; renderIdeas(); }, 'linkbtn')); ol.append(more); }
      const sk = $('mx-skipped'); sk.textContent = '';
      const skipped = R.skipped.filter(s => s.level === level);
      $('mx-skipped-box').hidden = !skipped.length;
      for (const s of skipped) { const li = h('li'); li.append(h('b', null, s.name + ': '), document.createTextNode(s.why)); sk.append(li); }
      $('mx-gloss').hidden = level !== 1;
      renderStage(cur);
      for (const i of [0, 1]) if (decks[i] && decks[i].cv) decks[i].cv._dirty = true;
      if (mapCv) mapCv._dirty = true;
    }

    /* ---------------- transitions: the stage ---------------- */
    const CHECK_NAME = { rhythm: 'Rhythm', phrase: 'Phrase', voice: 'One voice', key: 'Key', flow: 'Flow', clean: 'Clean audio' };
    function renderStage(idea) {
      const box = $('mx-stage'); box.textContent = ''; stage = null;
      if (!idea) { box.hidden = true; return; } box.hidden = false;
      const head = h('div', 'stage-head'), kind = h('p', 'stage-kind');
      kind.append(h('b', null, idea.name), document.createTextNode(`, ${LEVEL_NAME_UI[idea.level].toLowerCase()} level`));
      const play = h('button', 'stage-play', null, { type: 'button', 'aria-pressed': 'false' }); play.innerHTML = `${ICON_PLAY}<span>Play preview</span>`;
      play.addEventListener('click', () => togglePreview(idea));
      head.append(kind, h('h3', null, idea.title), h('p', 'stage-hook', idea.hook), play);
      const cues = h('div', 'stage-cues'), c1 = h('span', 'c1'), c2 = h('span', 'c2');
      c1.append(document.createTextNode('Track 1 cue '), h('b', null, M.where(result.A, idea.cueA)));
      c2.append(document.createTextNode('Track 2 cue '), h('b', null, M.where(result.B, idea.cueB)));
      cues.append(c1, c2); for (const c of idea.chips.slice(2)) cues.append(h('span', null, c));
      const cv = h('canvas', 'stage-cv', null, { 'aria-label': `The transition drawn over time: Track 1 above the line, Track 2 below, with every fader and EQ move applied. Click to play from a point.` });
      cv.addEventListener('click', (ev) => { const r = cv.getBoundingClientRect(), d = DPR(), g = stageGeom(cv); togglePreview(idea, clamp(((ev.clientX - r.left) * d - g.x0) / (g.x1 - g.x0)) * idea.plan.len); });
      const lg = h('div', 'stage-legend'); lg.innerHTML = '<span><i class="lg-lo"></i>Bass</span><span><i class="lg-mid"></i>Mids</span><span><i class="lg-hi"></i>Highs</span><span><i class="lg-fader"></i>Fader</span><span><i class="lg-vox"></i>Likely vocals</span><span>▼ Where the drop lands</span>';
      const sp = h('p', 'stage-special'); sp.append(h('b', null, 'Why it\'s special'), h('span', null, idea.special || idea.hook), h('em', null, idea.land != null ? `Payoff ${Math.round(idea.payoff * 100)} · sound ${Math.round(idea.check.total * 100)}` : `Sound ${Math.round(idea.check.total * 100)}`));
      const ck = h('div', 'check', null, { role: 'list', 'aria-label': 'Sound check' });
      for (const r of idea.check.rows) {
        const it = h('div', 'check-item', null, { role: 'listitem', 'data-v': verdictOf(r.v) }), h4 = h('h4', null, CHECK_NAME[r.k]), bar = h('span', 'check-bar', null, { title: `${Math.round(r.v * 100)} of 100` });
        const fill = h('i'); fill.style.width = `${Math.round(r.v * 100)}%`; bar.append(fill); h4.append(bar); it.append(h4, h('p', null, r.text)); ck.append(it);
      }
      const cols = h('div', 'stage-cols'), sb = h('div'), wb = h('div', 'why');
      sb.append(h('h4', null, 'On your decks'));
      const ol = h('ol', 'steps'); for (const s of idea.steps) ol.append(h('li', null, s)); sb.append(ol);
      wb.append(h('h4', null, 'Why it works'));
      const ul = h('ul'); for (const w of idea.why) ul.append(h('li', null, w)); wb.append(ul);
      const warns = idea.warn.concat(idea.sync === 'match' ? result.warnGrid : []);
      if (warns.length) { wb.append(h('h4', null, 'Watch out')); const wl = h('ul', 'warn'); for (const w of warns) wl.append(h('li', null, w)); wb.append(wl); }
      cols.append(sb, wb);
      box.append(head, cues, cv, lg, sp, ck, cols);
      stage = { idea, cv, btn: play }; cv._dirty = true; syncButtons();
    }
    const LEVEL_NAME_UI = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
    const stageGeom = (cv) => { const d = DPR(), H = cv.height, gut = cv.width > 560 * d ? 64 * d : 34 * d; return { x0: gut, x1: cv.width - 6 * d, top: 34 * d, axis: 34 * d + (H - 54 * d) / 2, bot: H - 20 * d, gut }; };
    const valAt = M.envVal;   // one automation-curve reader, shared with the sound check
    // what a deck actually sends out at plan time t, per band, after fader, EQ and filters
    function deckOut(dp, W, t, dt) {
      const st = M.songTime(dp, t); if (st == null || !W) return null;
      const c = dp.clips.find(x => t >= x.at && t < x.at + x.dur);
      const [lo, mi, hi] = bandAt(W, Math.min(st, st + (c && c.rev ? -dt : dt) * (c ? c.rate : 1)), Math.max(st, st + (c && c.rev ? -dt : dt) * (c ? c.rate : 1)) + 1e-3);
      const g = clamp(valAt(dp.gain, t, 1)), hp = valAt(dp.hpf, t, 20), lp = valAt(dp.lpf, t, 20000);
      const hpK = (f) => clamp(1 - Math.log2(Math.max(1, hp / f)) / 2.5), lpK = (f) => clamp(1 - Math.log2(Math.max(1, f / lp)) / 2.5);
      let a = [lo * valAt(dp.lo, t, 1) * hpK(90) * lpK(90), mi * valAt(dp.mid, t, 1) * hpK(700) * lpK(700), hi * valAt(dp.hi, t, 1) * hpK(4000) * lpK(4000)];
      return { a: a.map(v => v * g), g, st, rev: c && c.rev };
    }
    function drawIdea(cv, idea, playT) {
      fit(cv); const g = cv.getContext('2d'), d = DPR(), Wd = cv.width, H = cv.height; g.clearRect(0, 0, Wd, H);
      const plan = idea.plan, geo = stageGeom(cv), { x0, x1, axis } = geo, X = (t) => x0 + (t / plan.len) * (x1 - x0), Tt = (x) => (x - x0) / (x1 - x0) * plan.len;
      const Ps = [result.A, result.B], half = axis - geo.top - 4 * d, step = Math.max(1, Math.round(1.5 * d)), dt = (x1 - x0) > 0 ? plan.len / (x1 - x0) * step : 0.01;
      // bar lines: the first song's bars while it plays, then the next song's; phrase lines stronger, numbered from the start of the transition
      const barsOf = (P, dp) => { const out = []; if (!P.grid) return out; let prev = null; for (let x = x0; x <= x1; x += d) { const st = M.songTime(dp, Tt(x)); if (st == null) { prev = null; continue; } const bi = Math.floor((st - P.grid.bars[0]) / P.grid.bar + 1e-6); if (prev != null && bi !== prev) out.push({ x, bi }); prev = bi; } return out; };
      const ba = barsOf(Ps[0], plan.decks[0]), bb = barsOf(Ps[1], plan.decks[1]).filter(b => !ba.some(y => Math.abs(y.x - b.x) < 3 * d));
      const all = ba.map(b => ({ x: b.x, P: Ps[0], bi: b.bi })).concat(bb.map(b => ({ x: b.x, P: Ps[1], bi: b.bi }))).sort((p, q) => p.x - q.x);
      all.forEach((b, n) => {
        const t = b.P.grid.bars[0] + b.bi * b.P.grid.bar, ph = M.phraseAt ? M.phraseAt(b.P, t) : 0;
        g.fillStyle = ph >= 1 ? 'rgba(241,235,225,0.16)' : 'rgba(241,235,225,0.06)'; g.fillRect(b.x, geo.top - 6 * d, d, geo.bot - geo.top + 6 * d);
      });
      // the two decks, mirrored around the axis
      for (let k = 0; k < 2; k++) {
        const dp = plan.decks[k], W = bandsOf(Ps[k]), cols = deckCols(k), dir = k ? 1 : -1;
        for (let x = x0; x < x1; x += step) {
          const o = deckOut(dp, W, Tt(x), dt); if (!o) continue;
          for (let layer = 0; layer < 3; layer++) {
            const hh = o.a[layer] * half; if (hh < 0.3) continue;
            g.fillStyle = cols[layer];
            g.fillRect(x, k ? axis + 1 * d : axis - 1 * d - hh, step, hh);
          }
          g.globalAlpha = 1;
          // likely vocals that are actually audible: a light tick at the outer edge
          const P = Ps[k], b = Math.min(P.nB - 1, Math.max(0, Math.floor(o.st / BLOCK)));
          if (P.vocal && !P.mono && P.vocal[b] > 0.35 && o.a[1] > 0.02) { g.fillStyle = 'rgba(246,239,228,0.7)'; g.globalAlpha = Math.min(1, P.vocal[b] * o.g); g.fillRect(x, axis + dir * (half + 2 * d) - (k ? 0 : 2 * d), step, 2 * d); g.globalAlpha = 1; }
        }
        // fader line
        g.strokeStyle = 'rgba(241,235,225,0.4)'; g.lineWidth = 1.2 * d; g.beginPath(); let first = true;
        for (let x = x0; x <= x1; x += step) { const t = Tt(x); if (M.songTime(dp, t) == null && !(dp.echo.length && valAt(dp.echo, t, 0) > 0) && !(dp.verb.length && valAt(dp.verb, t, 0) > 0)) { first = true; continue; } const y = axis + dir * (4 * d + (half - 4 * d) * clamp(valAt(dp.gain, t, 1))); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
        g.stroke();
        // echo repeats, reverb tail, loops and reverse labels
        if (dp.echo.some(p => p[1] > 0)) { g.fillStyle = cols[1]; for (let t = 0; t < plan.len; t += dp.echoTime) { const s = valAt(dp.echo, t, 0); if (s <= 0 || M.songTime(dp, t) != null && valAt(dp.gain, t, 1) > 0.5) continue; for (let r = 0; r <= 5; r++) { const tt = t + r * dp.echoTime; if (tt > plan.len) break; const hh = half * 0.5 * s * Math.pow(0.5, r); g.globalAlpha = 0.8 * Math.pow(0.7, r); g.fillRect(X(tt) - d, k ? axis + d : axis - d - hh, 2 * d, hh); } } g.globalAlpha = 1; }
        // reverb tail: a soft fading band after the fader drops
        if (dp.verb.some(p => p[1] > 0)) {
          const on = dp.verb.filter(p => p[1] > 0), v0 = on[0][0], vOff = on[on.length - 1][0];
          g.fillStyle = cols[1]; g.globalAlpha = 0.25;
          for (let x = X(v0); x < Math.min(x1, X(vOff + dp.verbTime)); x += step) { const t = Tt(x), lvl = t <= vOff ? valAt(dp.verb, t, 0) : Math.exp(-(t - vOff) * 6.9 / dp.verbTime), hh = half * 0.35 * lvl; g.fillRect(x, k ? axis + d : axis - d - hh, step, hh); }
          g.globalAlpha = 1;
        }
        for (const lp of dp.loops) { const a = X(lp.at), b = X(lp.at + lp.dur), y = axis + dir * (half - 2 * d); g.strokeStyle = '#86d6a5'; g.lineWidth = 1.5 * d; g.beginPath(); g.moveTo(a, y - dir * 4 * d); g.lineTo(a, y); g.lineTo(b, y); g.lineTo(b, y - dir * 4 * d); g.stroke(); }
        g.font = `600 ${10 * d}px ${FONT.body}`; g.textBaseline = 'middle';
        for (const c of dp.clips) {
          const tag = c.rev ? 'Reverse' : null; if (!tag) continue;
          const xa = X(c.at) + 4 * d, w = g.measureText(tag).width + 10 * d; if (X(c.at + c.dur) - xa < w) continue;
          const y = axis + dir * (half * 0.55); g.fillStyle = 'rgba(18,16,23,0.82)'; roundRect(g, xa, y - 8 * d, w, 16 * d, 8 * d); g.fill(); g.fillStyle = INK.text; g.fillText(tag, xa + 5 * d, y);
        }
      }
      // the axis and the deck names
      g.fillStyle = 'rgba(241,235,225,0.22)'; g.fillRect(x0, axis - 0.5 * d, x1 - x0, d);
      // lane names in the left gutter; the time scale on the right
      const wide = geo.gut > 40 * d;
      g.font = `700 ${(wide ? 12 : 11) * d}px ${FONT.body}`; g.textBaseline = 'middle';
      g.fillStyle = TCOL[0]; g.fillText(wide ? 'Track 1' : '1', 4 * d, axis - half / 2);
      g.fillStyle = TCOL[1]; g.fillText(wide ? 'Track 2' : '2', 4 * d, axis + half / 2);
      const st0 = M.songTime(plan.decks[0], 0.01);
      g.font = `500 ${10 * d}px ${FONT.body}`; g.textBaseline = 'bottom'; g.fillStyle = INK.faint;
      g.fillText(`Starts ${st0 != null ? fmtTime(st0) + ' into Track 1' : 'in Track 1'}. ${Math.round(plan.len)} s preview.`, x0, geo.bot + 16 * d);
      if (x1 - x0 > 560 * d) { g.textAlign = 'right'; g.fillText('Bright lines mark phrases, faint lines bars', x1, geo.bot + 16 * d); g.textAlign = 'start'; }
      // moments to act, labels in two rows so neighbors don't collide
      const rows = [-1e9, -1e9];
      for (const m of plan.marks) {
        const x = X(m.t); g.strokeStyle = 'rgba(241,235,225,0.6)'; g.lineWidth = d; g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(x + 0.5, 26 * d); g.lineTo(x + 0.5, geo.bot); g.stroke(); g.setLineDash([]);
        g.font = `600 ${11 * d}px ${FONT.body}`; const w = g.measureText(m.text).width;
        let lx = Math.min(x1 - w, Math.max(x0, x - w / 2)); const row = lx > rows[0] + 8 * d ? 0 : 1; if (row === 1 && lx <= rows[1] + 8 * d) lx = rows[1] + 8 * d;
        rows[row] = lx + w; g.fillStyle = INK.text; g.textBaseline = 'top'; g.fillText(m.text, lx, row ? 14 * d : 0);
      }
      // where the drop lands: a marker on the axis
      if (idea.land != null) { const x = X(idea.land); g.fillStyle = INK.text; g.beginPath(); g.moveTo(x - 6 * d, axis - 9 * d); g.lineTo(x + 6 * d, axis - 9 * d); g.lineTo(x, axis); g.closePath(); g.fill(); }
      if (playT != null) { const x = X(playT); g.fillStyle = INK.live; g.fillRect(x - d, 24 * d, 2 * d, geo.bot - 24 * d); }
    }

    /* ---------------- the cross-similarity map ---------------- */
    let mapImg = null;
    function buildMap() {
      const R = result, XS = R.XS; $('mx-mappanel').hidden = false; mapCv = $('mx-map');
      const c = document.createElement('canvas'); c.width = XS.nA; c.height = XS.nB;
      const g = c.getContext('2d'), img = g.createImageData(XS.nA, XS.nB), u = new Uint32Array(img.data.buffer);
      const lo = XS.mean - 0.9 * XS.std, hi = XS.mean + 3.4 * XS.std, k = 255 / (hi - lo);
      for (let i = 0; i < XS.nA; i++) for (let j = 0; j < XS.nB; j++) { const v = XS.X[i * XS.nB + j]; u[j * XS.nA + i] = v < 0 ? SHAPE_LUT[0] : SHAPE_LUT[Math.round(clamp((v - lo) * k, 0, 255))]; }
      g.putImageData(img, 0, 0); mapImg = c; mapCv._dirty = true;
    }
    const mapGeom = (cv) => { const d = DPR(); return { x0: 64 * d, x1: cv.width - 8 * d, y0: 30 * d, y1: cv.height - 22 * d }; };
    function drawMap(playPair) {
      const cv = mapCv; if (!cv || !result || !mapImg) return; fit(cv);
      const g = cv.getContext('2d'), d = DPR(), W = cv.width, H = cv.height, R = result, geo = mapGeom(cv), { x0, x1, y0, y1 } = geo;
      g.clearRect(0, 0, W, H);
      const XA = (t) => x0 + (t / R.A.dur) * (x1 - x0), YB = (t) => y0 + (t / R.B.dur) * (y1 - y0);
      g.imageSmoothingEnabled = (x1 - x0) / mapImg.width < 3; g.drawImage(mapImg, x0, y0, x1 - x0, y1 - y0);
      // section ribbons
      for (const s of R.A.secs) { g.fillStyle = secColor(s.letter); g.fillRect(XA(s.t0) + d, y0 - 12 * d, Math.max(1, XA(s.t1) - XA(s.t0) - 2 * d), 8 * d); }
      for (const s of R.B.secs) { g.fillStyle = secColor(s.letter); g.fillRect(x0 - 12 * d, YB(s.t0) + d, 8 * d, Math.max(1, YB(s.t1) - YB(s.t0) - 2 * d)); }
      g.font = `600 ${10 * d}px ${FONT.mono}`; g.textBaseline = 'top'; g.fillStyle = TCOL[0]; g.fillText('Track 1 →', x0, 2 * d);
      g.save(); g.translate(14 * d, y0); g.rotate(Math.PI / 2); g.fillStyle = TCOL[1]; g.fillText('Track 2 →', 0, 0); g.restore();
      g.fillStyle = INK.faint; g.font = `${9.5 * d}px ${FONT.mono}`; g.textBaseline = 'top';
      g.fillText(fmtTime(0), x0, y1 + 5 * d); g.textAlign = 'right'; g.fillText(fmtTime(R.A.dur), x1, y1 + 5 * d); g.textAlign = 'start';
      g.textBaseline = 'bottom'; g.fillText(fmtTime(R.B.dur), 24 * d, y1);
      // wormholes as bright diagonals, ideas as numbered pins
      for (const x of visibleIdeas()) {
        if (x.map) { g.strokeStyle = 'rgba(255,241,207,0.9)'; g.lineWidth = 2 * d; g.beginPath(); g.moveTo(XA(x.map.i * BLOCK), YB(x.map.j * BLOCK)); g.lineTo(XA((x.map.i + x.map.K) * BLOCK), YB((x.map.j + x.map.K * (R.rB || 1)) * BLOCK)); g.stroke(); }
        const px = XA(x.cueA), py = YB(x.cueB);
        g.fillStyle = 'rgba(18,16,23,0.85)'; g.beginPath(); g.arc(px, py, 9 * d, 0, Math.PI * 2); g.fill();
        g.strokeStyle = INK.text; g.lineWidth = 1.5 * d; g.stroke();
        g.fillStyle = INK.text; g.font = `700 ${10 * d}px ${FONT.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(x.rank), px, py + 0.5 * d); g.textAlign = 'start';
      }
      const cross = (ta, tb, col) => { g.strokeStyle = col; g.lineWidth = d; g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(XA(ta), y0); g.lineTo(XA(ta), y1); g.moveTo(x0, YB(tb)); g.lineTo(x1, YB(tb)); g.stroke(); g.setLineDash([]); };
      if (mapHover) cross(mapHover.ta, mapHover.tb, 'rgba(241,235,225,0.5)');
      if (playPair) cross(playPair.ta, playPair.tb, 'rgba(255,93,82,0.8)');
    }
    function mapPoint(ev) {
      if (!result || !mapCv) return null; const r = mapCv.getBoundingClientRect(), d = DPR(), geo = mapGeom(mapCv);
      const x = (ev.clientX - r.left) * d, y = (ev.clientY - r.top) * d;
      if (x < geo.x0 || x > geo.x1 || y < geo.y0 || y > geo.y1) return null;
      const ta = (x - geo.x0) / (geo.x1 - geo.x0) * result.A.dur, tb = (y - geo.y0) / (geo.y1 - geo.y0) * result.B.dur;
      const i = Math.min(result.XS.nA - 1, Math.floor(ta / BLOCK)), j = Math.min(result.XS.nB - 1, Math.floor(tb / BLOCK)), v = result.XS.X[i * result.XS.nB + j];
      return { ta, tb, z: v < 0 ? null : (v - result.XS.mean) / result.XS.std };
    }
    $('mx-map').addEventListener('pointermove', (ev) => {
      mapHover = mapPoint(ev); mapCv._dirty = true;
      const el = $('mx-map-read');
      if (!mapHover) { el.textContent = 'Hover the map to compare moments.'; return; }
      const z = mapHover.z, word = z == null ? 'one side is silent' : z > 2.4 ? 'almost the same' : z > 1.4 ? 'very similar' : z > 0.5 ? 'somewhat alike' : z > -0.5 ? 'loosely related' : 'different';
      const sa = M.secAt(result.A, mapHover.ta), sb = M.secAt(result.B, mapHover.tb);
      el.innerHTML = `<b>Track 1 ${fmtTime(mapHover.ta)}</b> (${M.secShort(sa)}) and <b>Track 2 ${fmtTime(mapHover.tb)}</b> (${M.secShort(sb)}) · ${word} · click to hear both`;
    });
    $('mx-map').addEventListener('pointerleave', () => { mapHover = null; if (mapCv) mapCv._dirty = true; $('mx-map-read').textContent = 'Hover the map to compare moments.'; });
    $('mx-map').addEventListener('click', (ev) => { const p = mapPoint(ev); if (p) playPair(p.ta, p.tb); });

    /* ---------------- previews: rendering a plan ----------------
       v6 chain, per deck: trim → 3-band kill EQ (Linkwitz–Riley crossovers at 200 Hz and 2.5 kHz, like a club
       mixer's isolator) → high-pass → low-pass → fader, with a tempo-synced echo send. Both decks meet on a bus with
       3 dB of headroom and a brick-wall limiter instead of v5's heavy compressor (which pumped). Clips that
       continue the same audio are merged, so a deck is stretched once instead of restarting at every clip, and
       clips that butt against each other are crossfaded instead of being cut with 2 ms fades (which ticked). */
    function segment(deck, from, srcDur) {
      const sr = deck.sr, a = Math.round(from * sr), n = Math.max(2, Math.round(srcDur * sr)), L = new Float32Array(n), R = new Float32Array(n);
      const lo = Math.max(0, -a), hi = Math.min(n, deck.L.length - a);
      if (hi > lo) { L.set(deck.L.subarray(a + lo, a + hi), lo); R.set(deck.R.subarray(a + lo, a + hi), lo); }
      return [L, R];
    }
    function automate(param, pts, def, exp) {
      const P = pts.slice().sort((a, b) => a[0] - b[0]), fix = (v) => exp ? Math.max(10, v) : v;
      param.setValueAtTime(fix(P.length ? P[0][1] : def), 0);
      let last = 0;
      for (const [t0, v] of P) { const t = Math.max(0, t0); if (t <= last + 1e-4) param.setValueAtTime(fix(v), t); else exp ? param.exponentialRampToValueAtTime(fix(v), t) : param.linearRampToValueAtTime(v, t); last = t; }
    }
    // merge clips that simply continue the same audio at the same speed
    function mergedClips(dp) {
      const out = [];
      for (const c of dp.clips.slice().sort((x, y) => x.at - y.at)) {
        const p = out[out.length - 1];
        if (p && !p.rev && !c.rev && p.rate === p.rate1 && c.rate === c.rate1 && Math.abs(p.rate - c.rate) < 1e-6 && Math.abs(p.at + p.dur - c.at) < 0.002 && Math.abs(p.from + p.dur * p.rate - c.from) < 0.002) { p.dur += c.dur; continue; }
        out.push(Object.assign({}, c));
      }
      return out;
    }
    function isolator(oc, inp, dp) {
      const used = ['lo', 'mid', 'hi'].some(k => dp[k].some(p => p[1] < 0.999));
      const sum = oc.createGain();
      if (!used) { inp.connect(sum); return sum; }
      const bq = (type, f) => { const b = oc.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Math.SQRT1_2; return b; };
      const chain = (nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes; };
      const gLo = oc.createGain(), gMid = oc.createGain(), gHi = oc.createGain();
      chain([inp, bq('lowpass', 200), bq('lowpass', 200), gLo, sum]);
      chain([inp, bq('highpass', 200), bq('highpass', 200), bq('lowpass', 2500), bq('lowpass', 2500), gMid, sum]);
      chain([inp, bq('highpass', 2500), bq('highpass', 2500), gHi, sum]);
      automate(gLo.gain, dp.lo, 1); automate(gMid.gain, dp.mid, 1); automate(gHi.gain, dp.hi, 1);
      return sum;
    }
    async function renderPlan(plan) {
      const len = plan.len + 2, oc = new OfflineAudioContext(2, Math.ceil(len * SR_PREVIEW), SR_PREVIEW);
      const bus = oc.createGain(); bus.connect(oc.destination);
      for (let k = 0; k < 2; k++) {
        const dp = plan.decks[k], deck = decks[k];
        const inp = oc.createGain(); inp.gain.value = Math.pow(10, (dp.trim || 0) / 20);
        const eq = isolator(oc, inp, dp);
        const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.8;
        const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
        const fader = oc.createGain();
        eq.connect(hp); hp.connect(lp); lp.connect(fader); fader.connect(bus);
        automate(hp.frequency, dp.hpf, 12, true); automate(lp.frequency, dp.lpf, 20000, true); automate(fader.gain, dp.gain, 1);
        if (dp.echo.some(p => p[1] > 0)) {
          // repeats darken and thin as they fade, the way a DJ mixer's echo sounds; the tail never muddies the low end
          const send = oc.createGain(), dl = oc.createDelay(2), fb = oc.createGain(), tone = oc.createBiquadFilter(), thin = oc.createBiquadFilter(), wet = oc.createGain();
          dl.delayTime.value = Math.min(1.9, dp.echoTime); fb.gain.value = 0.5; tone.type = 'lowpass'; tone.frequency.value = 4500; thin.type = 'highpass'; thin.frequency.value = 280; wet.gain.value = 0.8;
          lp.connect(send); send.connect(dl); dl.connect(tone); tone.connect(thin); thin.connect(fb); fb.connect(dl); thin.connect(wet); wet.connect(bus);
          automate(send.gain, dp.echo, 0);
        }
        if (dp.verb.some(p => p[1] > 0)) {
          // v7 wash-out: a convolution reverb with an impulse generated here (decaying stereo noise, darker as it fades),
          // so no impulse file is needed; fed before the fader like the echo, so the tail rings after the cut
          const send = oc.createGain(), conv = oc.createConvolver(), wet = oc.createGain(), thin = oc.createBiquadFilter();
          conv.normalize = true; conv.buffer = reverbImpulse(oc, dp.verbTime); thin.type = 'highpass'; thin.frequency.value = 200; wet.gain.value = 0.9;
          lp.connect(send); send.connect(thin); thin.connect(conv); conv.connect(wet); wet.connect(bus);
          automate(send.gain, dp.verb, 0);
        }
        const clips = mergedClips(dp);
        clips.forEach((c, ci) => {
          // crossfade into a clip that starts where this one ends; otherwise short raised-cosine fades
          const next = clips[ci + 1], prev = clips[ci - 1];
          const xf = (o) => clamp(Math.min(c.dur, o ? o.dur : c.dur) * 0.15, 0.004, 0.03);
          const joinNext = next && Math.abs(next.at - (c.at + c.dur)) < 0.002, joinPrev = prev && Math.abs(c.at - (prev.at + prev.dur)) < 0.002;
          const fin = joinPrev ? xf(prev) : 0.006, fout = joinNext ? xf(next) : 0.006;
          const padIn = joinPrev ? fin / 2 : 0, padOut = joinNext ? fout / 2 : 0.004;
          const at0 = Math.max(0, c.at - padIn), pIn = c.at - at0, dur = c.dur + pIn + padOut;
          const avgRate = (c.rate + c.rate1) / 2, srcDur = dur * avgRate + 0.01;
          let chs = c.rev ? segment(deck, c.from + pIn * c.rate - srcDur, srcDur).map(x => x.reverse()) : segment(deck, c.from - pIn * c.rate, srcDur), pr = 1;
          const ramp = Math.abs(c.rate1 - c.rate) > 1e-4;
          const shift = dp.keylock ? (dp.shift || 0) : 0;
          if (dp.keylock && !ramp && (Math.abs(c.rate - 1) > 0.002 || shift)) { pr = Math.pow(2, shift / 12); chs = M.timeStretch(chs, c.rate / pr, deck.sr); }
          const n = Math.max(2, chs[0].length), buf = oc.createBuffer(2, n, deck.sr);
          buf.copyToChannel(chs[0].subarray(0, n), 0); buf.copyToChannel(chs[1].subarray(0, n), 1);
          const src = oc.createBufferSource(); src.buffer = buf;
          if (dp.keylock && !ramp) src.playbackRate.value = pr;
          else { src.playbackRate.setValueAtTime(c.rate, at0); if (ramp) { src.playbackRate.setValueAtTime(c.rate, c.at); src.playbackRate.linearRampToValueAtTime(c.rate1, c.at + c.dur); } }
          const env = oc.createGain(), curve = (a, b) => { const m = 32, v = new Float32Array(m); for (let i = 0; i < m; i++) { const u = i / (m - 1); v[i] = Math.sin(Math.PI / 2 * (a ? u : 1 - u)); } return v; };
          const fi = Math.min(fin, dur * 0.45), fo = Math.min(fout, dur * 0.45);
          env.gain.value = 0; env.gain.setValueCurveAtTime(curve(true), at0, fi);
          env.gain.setValueCurveAtTime(curve(false), at0 + dur - fo, fo);
          src.connect(env); env.connect(inp); src.start(at0); src.stop(at0 + dur + 0.002);
        });
      }
      return limit(await oc.startRendering());
    }
    // stereo noise under an exponential decay (−60 dB at `rt` seconds), with a one-pole low-pass that closes as it
    // decays, so the tail darkens like a real room. Deterministic (seeded), so a preview always sounds the same.
    function reverbImpulse(oc, rt) {
      const sr = oc.sampleRate, n = Math.round(rt * sr), buf = oc.createBuffer(2, n, sr);
      let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
      for (let c = 0; c < 2; c++) {
        const x = buf.getChannelData(c); let y = 0;
        for (let i = 0; i < n; i++) { const t = i / sr, env = Math.exp(-6.9 * t / rt), a = 0.15 + 0.85 * Math.exp(-3 * t / rt); y += a * (rnd() - y); x[i] = y * env * (i < sr * 0.012 ? i / (sr * 0.012) : 1); }
      }
      return buf;
    }
    // A look-ahead peak limiter on the finished render (Web Audio's compressor adds automatic make-up gain, so
    // it can't be a transparent limiter): gain drops ahead of any peak above −0.5 dBFS and recovers over ~80 ms.
    function limit(buf, ceil = 0.944) {
      const sr = buf.sampleRate, n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), W = Math.round(0.004 * sr);
      const need = new Float32Array(n); let any = false;
      for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > ceil ? ceil / p : 1; if (need[i] < 1) any = true; }
      if (!any) return buf;
      // the lowest gain needed within ±W samples (running minimum), then a W-sample moving average: never above need
      const mn = new Float32Array(n), q = new Int32Array(n); let h = 0, t = 0, k = 0;
      for (let i = 0; i < n; i++) {
        for (; k < Math.min(n, i + W + 1); k++) { while (t > h && need[q[t - 1]] >= need[k]) t--; q[t++] = k; }
        while (q[h] < i - W) h++; mn[i] = need[q[h]];
      }
      const rel = 1 - Math.exp(-1 / (0.08 * sr)); let acc = 0, cur = 1;
      for (let j = 0; j < Math.min(n, W >> 1); j++) acc += mn[j] - 1;
      for (let i = 0; i < n; i++) {
        acc += mn[Math.min(n - 1, i + (W >> 1))] - (i - W + (W >> 1) >= 0 ? mn[i - W + (W >> 1)] : 1);
        const sm = Math.min(1, (acc + W) / W);   // moving average of mn over W samples (values outside count as 1)
        cur = Math.min(sm, cur + rel * (1 - cur));
        L[i] *= cur; R[i] *= cur;
      }
      return buf;
    }

    /* ---------------- previews: playing ---------------- */
    function startBuffer(buf, info, offset = 0) {
      const ctx = ensureCtx(); ctx.resume();
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
      offset = clamp(offset, 0, Math.max(0, buf.duration - 0.05)); src.start(0, offset);
      pv = Object.assign({ src, start: ctx.currentTime - offset }, info);
      src.onended = () => { if (pv && pv.src === src) { pv = null; syncButtons(); } };
      syncButtons();
    }
    function stopPreview() {
      if (!pv) return;
      const p = pv; pv = null;
      try { p.src.onended = null; p.src.stop(); } catch (e) { /* already stopped */ }
      syncButtons();
      if (stage) stage.cv._dirty = true;
      if (p.kind === 'deck' && decks[p.deck] && decks[p.deck].cv) decks[p.deck].cv._dirty = true;
      if (mapCv) mapCv._dirty = true;
    }
    function guard() {
      if (mode === 'listening') { notice('Stop listening first. Otherwise the preview would play into what Anatomy is analyzing.'); return false; }
      notice(null); return true;
    }
    async function togglePreview(idea, at) {
      if (pv && pv.id === idea.id && at == null) { stopPreview(); return; }
      if (!guard()) return;
      stopPreview(); stopPlay();
      let buf = rendered.get(idea.id);
      if (!buf) {
        if (stage && stage.idea === idea) { stage.btn.disabled = true; stage.btn.innerHTML = `${ICON_PLAY}<span>Rendering…</span>`; }
        try { buf = await renderPlan(idea.plan); }
        catch (err) { notice('Could not render this preview' + (err && err.message ? `: ${err.message}` : '.')); if (stage) { stage.btn.disabled = false; syncButtons(); } return; }
        rendered.set(idea.id, buf);
        if (rendered.size > 6) rendered.delete(rendered.keys().next().value);
        if (stage && stage.idea === idea) stage.btn.disabled = false;
      }
      if (!result || !result.ideas.includes(idea) || !stage || stage.idea !== idea) { syncButtons(); return; }   // the choice changed while rendering
      startBuffer(buf, { id: idea.id, kind: 'idea', idea, len: idea.plan.len }, at || 0);
    }
    function deckBuffer(i) {
      const d = decks[i]; if (d.abuf) return d.abuf;
      const ctx = ensureCtx(), b = ctx.createBuffer(2, d.L.length, d.sr); b.copyToChannel(d.L, 0); b.copyToChannel(d.R, 1); d.abuf = b; return b;
    }
    function toggleDeck(i, t) {
      if (pv && pv.kind === 'deck' && pv.deck === i && Math.abs((ensureCtx().currentTime - pv.start) - t) < 0.3) { stopPreview(); return; }
      if (!guard()) return;
      stopPreview(); stopPlay();
      startBuffer(deckBuffer(i), { id: 'deck' + i, kind: 'deck', deck: i }, t);
    }
    function playPair(ta, tb) {
      if (!guard()) return;
      stopPreview(); stopPlay();
      const ctx = ensureCtx(), sr = SR_PREVIEW, seg = 4, gap = 0.35, n = Math.ceil((2 * seg + gap) * sr), buf = ctx.createBuffer(2, n, sr);
      const put = (k, t0, off) => { const d = decks[k], rs = d.sr / sr; for (let c = 0; c < 2; c++) { const src = c ? d.R : d.L, out = buf.getChannelData(c); for (let s = 0; s < seg * sr; s++) { const x = Math.floor((t0 * sr + s) * rs); const f = Math.min(1, s / 400, (seg * sr - s) / 400); out[off + s] = x >= 0 && x < src.length ? src[x] * f : 0; } } };
      put(0, ta, 0); put(1, tb, Math.round((seg + gap) * sr));
      startBuffer(buf, { id: 'pair', kind: 'pair', ta, tb });
    }
    function syncButtons() {
      if (stage && !stage.btn.disabled) { const on = !!(pv && pv.id === stage.idea.id); stage.btn.innerHTML = on ? `${ICON_STOP}<span>Stop</span>` : `${ICON_PLAY}<span>Play preview</span>`; stage.btn.setAttribute('aria-pressed', on ? 'true' : 'false'); stage.cv._dirty = true; }
      document.querySelectorAll('#mx-list .pick').forEach(b => b.classList.toggle('playing', !!(pv && pv.id === b.dataset.id)));
    }

    /* ---------------- per-frame drawing ---------------- */
    function frame() {
      const t = pv ? ensureCtx().currentTime - pv.start : null;
      for (const i of [0, 1]) { const d = decks[i]; if (!d || !d.cv) continue; const live = pv && pv.kind === 'deck' && pv.deck === i; if (live || d.cv._dirty || fit(d.cv)) { drawDeckWave(i, live ? t : null); d.cv._dirty = !!live; } }
      if (stage && stage.cv.clientWidth) { const live = pv && pv.id === stage.idea.id; if (live || stage.cv._dirty || fit(stage.cv)) { drawIdea(stage.cv, stage.idea, live ? t : null); stage.cv._dirty = !!live; } }
      if (mapCv && result && mapCv.clientWidth) { const live = pv && pv.kind === 'pair'; if (live || mapCv._dirty || fit(mapCv)) { drawMap(live ? pv : null); mapCv._dirty = !!live; } }
      document.querySelectorAll('.fit-key canvas').forEach(cv => { if (cv._draw && (fit(cv) || !cv._drawn)) { cv._draw(); cv._drawn = true; } });
    }

    /* ---------------- wiring ---------------- */
    $('mx-file').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) loadFile(fileTarget, f); });
    for (const i of [0, 1]) {
      const el = $('deck-' + i);
      el.addEventListener('dragover', (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); el.classList.add('drag'); } });
      el.addEventListener('dragleave', (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove('drag'); });
      el.addEventListener('drop', (ev) => { ev.preventDefault(); el.classList.remove('drag'); const f = ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) loadFile(i, f); });
    }
    $('mx-demo').addEventListener('click', () => { loadDemo(0, 0); loadDemo(1, 1); });
    $('mx-swap').addEventListener('click', () => { const t = decks[0]; decks[0] = decks[1]; decks[1] = t; onDecksChanged(); });
    const levels = [...document.querySelectorAll('#mx-levels .mx-level')];
    const setLevel = (L) => { level = L; try { localStorage.setItem('anatomy.mix.level', String(L)); } catch (e) { /* not saved: fine */ } stopPreview(); if (result) renderIdeas(); };
    levels.forEach(b => b.addEventListener('click', () => setLevel(+b.dataset.level)));
    $('mx-levels').addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault(); ev.stopPropagation();
      const L = clamp(level + (ev.key === 'ArrowRight' ? 1 : -1), 1, 3); setLevel(L); levels[L - 1].focus();
    });
    renderDeck(0); renderDeck(1);
    stopMixAudio = stopPreview;
    function onShow() { for (const i of [0, 1]) if (!decks[i]) renderDeck(i); if (stage) stage.cv._dirty = true; if (mapCv) mapCv._dirty = true; for (const i of [0, 1]) if (decks[i] && decks[i].cv) decks[i].cv._dirty = true; }
    if (/[?&]debug\b/.test(location.search)) window.__mx = { decks, get result() { return result; }, renderPlan, loadDemo, setLevel };
    return { frame, onShow, stop: stopPreview };
  })();


  /* ---------------- pages: Visuals (main), Analysis and Mix ---------------- */
  const PAGES = ['visuals', 'analysis', 'mix'];
  const pageFromHash = () => { const k = location.hash.slice(1); return PAGES.includes(k) ? k : 'visuals'; };
  function setPage(p, quiet) {
    page = PAGES.includes(p) ? p : 'visuals';
    for (const k of PAGES) {
      $('page-' + k).hidden = page !== k;
      const b = $('tab-' + k); b.setAttribute('aria-selected', page === k ? 'true' : 'false'); b.tabIndex = page === k ? 0 : -1;
    }
    if (page === 'analysis') { spec.drawnEnd = -1; momentsDirty = true; $('spec-axis').dataset.done = ''; cardsAt = 0; }
    else if (page === 'visuals') VZ.onShow();
    else MX.onShow();
    if (!quiet) { try { history.replaceState(null, '', page === 'visuals' ? location.pathname + location.search : '#' + page); } catch (e) { } }
  }
  for (const k of PAGES) $('tab-' + k).addEventListener('click', () => setPage(k));
  $('tabs').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault(); const next = PAGES[(PAGES.indexOf(page) + (ev.key === 'ArrowRight' ? 1 : PAGES.length - 1)) % PAGES.length]; setPage(next); $('tab-' + next).focus();
  });
  window.addEventListener('hashchange', () => setPage(pageFromHash(), true));
  (() => {
    const hdr = document.querySelector('.top');
    const setH = () => document.documentElement.style.setProperty('--hdr', Math.round(hdr.getBoundingClientRect().height) + 'px');
    if (window.ResizeObserver) new ResizeObserver(setH).observe(hdr); setH();
  })();
  setPage(pageFromHash(), true);

  /* ---------------- main loop ---------------- */
  let lastBlocks = -1;
  function loop(now) {
    requestAnimationFrame(loop);
    const onVis = page === 'visuals', onMix = page === 'mix';
    if (onMix) MX.frame(now);
    if (!engine) {
      drawLogo();
      if (onVis) VZ.frame(null, now); else if (!onMix) { drawSpecAxis(); drawShape({ mode: 'summary' }); drawLanes({ mode: 'summary' }); }
      return;
    }
    const vt = mode === 'stopped' ? viewTime() : null;
    const view = mode === 'listening' ? { mode: 'live' } : vt != null ? { mode: 'replay', t: vt } : { mode: mode === 'example' ? 'live' : 'summary' };
    if (engine.nB !== lastBlocks || shapeDirty) { rebuildShape(); lastBlocks = engine.nB; shapeDirty = false; }
    if (onVis) VZ.frame(view, now);
    else if (!onMix) {
      drawShape(view); drawLanes(view); drawSpec(view); drawSpecAxis(); drawBeat(view, now);
      updateCards(view, now);
      if (momentsDirty) renderMoments();
    }
    drawLogo();
    if (summaryDirty && mode === 'stopped') renderSummary();
    if (mode === 'listening' || mode === 'example') $('clock').textContent = fmtTime(engine.time);
    else if (view.mode === 'replay') $('clock').textContent = `▶ ${fmtTime(view.t)}`;
    else $('clock').textContent = fmtTime(engine.time);
    lastViewT = view.mode === 'replay' ? view.t : null;
  }
  clearSummary();
  requestAnimationFrame(loop);
  runExample();
})();

