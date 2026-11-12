# Anatomy: status, version log and roadmap

_Last updated: 2026-10-20 (v8: #44, #42 and #43 as PRs #7–#9 on the 10-09 stack). Update this file after every meaningful change. The full v7-era version of this file (with the v6→v7 measurement table) is kept in `history/02-status-2026-10-05.md`._

## Current version
**Code: v8 in progress.** v7 (anatomy7.html, 2026-10-05) lives in the repo **`matthewkpapas2/AnatomyMusic`** as `web/`.
On 2026-10-09 the first intentional changes went in as stacked PRs on the scaffold (PR #1 is still open):
ear-vs-detector → Fake-out fix → gap-only landings → harness fixes → docs. On 2026-10-20 three more stacked on top
(#7 `fix-landing-value` → #8 `fix-gap-launches` → #9 `fix-escalator-leadin` → `docs-2026-10-20`); none is merged yet.
`anatomy7.html` and all older copies in `~/Downloads` are unchanged and stay as they are.

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
| **v8 first changes** (branches `ear-vs-detector` … `docs-2026-10-09`) | 2026-10-09 | `tests/drops-vs-ear.mjs` (ear marks vs `findDrops`); **Fake-out** no longer leaves holes (#39); **gap-only entries stop being landings**, and songs without a confident drop also get section landings (#31); the byte-identity check retires (#38); the harness opens on Mix and no longer crashes on a stuck file chooser (#35 closed as misdiagnosed). Details: `04-results-2026-10-09.md`. |
| **v8 cleanup** (branches `fix-landing-value` … `docs-2026-10-20`) | 2026-10-20 | The payoff formula is written once (#44, no result changed); **gap-only entries stop being Track 1 build launches** and Silence switch stops promising a drop on them (#42); Build into build's preview skips near-silent lead-ins (#43). Advanced 37 · 96.8 (min 73) → 34 · 97.4 (min 77). Details: `04-results-2026-10-20.md`. |

## v8 cleanup (2026-10-20): what was done and why
**Matt's pick** (asked at the start, since nothing he owed had arrived: no ear marks, no re-downloads, no Raveform
schema, no repo clone on the Mac): the three unblocked measured fixes, #42, #43 and #44, one PR each.

**What happened** (numbers in `04-results-2026-10-20.md`):
- **Baseline first:** the 10-09 table reproduced exactly (137 / 101 / 37 ideas, 96.2 / 94.5 / 96.8).
- **#44 (PR #7):** `payoffOf()` and `rankOf()` replace the two copies in `finish()` and `rate()`. The copies had drifted
  in three ways that could change a result (no-landing fallback, tension 0, NaN contrast), none of which fires today. All 338
  ideas identical.
- **#42 (PR #8):** measured on Track 1's own audio, 27 gap-only entries were "build" launches and none had a build in front
  of it: the engine's `built` flag was false on all 27, the highs rose at most 2 dB and the bass fell at most 5 dB, and
  Drugs From Amsterdam 1:34 sits in its own fade. They are build launches now only if the engine saw a build. Silence
  switch keeps them (a real silence is its premise; Latch 1:51 measures 100) but says "stop", not "drop". 10 ideas are
  gone (73–100), 2 moved to honest launches, and Where Have You Been → Feel So Close gets its first Intermediate idea.
  **On its own it made one idea worse:** Build into build moved to Drugs From Amsterdam's real 1:46 drop and scored 45.
- **#43 (PR #9):** that 45 was #43's case: the 9-bar lead-in reached back into the same fade. `soundingBars()` (Fake-out's
  guard) now trims Build into build's preview lead-in: 45 → 100. Alone on the old baseline it also lifts the 1:34 version
  (73 → 100, by moving the launch to 1:46). The DJ's steps don't change.
- **Cost:** girl$ → Losing It loses 3 ideas that scored 100 and Animals → Levels a Build into build at 100 (sound fine,
  built on a build that isn't there); thin Advanced 7 → 9 directions; Rumble → Animals compatibility 84 → 81.
- **Corrections:** the #8 commit message says 26 entries (it's 27) and "-40 dB" (a raw band-power value, not a heard
  level); the #7 commit message counts an unclamped total as a fourth drift, which never mattered. The PR descriptions and
  the code comment are fixed. An independent check of every number against the raw runs found these, plus a few doc
  slips fixed before commit. The 10-09 doc's "Animals → Levels A < B by 9" is 8 by the harness's
  own rounding.
- The workspace restarted once mid-run (likely memory); the lost #44 run was repeated, and runs went one at a time after that.

## v8 first changes (2026-10-09): what was done and why
**Matt's brief:** compare his ear marks with the detector; re-profile re-downloaded songs; build Raveform stages 2–3 if
the schema is on the Mac; then the first v8 code changes, one PR each, measured before and after on the 10 test pairs
and the reference pairs: Fake-out (#39), gap-only landings (#31), pausing Visuals (#35), and a proposal for Advanced
techniques for same-tempo, same-key house (#27, list first).

**What happened** (numbers in `04-results-2026-10-09.md`):
- **Baseline first:** the harness reproduced the 10-08 table exactly (140 / 107 / 39 ideas, 96.1 / 94.3 / 92.0), so it
  is deterministic and before/after numbers can be compared one for one.
- **Ear marks:** not received (the brief's paste slot was empty). `tests/drops-vs-ear.mjs` and the manifest's `ear`
  field are ready; `npm run test:ear` gives the full report once the marks are in. Its diagnosis of misses relies on a
  test-side mirror of `findDrops` (#41) that checks itself; it agrees with the app on all 20 songs.
- **Re-downloads:** none yet (Losing It, Drugs From Amsterdam and Opus are still the 4:08 / 2:26 / 5:27 edits).
- **Raveform:** `data/work/raveform_schema.txt` isn't on the Mac yet, so stages 2–3 wait. The commands are in Next steps.
- **#39 Fake-out, two causes, not one.** Demo 1's build ends in a one-beat silence and the echo repeated that silence.
  Drugs From Amsterdam's 2.25 s "hole" wasn't the echo at all: the preview opened inside the song's own fade to −36 dB at
  1:31. Fixes: echo the last beat with sound in it; start the lead-in after any near-silent beat; and, with matched
  tempos, also try a version with Track 2's last build bar under the echoes. The sound check picks between the two,
  because bringing Track 2 in a bar early fails the one-voice rule on 4 pairs. Advanced: 48 → 100 on Drugs From
  Amsterdam → Turn Off The Lights, 61 → 87 on → Losing It, demo 97 (86) → 100; Opus → Strobe gains one. No other
  idea's score changed. On Drugs From Amsterdam the gain is mostly the preview starting after the song's fade: the DJ's
  steps there are the same.
- **#31 gap-only landings stop.** The worst one went into Nanana's breakdown (Silence switch, score 20). Three "earn it"
  rules were tried on all 39 entries and none separated useful from useless, so they stop. Stopping alone took
  Kelly → Pipe Down from 12 ideas to 3, because Pipe Down has no confident drop and the section fallback only ran when
  there were no landings; it now also runs when there's no confident (≥ 0.6) drop or hit. Advanced: average 94.8 → 96.8,
  minimum 20 → 73, none under 70. **Cost:** 12 ideas that landed on gap-only entries are gone, including all 5
  Intermediate ideas on Rumble → Animals (four landed on Animals 1:07, a mid-section stop; one on 2:07).
- **#35 was misdiagnosed.** The Visuals animation already stops when another page shows (`loop()` only calls
  `VZ.frame` on Visuals; browsers pause rAF in background tabs). Measured: Mix 4–8% CPU, Visuals ~103% (software WebGL
  headless). The "half a CPU behind Mix" was the harness opening on Visuals. No app change; the harness now opens
  `?debug#mix` and no longer patches rAF (no idea, cue or score changed). A harness crash found while measuring is fixed.
- **#27:** a proposal for Matt (below, "Advanced proposals"); nothing built.
- **Found on the Mac:** `~/Downloads/anatomy-v7-workspace.tar.gz` (Oct 8, 4:09 PM), the v7 session's work folder that
  10-08 said was missing. Its `anatomy7.html` matches the sha. Not ported; see Decisions.

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

## Verified state (2026-10-20, top of the stack)
- **`npm test`:** single-file build OK; 5/5 server tests; 15/15 regression checks.
- **Harness, 10 test pairs × 2 directions:** Beginner 137 · 96.2 (min 0), Intermediate 96 · 94.4 (min 69), Advanced
  34 · 97.4 (min 77, none under 70). Thin Advanced in 9 directions; Advanced 3+ under Beginner in 3 (Animals → Levels by
  11, Don't You Worry Child → Animals by 4, Turn Off The Lights → Drugs From Amsterdam by 3). Reference pairs:
  compatibility 87 / 89 / 73 / 93, unchanged. 0 page errors. Dead air over 0.5 s only on Animals → Rumble (Rumble's intro, #24).

## Verified state (2026-10-09, top of the stack)
- **`npm test`:** single-file build OK; 5/5 server tests; 15/15 regression checks.
- **Harness, 10 test pairs × 2 directions:** Beginner 137 · 96.2 (min 0), Intermediate 101 · 94.5 (min 69), Advanced
  37 · 96.8 (min 73). 7 directions with thin Advanced; Advanced 10+ under Beginner in 1 (Drugs From Amsterdam → Losing
  It, by 11: Build into build's 1.4 s of dead air, #42/#43), 3–9 under in 3. Reference pairs: compatibility 87 / 89 / 73 /
  93, unchanged. 0 page errors.
- **Byte identity:** retired; last passed at `e5a8f9d`.

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
    edit) gets only low-confidence hits. Validate against Matt's ear marks (`npm run test:ear`, ready 2026-10-09), then Raveform.
25. **`planLevels()` is a power model on paper.** New evidence: it passed a Silence switch that measures 6.7 LU quieter at the landing (Where You Are → Nanana). 2026-10-09: that idea landed on a gap-only entry before Nanana's breakdown and is gone with #31; the model itself is unchanged.
26. **The measured harness and the paper check disagree on cut words.** The rebuilt harness now separates hard cuts
    (10 across 286 ideas) from cuts under an echo or reverb tail (9), so the disagreement is visible instead of folded
    into one number. Still open: Double drop on Marea → Latch passes the paper voice floor but measures 2.7 s of two singers.
27. **Advanced is thin,** re-diagnosed with numbers: on the test set, 59% of skipped Advanced techniques **can't apply**
    to same-tempo, same-key house (Key-lock-off blend, Tempo ride, Harmonic key change, Trade phrases), 35% fall under
    the sound floor, and only 6% hit the one-voice minimum. The Advanced menu needs techniques that work for the common
    house case. Proposals for Matt: "Advanced proposals" below (2026-10-09).
28. **`AnatomyMix._internal.gens()`** exposes the generator table for testing. Debug-only.
29. **The lyrics module is drafted but not shipped** (`lyr.js` in the v7 work folder, not recovered, not in the repo). Parked.
30. **NEW: the docs live in two places,** the claude.ai Project (`anatomy/*.md`) and the repo (`docs/`). They're
    identical as of 2026-10-08. Rule until one home is chosen: edit in the repo, then copy to the Project in the same session.
31. ~~gap-only "drops" are landing targets~~ **Resolved 2026-10-09:** they aren't any more (see the v8 first-changes section). Was: The engine's silence moments without a bass return (confidence
    0.30, impact 0) fire at 8-bar phrase ends on house (Animals: 8, every 15.0 s) and are accepted by `landings()`.
    20 of 286 suggested ideas land on one.
32. **NEW: the preview harness was rebuilt, not ported,** with a new, uncalibrated score rule. The v7 harness and its
    numbers can't be re-run. **2026-10-09:** the v7 harness turned up in `~/Downloads/anatomy-v7-workspace.tar.gz`; running it on the reference pairs would calibrate the new score rule (decision pending).
33. **NEW: no UI smoke test or screenshots in the repo** (v7's `ui_smoke.js` and `shots.js` weren't recovered). The
    file-URL check was run once by hand (0 page errors). The originals are in the same archive.
34. **NEW: Node decodes with ffmpeg, the page with the browser,** so song profiles from `tests/profile-songs.mjs` can
    differ slightly from the page. (The reference-pair compatibility matched exactly.)
35. ~~the Visuals animation keeps running behind the other tabs~~ **Closed 2026-10-09, misdiagnosed:** it doesn't (Mix 4–8% CPU headless); the cost was the harness opening on Visuals. The harness now opens on Mix.
36. **NEW: beat phase is measurable on few ideas** (22 of 286): drop-first transitions barely overlap, and builds
    brought in highs-only aren't rhythmic enough to fold. It's blind to whole-16th slips.
37. **NEW: the harness's dead-air measure uses unweighted RMS,** so a high-passed deck reads quieter than it sounds.
    Animals → Rumble's 4.4 s is partly this and partly Rumble's own gaps.
38. ~~the byte-identity check pins `web/` to v7~~ **Resolved 2026-10-09:** retired with the Fake-out change; last passed at `e5a8f9d` (`docs/testing.md`).
39. ~~Fake-out drop's echo bar decays into a hole~~ **Resolved 2026-10-09.** Two causes: the demo's echo repeated a silent beat; Drugs From Amsterdam's preview opened in the song's own fade (not the echo). Both fixed, plus an optional Track 2 build bar under the echoes.
40. **NEW: the data pipeline is stage 1 only.** Raveform's field names haven't been seen (Hugging Face is blocked from
    the cloud workspace); the DJ Mix Dataset's alignment code is untested; 250 mixes means about 57 GB.
41. **NEW (2026-10-09): `tests/lib/drop-rules.mjs` mirrors `findDrops`' measurements,** because `findDrops` only returns
    winners and the ear report needs to say why a drop was missed. It verifies itself on every analyzed song, marked or
    not (all 20 agree), and fails the run if it drifts. Remove it when `findDrops` returns its own bar table (a small `web/` change).
42. ~~gap-only entries still count as Track 1 launches~~ **Resolved 2026-10-20 (PR #8):** they're build launches only if the engine saw a build (none on the test songs); Silence switch keeps them with honest text. Was: through `launches()` (`d.gap > 0.12`, as "build"
    launches: "the crowd is waiting for its drop") and `genHijack` (reads `A.drops` directly). In the final state 12
    ideas launch from one: Drop swap / Key lift / Build into build from Drugs From Amsterdam 1:34 (both its pairs) and
    girl$ 3:32, Build into build from Animals 2:07, Silence switch from Latch 1:51, Fake-outs from Nanana 2:28 and
    Rumble 1:57. Same evidence as #31, other deck; not changed yet.
43. ~~Build into build's lead-in starts in near-silence~~ **Resolved 2026-10-20 (PR #9):** it uses `soundingBars()` like Fake-out (45 → 100 on Drugs From Amsterdam → Losing It). Other generators: #46. Was: **lead-ins that start in a song's own near-silence.** Fake-out now skips them (`soundingBars`, preview only:
    the DJ steps still start at the build); Build into build doesn't. Its 1.4 s of dead air on Drugs From Amsterdam →
    Losing It launches from the gap-only entry at 1:34, just after the fade, so #42 and #43 both play in (unverified).
44. ~~the landing value formula is written twice~~ **Resolved 2026-10-20 (PR #7):** `payoffOf()` / `rankOf()`, no result changed. Was: **the landing value formula is written twice** (`finish()` and `rate()` in `mix.js`). Found while removing
    the gap branches; not merged yet.
45. **NEW: harness flakiness under load.** On the 2-core workspace, one direction per full run timed out on a deck
    click (30 s). The harness no longer crashes on it (60 s, and a stuck chooser fails only that pair); re-run that
    direction alone. Opening on Mix may reduce it; too few runs to say. **2026-10-20:** 4 full runs plus a 2-pair run, one
    at a time, no timeouts; one workspace restart (exit 137, likely memory) when a Node analysis ran alongside the harness.
46. **NEW (2026-10-20): only Fake-out and Build into build skip near-silent lead-ins.** The other generators that take
    Track 1 build launches play their full lead-in: Drop swap and Key lift (through `intoDrop` → `cutPlan`) and Speed ramp
    (its own plan). No dead air over 0.5 s is left outside Animals → Rumble, but Drugs From Amsterdam's 1:46 build shows a
    real drop can open in a fade. A guard in `cutPlan()` would cover Drop swap and Key lift (and every other `cutPlan` user)
    but not Speed ramp; either way it's its own measured change.
47. **NEW (2026-10-20): Silence switch on a gap-only stop keeps tension 0.9,** the same as a silence before a real drop.
    A judgment call measured on one idea (Latch 1:51, 100); the dataset phase should say whether a mid-chorus stop
    deserves it.

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
- **2026-10-09:**
  - New PRs stack on the open scaffold PR, one per change: `ear-vs-detector` → `fix-fakeout-hole` → `fix-gap-landings`
    → `harness-no-raf-throttle` → `docs-2026-10-09`. Each targets the branch before it.
  - Gap-only entries stop being landings rather than "earning it" (three rules tried, none separated them). If Matt's
    ear marks show real drops or hits at gap-only spots (Rihanna 1:31 misses the hit rule by 0.1 dB), loosen the hit
    rule instead.
  - #35 needed no app change (measured). The harness change stands on its own.
  - **For Matt:** port the v7 harness from the archive to calibrate the new score rule (#32), and `ui_smoke.js` /
    `shots.js` (#33)? `lyr.js` stays parked and out of the repo either way.

- **2026-10-20:**
  - Nothing Matt owed had arrived, so Matt picked the unblocked fixes (#42–#44) over the Advanced proposals, the v7
    harness port, or a review of the stack.
  - Gap-only entries stop being build launches (measured: none of 27 had a build), but Silence switch keeps them: a
    silence is its premise and the one such idea measures 100. Same reasoning as #31, but scoped to what the label claims.
  - #8 and #9 should merge together (#8 alone makes one idea worse; #9 fixes it).
  - Mistakes found by recounting are fixed in PR descriptions, comments and docs, not by force-pushing pushed branches.

## Advanced proposals for same-tempo, same-key house (#27, 2026-10-09; not built)
Each lands on Track 2's drop and uses only what previews can already render (clips, fader, 3-band kill EQ, filters,
echo, reverb, loops). Ordered by how distinct they are and how little they depend on the vocal detector (#15).
1. **Breakdown swap.** On the phrase line where Track 1's breakdown starts, switch to Track 2's breakdown (same key, so
   the pads can overlap 2–4 bars with the mids swapping), ride Track 2's whole build, land its drop. The long-blend move
   for progressive and melodic house. Needs: breakdowns of ≥ 8 bars in both. Risk: vocal breakdowns (Turn Off The
   Lights) against the voice floor; long previews.
2. **Drop stabs.** Over Track 1's last 4 build bars, punch in one beat of Track 2's drop on the downbeat of bars −4 and
   −2 (fader cuts), then land it for real. A turntablist teaser. Needs matched tempos. Risk: two kicks on the stab
   beats (rhythm row), a sung drop against the voice row.
3. **Delayed bass drop.** Track 2's drop lands with its bass killed for 4 bars, then the bass slams in on bar 5: two
   payoffs, and the ▼ landing is the slam. Risk: the Flow row may read the 4 bars as a sag; the payoff must be measured
   at the slam.
4. **Bass trade.** Both drops in sync for 8 bars, mids and highs from Track 1, the low end switching every 2 bars, then
   Track 2 takes everything on its drop. Overlaps Double drop; never two basslines at once.
5. **Hook carry (mash-up drop).** Track 2's drop lands and Track 1's lead riff (mids only) rides over it for 4–8 bars.
   Same key is exactly what makes it work. Blocked in practice until #15: the vocal detector reads leads as singers.

Not proposed: a rewind (Spinback already does it), a manufactured stop (Cut / Tape stop), an extended build loop
(Loop & layer). Suggested order: 1–3 first, 4–5 after the vocal detector is fixed.

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
1. **Matt:** paste the ear marks (`03-test-songs.md` has the list; also Rihanna 1:31, Animals 1:07, Pipe Down 0:06 / 0:12),
   then `npm run test:ear -- --report` (or the next session runs it). Review the stacked PRs, scaffold first.
2. **Matt:** re-download Losing It, Drugs From Amsterdam and Opus as the Extended / Original Mix.
3. **Matt, on the Mac** (Terminal):
   ```sh
   cd ~ && git clone https://github.com/matthewkpapas2/AnatomyMusic.git   # skip if already cloned
   cd ~/AnatomyMusic && git fetch origin && git checkout platform-scaffold
   brew install ffmpeg yt-dlp
   python3 data/download/get_subset.py --raveform
   cp data/work/raveform_schema.txt ~/Downloads/                              # so the next session can read it
   ```
   Then stages 2–3 (join Raveform's labels; validate `findDrops` against their drop labels).
4. **Pick from "Advanced proposals"** (#27); then build them one PR each, measured like these.
5. Decide on the v7 archive (#32/#33). Then the remaining measured fixes: the vocal detector (#15), the lead-in guard in
   `cutPlan()` (#46), Rumble's intro drop (#24).
6. Then stages 4–6 (alignment, mix points vs drops, the pairwise ranker), the rating control on previews, and only then
   the Claude API creativity dial (the measured sound check keeps a veto; Claude can't hear audio).

## Session log
- **2026-09-24:** v1 → v3 built in one afternoon.
- **2026-09-28:** The project was set up as ongoing and the context docs were created.
- **2026-09-30:** v4, v5 and v6 built.
- **2026-10-01 → 10-05:** v7 brief baselined and diagnosed; lrclib tested and lyrics parked; dataset research; **v7 built, verified and saved**.
- **2026-10-07:** Test song set chosen (`03-test-songs.md`).
- **2026-10-08:** Songs received and version-checked. **Platform scaffold:** GitHub linked (account plus Claude App),
  v7 split into the repo and proven identical, server, data skeleton, tests, docs; all 20 songs profiled; the 10 test
  pairs measured both ways; PR opened.
- **2026-10-09:** Baseline reproduced exactly; ear-vs-detector script (marks pending); Fake-out holes fixed (two causes);
  gap-only landings stopped, with a wider section fallback; byte identity retired; #35 closed as misdiagnosed; harness
  crash fixed; Advanced proposals written; the v7 workspace archive found. Five stacked PRs.
- **2026-10-20:** Nothing new from Matt; baseline reproduced exactly; #44 (no-op, proven), #42 (gap-only launches, 27
  measured) and #43 (Build into build lead-in) as PRs #7–#9; Advanced 34 · 97.4 (min 77). One workspace restart.
