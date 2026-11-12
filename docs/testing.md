# Testing

Five layers, from fastest to slowest. Run the first one before every commit that touches `web/`, and the harness
before and after every change to `web/js/mix.js` (the baseline must first reproduce the latest results doc).

| Command | What it proves | Needs |
|---|---|---|
| `npm test` | `web/` still inlines into one file; server routes; engine + mixer regression on the demo songs | Node ≥ 20.12 |
| `npm run test:songs` | Tempo, key and drops for every song in the manifest, against published values | ffmpeg, the songs |
| `npm run test:ear` | `findDrops` against Matt's by-ear drop marks (`ear` in the manifest): hits, misses, false drops, timing in beats, which rule failed | same |
| `npm run test:pairs` | Every suggested idea on the 10 test pairs (both directions), rendered and measured | Playwright Chromium, the songs |
| `node tests/measure/run.mjs --reference` | The pairs v7 was verified on (Kelly→Bieber, John→Bieber, Kelly→Drake, demo) | same |

## Where the songs come from
`tests/songs.manifest.json` lists every test song by id, with its filename, the published BPM/key/length, notes on the
version received, the 10 test pairs and the v7 reference pairs. It replaced the v7 harness's short-name map and its
hardcoded `/home/claude/...` paths. The folder is resolved in this order: `$ANATOMY_SONGS`, then
`tests/songs.local.json` (`{"dir": "~/Downloads"}`, gitignored), then `~/Downloads`. No audio is ever committed:
`.gitignore` blocks mp3, wav, aiff, flac, m4a, ogg, opus and webm.

## 1. The byte-identity check (retired 2026-10-09)
web/ began as anatomy7.html cut along its existing block boundaries, and `tools/build-single.mjs --check` proved that
inlining the stylesheet and the four scripts gave back sha256 `4081c8c190069791cdb411955dc36d12738086abe2dec412c0900b97c542b14b`
(anatomy7.html, 460,115 bytes). It retired with the first intentional web/ change (the Fake-out fix). **It last passed at
`e5a8f9d`** (platform-scaffold) and on `102dc8f` (ear-vs-detector, which doesn't touch web/). The regression checks and
the harness baselines (`04-results-*`) replace it. `npm test` still runs the inliner, so the single-file build keeps working.

## 2. Regression (`tests/regression.mjs`)
The v7 checks on the two synthesized demo songs, which have known answers: tempo, beat grid error (< 1 ms), section
boundaries, drops at 62.95 s (Demo 1) and 38.10 / 76.19 s (Demo 2), then the demo pair: ease ok, neighbor keys, sung
0.02 / 0.41, 8 / 8 / 4 ideas with 6 sound-check rows each, and compatibility 93.

Node analyzes exactly like the Mix tab's `pump()` (`tests/lib/anatomy.mjs`): an Engine at the file's rate with
`pitchEvery: 6`, 4096-sample chunks, `finalize()`, then `AnatomyMix.profile` with the audio attached, capped at 600 s.

## 3. Song profiles (`tests/profile-songs.mjs`)
Decodes with ffmpeg at 44.1 kHz (the page uses the browser's decoder; Node results can differ by resampling
details). Output: `tests/out/profiles.json` and `profiles.md`. Key comparison: match / relative (same notes) / parallel
/ neighbor (one step on the Camelot wheel) / different. Tempo: match, or at half/double/3:2 time. **Gap-only entries**
(the engine's silence-before-impact moments with no bass return: confidence 0.30, impact 0) are counted apart from
drops and hits, because on house tracks they fire at most 8-bar phrase ends.

## 3b. Drops vs. ear marks (`tests/drops-vs-ear.mjs`)
Each song's `ear` field in the manifest is a list of `m:ss` times where Matt hears a drop (`[]` = listened, no drop;
no field = not marked yet). The script analyzes each song in Node like `test:songs` does and caches the drops and the
detector's bar measurements in `tests/out/drops/`. Then `--report` re-scores the cache instantly whenever the marks
change.

| Term | Meaning |
|---|---|
| Hit | a detected drop or hit within `--tol` beats (default 2: ear marks are to the second, about 2 beats) |
| Misplaced | `--tol` to `--near` beats away (default 8): the right moment, but the wrong bar or a bad grid |
| Miss | an ear mark with nothing within `--near` beats. The report shows each rule's numbers at the nearest bars and says which threshold blocked it, or that a rule fired and lost to a stronger drop |
| False | a detection with no ear mark within `--near` beats, with the rule that fired and its confidence |
| Gap-only | counted apart: how many sit on an ear mark, how many on a mark no real drop caught, how many on nothing |

Timing error is detector minus ear, in beats (+ = the detector is late). The bar measurements come from
`tests/lib/drop-rules.mjs`, a mirror of `findDrops()` that keeps every candidate, because `findDrops()` only returns
the winners (tech debt #41). The mirror checks itself: a song is skipped, and the run fails, unless its winners are
exactly the app's drops.

## 4. The preview harness (`tests/measure/`)
`run.mjs` starts `server/`, opens the page in headless Chromium with `?debug`, loads both songs through the real file
chooser (so the browser decodes and analyzes them), then for every suggested idea calls `meas_page.js`. That script
renders the preview **mixed and with each deck solo** through the page's own `renderPlan` and measures:

| Measure | How |
|---|---|
| Beat phase (ms) | Each solo's onset envelope folded onto Track 2's 16th-note grid over the overlap (an 8th-note grid let 16th hats cancel the fit); circular-mean offset. Blind to whole-16th slips; only when both are rhythmic enough to tell. |
| Two basslines (s) | Both solos' lows (< 120 Hz) within 6 dB of their own full level |
| Both at full level (s) | Both solos within 3 dB of their own full level |
| Two singers (s) | Both profiles' vocal curves > 0.35 at each deck's song time, and both audible in the vocal band |
| Hard cuts / cuts under effects | A clip ends while the singer keeps going: a hard cut if the vocal band falls > 12 dB within 0.3 s, otherwise it's under an echo or reverb tail. **This separates the two cases tech debt 26 complained about.** |
| Mid-line entries | A clip starts while its singer is mid-line |
| Dead air (s) | Longest run > 20 dB under the mix's median |
| Loudness step (LU) | Integrated loudness of the last 8 s minus the first 8 s |
| Peak (dBFS) | After the page's limiter |
| Bass jump at the landing (dB) | Mix lows in the bar after the planned landing minus the bar before |
| Bass jump on arrival (dB) | The same, where Track 2's bass actually reaches full level |

**The score (0–100) is a new rule**, written for the repo on 2026-10-08 because the v7 session's `meas_page.js` wasn't
available. Penalties: beat phase over 10 ms (1.5/ms, max 40), 8/s of two basslines, 10/s of two singers, 12 per hard
cut, 4 per mid-line entry, 30/s of dead air over 0.5 s, 5/LU landing more than 1 LU quieter or rising more than 6 LU,
10 for a peak over −0.3 dBFS, 3/s of both songs at full level beyond 4 s, and 3/dB when the drop adds less than 3 dB of
bass. Scores are comparable with each other, **not one-for-one with the v7 table**.

The harness opens `?debug#mix` straight away. (Until 2026-10-09 it opened on Visuals, which draws WebGL in software
headless at about one full CPU, and patched `requestAnimationFrame` to cope; the Visuals animation only runs while its
page shows, so neither is needed. Removing both changed no idea, cue or score.) Two pages run in parallel (`--jobs 2`)
on the 2-core cloud workspace; under extra load a deck button click can time out after 30 s (one direction per run on
2026-10-09). Re-run that direction on its own (`node tests/measure/run.mjs a:b`); results are deterministic to about
1e-5 dB, so a re-run is comparable.

**Run one harness at a time, with nothing heavy beside it** (2026-10-20): a full run is about 14–18 minutes with
`--jobs 2`. With a Node song analysis running alongside, the workspace restarted once (a process killed, exit 137,
most likely memory). One at a time, 4 full runs had no timeouts. A full run's `tests/out/pairs/` is the before/after
record, so copy it somewhere outside `tests/out/` before the next run overwrites it. When testing several stacked
branches, give each its own `git worktree` (with the `playwright` symlinks and `tests/songs.local.json`), because the
harness serves `web/` live from the checkout it runs in: editing that checkout mid-run changes the code later pairs load.

Output: `tests/out/pairs/<a>__<b>.json` (everything, per idea) and `tests/out/pairs.md` (the summary table).
