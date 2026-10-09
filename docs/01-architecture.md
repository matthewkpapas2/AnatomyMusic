# Anatomy: architecture (v7 code in the v8 repo layout)

_Last updated: 2026-10-09. The app code is v7 plus the first v8 changes (Fake-out, landings; `docs/02`). Line numbers
refer to the files in `web/` and drift with each change._

## Repo layout
| Path | What | Notes |
|---|---|---|
| `web/index.html` | The page shell (281 lines) | v7 lines 1–10 and 557–820, a `<link>` to `styles.css`, four classic `<script src>` tags in v7 order. Opening it from a file still works. |
| `web/styles.css` | All styles (544 lines) | v7's `<style>` block, lines 12–555 |
| `web/js/engine.js` | **AnatomyEngine** (892 lines) | v7 script 1. Pure JS, no DOM, Node-exportable. Unchanged since v3. |
| `web/js/demo.js` | **AnatomyDemo** (178 lines) | v7 script 2. Synth songs with known answers. Unchanged since v5. |
| `web/js/mix.js` | **AnatomyMix** (1,699 lines) | v7 script 3. Pure JS, no DOM, Node-exportable. |
| `web/js/app.js` | **App** (2,495 lines) | v7 script 4: audio I/O, Analysis drawing, `VZ` visuals, the `MX` Mix UI and preview renderer, tabs, main loop. |
| `server/index.mjs` | Local server | Node ≥ 20.12, no dependencies, 127.0.0.1 only. Serves `web/`; `GET /api/health`; `POST /api/creative` is a stub (501) for the future Claude call. Reads a gitignored `.env` (`ANTHROPIC_API_KEY`, `PORT`). |
| `data/` | Dataset pipeline | `download/get_subset.py` (run on the Mac), `pipeline/status.py`, `README.md` with the stage plan. `raw/`, `work/` and `out/` are gitignored. |
| `tests/` | Test suite | `regression.mjs`, `profile-songs.mjs`, `drops-vs-ear.mjs` (+ `lib/drop-rules.mjs`), `measure/` (preview harness), `unit/` (server), `lib/`, `songs.manifest.json`. See `docs/testing.md`. |
| `tools/build-single.mjs` | Inlines `web/` into one HTML file | `npm test` runs it so the single-file build keeps working. The byte-identity `--check` retired on 2026-10-09 |

The four scripts still share one global scope: each is a classic script with a top-level `const` (`AnatomyEngine`,
`AnatomyDemo`, `AnatomyMix`, then the App IIFE), so later scripts see earlier ones by name. They are **not** `window`
properties. Each of the first three ends with `if (typeof module !== 'undefined') module.exports = …`, which is how Node
loads them. **That's why `package.json` must not say `"type": "module"`**: it would make Node treat `web/js/*.js` as ES
modules and break `module.exports`. Repo-side code that isn't browser code uses `.mjs`.

## `styles.css`
Dark theme tokens on `:root` (ground `#121017`, amber `#f3a451`, `--t1` `#f3a451` / `--t2` `#6fd0b8`). The header
layout is redefined late (tech debt #2). The Mix CSS starts at "mix tab (v6)" (~line 338). v7 additions: the
`.mx-compat` card and `.stage-special`; `.check` is a 3×2 grid (2 columns ≤ 1080 px, 1 column ≤ 720 px). Verdict tokens:
`--pass`, `--close`, `--fail`.

## `index.html`
Header, `#page-visuals`, `#page-analysis`, `#page-mix`: intro, `#mx-compat` (filled when both decks are ready),
`.mx-console` (deck 1 / fit strip / deck 2), `#mx-ideas` (level switch, list, `#mx-stage`), glossary, map, "How the Mix
tab decides". The file input is `#mx-file` (hidden; the deck buttons click it).

## Mix brain (`AnatomyMix`, `web/js/mix.js`)
**`profile(engine, meta)`** (`meta.audio` = `{ L, R, sr }` is required for a grid). In order:
1. Engine block features.
2. `audioFeatures`: kick, mid and snare band onsets, band energies, chroma, LUFS.
3. `fitGrid`.
4. `vocalMap` (`P.vocF = { v, hop }`, a ~23 ms curve; `P.sung` is the share of the song it calls sung).
5. Sections: `refineSections`.
6. Home key (`P.home`: 0–11 major, 12–23 minor), builds, and the engine's drop moments.
7. Drops (v7): `P.gaps` holds the engine's silence-before-impact moments, and `P.drops = findDrops(P)` with gaps attached.
   - Each drop is `{ t, k, kind: 'drop'|'hit'|'gap', impact, j1, j4, build0, buildBars, built, riser, roll, sustainBars, phrase, vox, conf, gap }`.
   - Bass-return rule: the kick-band level and kick onsets per bar; full = +9 dB over 4 bars, hit = +6 dB after a one-bar stop.
   - Riser rule: the highs +8 dB over 4 bars, then −4 dB, while the low end and mids get fuller.
   - A bass return that leads into a riser drop counts as the build's start. At most one drop per 8 bars.
   - Confident drops move a section start within 2.2 bars onto themselves, and `P.phrase.starts` is rebuilt.
   - **Gap-only entries** (`kind: 'gap'`) carry `conf` 0.30 and `impact` 0. On house tracks they fire at 8-bar phrase
     ends (Animals: 8 of them, every 15.0 s). Since 2026-10-09 `landings()` skips them (#31); they still show as small
     marks on the waveforms, the Silence switch still uses Track 1's, and `launches()` still treats them as builds (#42).

**`match(A, B)`:** tempo relation, key and best shift, `XS`, LUFS trim; then 22 generators, each through `finish()`
(sound check, payoff, score). The sound floor (`floorOf(L)` = 0.70 / 0.725 / 0.75) plus a one-voice minimum (0.45 at
Intermediate, 0.6 at Advanced); failures go to `skipped` with their best score and weakest row. `byLevel` keeps at most
2 per technique (−0.08 per repeat). `compat = compatibility(C, all)` → `{ v, word, parts: [tempo, key, drops, loud, vocals, best] }`.
Returns `{ A, B, T, K, trim, XS, warnGrid, ideas, byLevel, skipped, rB, compat }`.

**Landings and launches (v7):**
- `landings(C)`: Track 2's drops and hits (confidence ≥ 0.3) in its first 72% with ≥ 10 bars left. If none of them is
  confident (≥ 0.6), chorus or peak section starts are added (not before 0.5 s). `early` marks the first one or any before 35%.
- `launches(C, minFrac)`: Track 1's drops with a build (`kind: 'build'`, tension 1) and its phrase lines (`kind: 'phrase'`, tension 0.5), each with `line` (`lineEnds`).
- Helpers: `landed`, `rate`, `best2`, `intoDrop`, `bassOut`, `dropBlend`, `landB` (as documented for v7). v8: `midHi(P, t0, t1)`
  (mids + highs power against the song's median), `hushBeats` (silent beats right before a time) and `soundingBars`
  (the longest lead-in without a near-silent beat), used by Fake-out.

**Generators (`TECH` keys):** Level 1 `blend`, `riser`, `cut`, `echo`, `brake`. Level 2 `swap`, `double`, `roll`, `spin`,
`wash`, `lift`, `layer`, `chord`, `halftime`, `accel`. Level 3 `fakeout`, `escalator`, `hijack`, `wormhole`, `modulate`,
`keylock`, `ride`, `trade`.

**`soundCheck(C, x)`:** walks the plan at 10 Hz. Rows: rhythm .27, phrase .15, voice .25, key .12, flow .13, clean .08;
`total = .75·weighted + .25·worst`. Returns `before`/`after`, `hole`, `dead`, `contrast`. `planLevels()` is the band-power
model behind Flow. Payoff = `0.4·landing value + 0.25·tension + 0.35·contrast/12`; score = `0.55·check + 0.45·payoff`.

**Exports:** `profile, fitGrid, match, vocalMap, keyRelation, camelot, sharedNotes, transposeKey, diatonic, roman,
chordNotes, timeStretch, songTime, TECH, LEVEL_NAME, SOUND_FLOOR, floorOf, secName, secShort, where, barNo, firstBar,
secAt, energy, chordAt, phraseAt, audioFeatures, kWeightedLufs, envVal`, plus `_internal` (`nearestIn, tempoRelation,
crossSim, landings, launches, soundCheck, finish, gens()`).

## App (`web/js/app.js`), Mix (`MX`)
- File decks: `loadFile` → `decodeAudioData` (the AudioContext's rate) → `pump()`: an Engine with `pitchEvery: 6`, fed
  4096-sample chunks in 22 ms slices on `setTimeout`, then `profile`. `MAX_SEC` = 600: longer files are analyzed for
  their first 10 minutes only (Strobe, 10:37, hits this).
- `renderCompat()`, `drawDeckWave` (drop triangles), `renderStage` (`.stage-special`, the 6-row check), `drawIdea` (▼ at `idea.land`).
- Previews (`renderPlan(plan)` → `AudioBuffer` at 44.1 kHz): per deck trim → isolator → HPF → LPF → fader; echo and
  reverb sends tap before the fader; the reverb impulse is generated (`reverbImpulse`); then the JS look-ahead limiter at −0.5 dBFS.
- Debug: `?debug` exposes `window.__mx = { decks, result, renderPlan, loadDemo, setLevel }`. The harness uses it.
- One `requestAnimationFrame` loop drives everything; it calls `VZ.frame` only while Visuals is showing (measured
  2026-10-09, headless: Visuals ~103% CPU in software WebGL, Mix 4–8%, Analysis 43%). Browsers pause it in background tabs.

## Test tooling
All in `tests/` (`docs/testing.md`). The v7 session's work-folder tools (`run.js`, `meas_page.js`, `prof.js`, `v7test.js`,
`why.js`, `drops_list.js`, `ui_smoke.js`, `shots.js`, `build.py`/`extract.sh`) weren't available on 2026-10-08. **They
turned up on 2026-10-09** in `~/Downloads/anatomy-v7-workspace.tar.gz`, but are not ported (a decision for Matt). What exists now:

| v7 tool | Repo replacement |
|---|---|
| `build.py` / `extract.sh` | `tools/build-single.mjs` (inline). The split itself was one-off. |
| regression scripts | `tests/regression.mjs` |
| `prof.js`, `drops_list.js` | `tests/profile-songs.mjs`; `tests/drops-vs-ear.mjs` for drops against Matt's ear marks |
| `run.js` + `meas_page.js` | `tests/measure/run.mjs` + `meas_page.js`, **rebuilt with a new, documented score rule** |
| `why.js` | not rebuilt (the harness JSON keeps every skipped idea and its reason) |
| `ui_smoke.js`, `shots.js` | not rebuilt yet (tech debt #33) |
| `lyr.js` (parked lyrics) | not in the repo; lyrics stay parked |
