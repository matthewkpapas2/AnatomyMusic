# Anatomy: project overview

_Last updated: 2026-10-08 (v8 platform scaffold; app code still v7). Read this first in any new Anatomy session._

## What it is
Anatomy is a web app that listens to sound in the browser and shows it three ways:

- **Visuals** (the main page since v3): a full-screen WebGL piece where every color, shape and motion is driven by a real measurement (notes, chord, beat, loudness, brightness, repetition, section).
- **Analysis** (second tab): the original analytical view. It has a self-similarity "Shape" triangle, section/chord/key/energy lanes, a note-colored spectrogram, live cards, a Moments list and a Summary with an exportable "Song DNA" PNG card.
- **Mix** (third tab: new in v4, rebuilt in v6, **drop-first since v7**): a transition planner for DJs. You load two songs. Anatomy then:
  - shows a **compatibility score (0–100)** at the top, broken into tempo, key, drops, loudness, vocals and the best transition found
  - suggests transitions at three levels. **Every one lands on one of the next song's drops or chorus hits.**
    - **Beginner:** blend into the drop, filter riser, cut, echo or tape stop into the drop.
    - **Intermediate:** drop swap, double drop, loop roll, spinback, reverb wash-out, key lift, loop & layer, shared-chord drop, half-time drop, speed ramp.
    - **Advanced:** fake-out drop, build into build, silence switch, wormhole, harmonic key change, key-lock-off blend, tempo ride, trade phrases.

  Every idea passes a **sound check** (rhythm, phrase, one voice, key, flow, clean audio). The floor is **70 / 72 / 75** by level, and Intermediate and Advanced also need clean voices. Ideas are ranked by sound (55%) and payoff (45%: how hard the drop lands). Each idea has exact cue points, numbered deck steps, a "why it's special" line, the measured reasons, a stage drawing with the drop marked, and a preview rendered through a club-style 3-band kill EQ, filters, echo and reverb.

  It's explicitly **not an auto-mixer**: it suggests, and the DJ does it.

Tagline in the page: *"Play any sound. Watch it come apart."*

All analysis runs in the page; audio stays in memory only. **Since 2026-10-08 it lives in a repo** with a small local
server (for the future Claude API call, key in a gitignored `.env`), a dataset pipeline and a test suite. The page
itself still has no build step and no dependencies apart from Google Fonts, and still works opened from a file.

## Inputs
1. **Microphone** (`getUserMedia`)
2. **Browser tab** (`getDisplayMedia` with tab audio)
3. **Built-in demo songs** (synthesized, with known answers):
   - Demo 1 "Gear Change": 122 BPM, A minor → B minor, a drop at 62.95 s after a one-beat silence.
   - Demo 2 "Night Drive": 126 BPM, E minor, a synthesized "singer", drops at 38.10 and 76.19 s.
4. **Audio files** (Mix tab only).

## Where things live
- **Repo: `github.com/matthewkpapas2/AnatomyMusic`** (private). `main` started as a README stub; the platform scaffold
  arrived as a PR from `platform-scaffold`. Layout: `web/` (the app), `server/`, `data/`, `tests/`, `tools/`, `docs/`
  (these docs, plus `testing.md` and the results). See `01-architecture.md`.
- **Matt's Mac, `~/Downloads/`:** `anatomy.html` … `anatomy7.html`, kept as they are (never overwritten). `anatomy7.html`
  is the v7 the repo was split from (sha256 `4081c8c1…b14b`). `anatomy-tab-2026-09-24-18-24.png` is an exported Song DNA card.
- **Test songs in `~/Downloads`:** the 20 songs in `03-test-songs.md` (14 house/EDM test songs plus Kelly, Bieber,
  John Summit, Drake, Rihanna and Troye Sivan). Three are still the wrong (short) versions. They are listed by filename
  in `tests/songs.manifest.json`; no audio is ever committed.
- **Docs:** these files exist in the claude.ai Project (`anatomy/`) **and** in the repo (`docs/`), identical as of
  2026-10-08 (tech debt #30). Edit the repo copy, then copy to the Project in the same session.

## How to pick this up in a new session
1. Read these docs: `00-overview`, `01-architecture`, `02-status-and-roadmap`, and the latest `04-results-*`.
2. Attach the repo (`matthewkpapas2/AnatomyMusic`, push access; the Claude GitHub App is installed on it) and clone it.
3. Run `npm test` before changing anything (byte identity while web/ is still v7, server tests, the demo regression).
4. If the session is linked to Matt's computer, stage the songs from `~/Downloads` and set `ANATOMY_SONGS` (or
   `tests/songs.local.json`), then `npm run test:songs` / `npm run test:pairs` as needed. In the cloud workspace,
   `npm i` is replaced by symlinking `/opt/npm-tools/node_modules/playwright{,-core}` into `node_modules/`.
5. After a meaningful change: a branch, small described commits, a PR; update `02` and the results doc.

## Working rules (Matt wants these explicit)
- **No silent technical debt.** Say any workaround or duplicate in the reply *and* log it in the status doc. **Remove dead code instead of leaving it dormant.** Pipeline stages get scripts when they're built, not as empty stubs.
- **Old versions are never overwritten.** The `anatomy*.html` files in Downloads stay as they are. In the repo, git history is the versioning: work goes on a branch and arrives as a PR. Ask Matt before anything hard to undo (force pushes, deleting branches, rewriting `main`).
- **Measurements, not decoration.** Every visual maps to a measured quantity and is explained.
- **Honest labeling.** Estimates are labeled. Ideas that fail the floor are listed under "Checked but not suggested" with the reason. Harness numbers say which harness made them.
- **Sound first.** Judge Mix changes by rendering previews headlessly and measuring them (`npm run test:pairs`). **No idea is shown below the sound floor**, and a higher level must never sound worse than a lower one.
- **Drops first (v7).** Every transition should land on the next song's drop or chorus hit, with tension in front of it. Avoid long fades into the middle of sections.
- **Don't paste third-party text** (lyrics, other people's code) into replies or files. Summarize instead, and mask lyrics if they're ever needed as test data. **Lyrics stay parked.**
- **Order:** the data pipeline comes before the Claude API call.
- Give Matt direct pushback and granular step-by-step explanations.
