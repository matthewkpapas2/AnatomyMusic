# Anatomy: status, version log and roadmap

_Last updated: 2026-10-08 (v8 platform scaffold, code still v7). Update this file after every meaningful change. The full v7-era version of this file (with the v6→v7 measurement table) is kept in `history/02-status-2026-10-05.md`._

## Current version
**Code: v7** (anatomy7.html, 2026-10-05), now living in the repo **`matthewkpapas2/AnatomyMusic`** as `web/`
(byte-identical when inlined). **Layout: v8 platform scaffold** (2026-10-08): repo, local server, data-pipeline
skeleton, test suite, docs. `anatomy7.html` and all older copies in `~/Downloads` are unchanged and stay as they are.

## Version log
| Version | Saved (ET) | What changed |
|---|---|---|
| v1 `anatomy.html` | 2026-09-24 2:05 PM | Analysis-only page: Shape triangle, lanes, spectrogram, Pulse/Harmony/Character/Balance cards, **Single-pitch tuner card**, Moments (incl. "Held note" moments), Summary + Song DNA card. |
| v2 `anatomy2.html` | 2026-09-24 2:23 PM | Removed the Single-pitch tuner card and the "Held note" moment type. YIN pitch is kept internally for talk detection. |
| (export) | 2026-09-24 2:28 PM | `anatomy-tab-2026-09-24-18-24.png`: a Song DNA card from a browser-tab session. |
| v3 `anatomy3.html` | 2026-09-24 2:58 PM | Added the **Visuals** page as the default view. The original UI moved to an **Analysis** tab. |
| v4 `anatomy4.html` | 2026-09-30 ~1:40 AM | Added the **Mix** tab (Beginner / Intermediate / Advanced ideas; suggestions, not an auto-mixer). New 3rd script block `AnatomyMix`. A second demo song. |
| v5 `anatomy5.html` | 2026-09-30 ~2:45 AM | A likely-vocals detector, a rough in-browser stem split, and vocal/speed ideas. |
| v6 `anatomy6.html` | 2026-09-30 ~5:40 PM | Research-driven Mix rebuild: a beat grid from band onsets, phrase lines, vocal awareness, a 3-band kill EQ, the sound check, and the redesigned UI. |
| v7 `anatomy7.html` | 2026-10-05 ~2:25 PM | **Drop-first rebuild** (see the v7 section). The engine and demo scripts are byte-identical to v6. |
| **v8 scaffold** (repo, branch `platform-scaffold`) | 2026-10-08 | **No app-code change.** v7 split into `web/` (proven byte-identical), `server/` (local server, Claude API stub), `data/` (download script + stage plan), `tests/` (regression, song profiles, rebuilt preview harness, manifest), `docs/`. First full measurement of the 20-song test set and the 10 test pairs both ways (`04-results-2026-10-08.md`). |

## v8 scaffold (2026-10-08): what was done and why
**Matt's brief:** scaffold the repo (web / server / data / tests / docs), prove web/ behaves like anatomy7.html, run
the drop detector and profiler on every test song, run the harness on the 10 test pairs, update the docs.

**What happened:**
- **The workspace tarball (`anatomy-v7-workspace.tar.gz`) was never attached** and wasn't on the Mac, so the v7
  session's harness files weren't available. web/ was split from `~/Downloads/anatomy7.html` itself, and the tests were
  **rebuilt** from what these docs describe. The preview harness has a **new score rule**, so its numbers aren't
  one-for-one comparable with the v7 table.
- **Proof of "same behavior":** byte identity (inlining web/ reproduces anatomy7.html's sha256), the demo regression
  (15/15), compatibility on the v7 reference pairs (87 / 89 / 73 / 93, identical to v7), the v7 songs' drops, and a
  `file://` load with 0 page errors.
- **GitHub:** linking needed two steps on Matt's side: connect GitHub in Claude's settings, then install the Claude
  GitHub App on the repo. `main` holds only a README stub; the scaffold is a PR from `platform-scaffold`.
- **Harness bugs found and fixed while running it:** beat phase never measured (8th-note grid cancelled by 16th
  hats); Marea's curly apostrophe made Playwright's file chooser hang silently; failed pairs leaked pages; the Visuals
  WebGL loop cost half a CPU behind the Mix tab (throttled in the harness only).

## v7: what changed and why
**Diagnosis (measured on the v6 baseline).** Every preview was rendered headlessly, mixed and with each deck solo, for Kelly→Bieber, John→Bieber, Kelly→Drake and the demo pair:
1. **The in-browser stem split was the root cause of "higher levels sound worse".** The "no vocals" stem lowered the singer by only 4–6 dB; the "vocals only" stem was a full mix minus bass. Acapella mash-in and Vocal carry-over stacked two singers (0–37 out of 100, 4–14 s of vocal clash per preview). Intermediate averaged 74 (minimum 3) and Advanced 77 (minimum 10), against Beginner's 95.
2. **v6 couldn't see drops.** It relied on the engine's moments, so it found no drops in John Summit's house track, which has four. Most transitions landed Track 2 mid-section after long overlaps; the median bass jump when Track 2's bass arrived was 0.5 dB (the "clunky fade").
3. Trade phrases chopped singers mid-line, and only Borrowed drop and Drop hijack targeted a drop at all.

**Fixes (AnatomyMix):** `findDrops(P)` (bass return ≥ 9 dB over 4 bars, pop hit ≥ 6 dB after a one-bar stop, riser drop +8 / −4 dB), confident drops snap section boundaries within 2 bars; every idea built from a landing (Track 2's drop/hit, chorus fallback) and a launch (Track 1's build end or phrase line); 22 generators (Beginner: Blend into the drop, Filter riser, Cut to the drop, Echo into the drop, Tape stop; Intermediate: Drop swap, Double drop, Loop roll, Spinback, Wash-out, Key lift, Loop & layer, Shared-chord drop, Half-time drop, Speed ramp; Advanced: Fake-out drop, Build into build, Silence switch, Wormhole, Harmonic key change, Key-lock-off blend, Tempo ride, Trade phrases); Acapella mash-in, Vocal carry-over, Filter swap and the stem splitter removed; bass kill before the drop; pickups up to a bar; "cut mid-line" asks whether the singer keeps going (effect exits cost 30%); a 6-row sound check (rhythm .27, phrase .15, voice .25, key .12, flow .13, clean .08; `total = .75·weighted + .25·worst`); payoff `0.4·landing + 0.25·tension + 0.35·contrast/12`, score `0.55·check + 0.45·payoff`; floors 70 / 72 / 75 plus one-voice ≥ 0.45 / 0.6; compatibility (tempo .20, key .15, drops .18, loudness .05, vocals .07, best transition .35; Great ≥ 85, Good ≥ 70, Workable ≥ 55, Tough).

**App and UI:** the compatibility card, drop triangles on both waveforms, ▼ at the landing, a reverb tail band, the "Why it's special" line over the 6-part check, previews with a reverb send on a generated impulse; rewritten copy.

**v7 verified state (2026-10-05, v7 harness):** Beginner 97 (80), Intermediate 96 (74), Advanced 95 (83); per pair B/I/A: Kelly→Bieber 98/92/99, John→Bieber 97/95/92, Kelly→Drake 95/95/92, demo 98/100/96; compatibility 87 / 89 / 73 / 93; UI smoke test 0 page errors at 1400 and 390 px.

## Verified state (2026-10-08, repo test suite)
- **`npm test`:** byte identity OK; 5/5 server tests; 15/15 regression checks.
- **Song profiles (20 songs):** tempo matches 17 of 18 published values (Opus reads 126 vs 128, with a drifting grid),
  key matches 13 of 17 (plus one relative, two wheel-neighbors, one a semitone off: Rumble). Full table and the by-ear
  checklist in `03-test-songs.md`.
- **Harness, 10 test pairs × 2 directions, 286 ideas:** Beginner avg 96.1 (min 0), Intermediate 94.3 (min 69),
  Advanced 92.0 (min 20). 6 directions with thin Advanced, 3 where Advanced is clearly worse than Beginner. 0 page
  errors. Details and findings in `04-results-2026-10-08.md`.

## Known issues / tech debt
1. ~~No version control~~ **Resolved 2026-10-08:** the repo `matthewkpapas2/AnatomyMusic`.
2. **CSS layered overrides** in the header (from v3), now in `web/styles.css`.
3. **Analysis page dead space** under Spectrum.
4. **Detection lag in the engine.** The mixer corrects its own sections; the Analysis tab still shows the engine's.
5. `f0F`/`trackNote` naming is a v2 holdover.
6. **The mood estimate is crude.**
7. **File input only exists on the Mix tab.**
8. **Sessions and Mix decks are capped at 600 s.** Now it bites: Strobe (10:37) is analyzed only to 10:00.
9. **Engine timestamps are early/late.** Chords still use `CHORD_LAG`.
10. **Mix analysis runs on the main thread.**
11. **Section roles and local keys are heuristics.**
12. **Previews are approximations** (WSOLA key lock; tempo ride and speed ramp run without key lock).
13. **4 scripts sharing one global scope.** Now 4 files instead of 4 blocks, but still classic scripts linked by
    top-level `const` names, not modules. Consequence: `package.json` must not set `"type": "module"`.
14. **One `localStorage` key** (`anatomy.mix.level`).
15. **The vocal detector isn't a true vocal detector,** and now there are numbers: it calls Opus (instrumental) **94%
    sung**, Levels 82%, Nanana 86%. It reads lead synths as singing, which pushes ideas on instrumental house under
    the one-voice floors and inflates the harness's mid-line count (56 across 286 ideas).
16. ~~In-browser separation is rough~~ Resolved in v7 by removal.
17. **Two FFTs** (`AnatomyMix.fftC` duplicates the engine's).
18. ~~Vocal ideas accept stretch tempo gaps~~ Gone with the vocal ideas.
19. **Two rhythm analyses** (engine vs mixer grid).
20. **A second loudness measure** (LUFS vs the engine's RMS).
21. **The sound-check, payoff, ranking and compatibility weights are judgment calls.** New evidence: compatibility
    scored all 20 test directions 82–98, including a pair picked as un-beatmatchable. **The dataset phase should fit these.**
22. **The phrase dynamic program's weights** were tuned on the demos plus 4 songs.
23. **The limiter is JS post-processing.**
24. **The drop detector's thresholds** were tuned on 2 demos and 4 songs. New evidence: Marea, picked for having no
    conventional drop, gets two confidence-1.0 drops; Rumble's 0:19 drop sits inside a stop-start intro; Opus (radio
    edit) gets only low-confidence hits. Validate against Matt's ear marks, then Raveform.
25. **`planLevels()` is a power model on paper.** New evidence: it passed a Silence switch that measures 6.7 LU quieter at the landing (Where You Are → Nanana).
26. **The measured harness and the paper check disagree on cut words.** The rebuilt harness now separates hard cuts
    (10 across 286 ideas) from cuts under an echo or reverb tail (9), so the disagreement is visible instead of folded
    into one number. Still open: Double drop on Marea → Latch passes the paper voice floor but measures 2.7 s of two singers.
27. **Advanced is thin,** re-diagnosed with numbers: on the test set, 59% of skipped Advanced techniques **can't apply**
    to same-tempo, same-key house (Key-lock-off blend, Tempo ride, Harmonic key change, Trade phrases), 35% fall under
    the sound floor, and only 6% hit the one-voice minimum. The Advanced menu needs techniques that work for the common
    house case.
28. **`AnatomyMix._internal.gens()`** exposes the generator table for testing. Debug-only.
29. **The lyrics module is drafted but not shipped** (`lyr.js` in the v7 work folder, not recovered, not in the repo). Parked.
30. **NEW: the docs live in two places,** the claude.ai Project (`anatomy/*.md`) and the repo (`docs/`). They're
    identical as of 2026-10-08. Rule until one home is chosen: edit in the repo, then copy to the Project in the same session.
31. **NEW: gap-only "drops" are landing targets.** The engine's silence moments without a bass return (confidence
    0.30, impact 0) fire at 8-bar phrase ends on house (Animals: 8, every 15.0 s) and are accepted by `landings()`.
    20 of 286 suggested ideas land on one.
32. **NEW: the preview harness was rebuilt, not ported,** with a new, uncalibrated score rule. The v7 harness and its
    numbers can't be re-run.
33. **NEW: no UI smoke test or screenshots in the repo** (v7's `ui_smoke.js` and `shots.js` weren't recovered). The
    file-URL check was run once by hand (0 page errors).
34. **NEW: Node decodes with ffmpeg, the page with the browser,** so song profiles from `tests/profile-songs.mjs` can
    differ slightly from the page. (The reference-pair compatibility matched exactly.)
35. **NEW: the Visuals animation keeps running behind the other tabs** (about half a CPU in headless Chromium). The
    harness throttles it; the app should pause it when Visuals isn't showing.
36. **NEW: beat phase is measurable on few ideas** (22 of 286): drop-first transitions barely overlap, and builds
    brought in highs-only aren't rhythmic enough to fold. It's blind to whole-16th slips.
37. **NEW: the harness's dead-air measure uses unweighted RMS,** so a high-passed deck reads quieter than it sounds.
    Animals → Rumble's 4.4 s is partly this and partly Rumble's own gaps.
38. **NEW: the byte-identity check pins `web/` to v7.** Retire it on the first intentional `web/` change (`docs/testing.md`).
39. **NEW: Fake-out drop's echo bar decays into a hole** (1.0 s on the demo, 2.3 s on Drugs From Amsterdam pairs;
    the paper Flow row agrees). A generator bug, not a harness artifact.
40. **NEW: the data pipeline is stage 1 only.** Raveform's field names haven't been seen (Hugging Face is blocked from
    the cloud workspace); the DJ Mix Dataset's alignment code is untested; 250 mixes means about 57 GB.

## Decisions
- **2026-10-05:** lyrics parked until drops are solid (lrclib works from a page in Chrome); the Spotify API is unusable
  for training or analysis (policy, closed endpoints, DRM); direction: emphasize drops, compatibility at the top, learn
  from real DJ data, a basic-to-creative range with the **Claude API** for the creative end; leaving the single HTML
  file is OK; order: drop-first v7, **then the platform and data phase**; genre: house/EDM first; audio download for
  private research approved, run in Matt's own Terminal.
- **2026-10-08:**
  - The repo is `matthewkpapas2/AnatomyMusic` (private). Work arrives as PRs; `main` started as a README stub.
  - The Claude API stays a stub (`POST /api/creative` returns 501) until the data pipeline is done; the key lives in a gitignored `.env`.
  - No audio in the repo, ever (`.gitignore` blocks all audio formats). Songs are found through `tests/songs.manifest.json` + a local folder setting.
  - Pipeline stages get scripts when they're built, not as empty stubs.

## Datasets (researched 2026-10-01 → 10-05; checked again 2026-10-08)
- **Raveform** (TISMIR, April 2026, CC BY 4.0): 4,902 mixes, 53,780 transitions with mix points, and 1,423 tracks with
  expert labels (intro / buildup / drop / breakdown / outro, beats, downbeats). Annotations on Hugging Face
  (`taejunkim/raveform`, `raveform.zip`); the code repo was empty. Hugging Face is blocked from the cloud workspace, so
  its field names are still unseen: `get_subset.py --raveform` writes them out on the Mac.
- **EDM-CUE** (ETH 2024): 21,461 cue points from 4 professional DJs across 4,710 tracks. Code, model and dataset at `ETH-DISCO/cue-detr`.
- **DJ Mix Dataset** (Kim et al.): `mir-aidj/djmix-dataset`, `dataset/djmix-dataset.json` (11.6 MB). **Checked
  2026-10-08:** 5,040 mixes; each has `id`, `title`, `url` (MixesDB), `audio_source` (soundcloud 3,760 / mixcloud 941 /
  html_audio 230 / youtube 109), `audio_url`, track counts, `num_available_transitions` (64,764 in all), `tags` (MixesDB
  categories: House 1,555, Techno 1,547, Tech House 1,410, Progressive House 672, Trance 559, Deep House 305) and a
  `tracklist` of `{ id (a YouTube id or null), title }`. Mixes run 2009–2021, mostly 2012–2017. The `djmix` pip package
  has download, alignment and EQ-estimation code (Python 3.9).

## Next steps
1. **Matt:** merge the scaffold PR (after a look); re-download Losing It, Drugs From Amsterdam and Opus as the
   Extended / Original Mix; mark the drops by ear (checklist in `03-test-songs.md`).
2. **Matt, on the Mac:** `brew install ffmpeg yt-dlp`, then `python3 data/download/get_subset.py --raveform` (small),
   then a 50-mix dry run and `--go`. Bring back `data/work/raveform_schema.txt` and the download log summary.
3. **Next session:** compare the ear marks with `findDrops` (precision/recall, timing error); join Raveform labels
   (stage 2) and validate the drop detector against them (stage 3).
4. **Fixes the measurements point to** (each a v8 code change, so the byte-identity check retires): Fake-out's echo
   bar (#39), gap-only landings (#31), pausing Visuals when hidden (#35), Advanced techniques for same-tempo house
   (#27), and the vocal detector (#15). Each gets measured with the harness before and after.
5. Then stages 4–6 (alignment, mix points vs drops, the pairwise ranker), the rating control on previews, and only
   then the Claude API creativity dial (the measured sound check keeps a veto; Claude can't hear audio).

## Session log
- **2026-09-24:** v1 → v3 built in one afternoon.
- **2026-09-28:** The project was set up as ongoing and the context docs were created.
- **2026-09-30:** v4, v5 and v6 built.
- **2026-10-01 → 10-05:** v7 brief baselined and diagnosed; lrclib tested and lyrics parked; dataset research; **v7 built, verified and saved**.
- **2026-10-07:** Test song set chosen (`03-test-songs.md`).
- **2026-10-08:** Songs received and version-checked. **Platform scaffold:** GitHub linked (account plus Claude App),
  v7 split into the repo and proven identical, server, data skeleton, tests, docs; all 20 songs profiled; the 10 test
  pairs measured both ways; PR opened.
