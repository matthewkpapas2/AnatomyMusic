# Anatomy

*Play any sound. Watch it come apart.*

Anatomy listens to music in the browser and shows it three ways: **Visuals** (a WebGL piece where every color and
motion is a measurement), **Analysis** (structure, chords, key, energy, a spectrogram, a Song DNA card) and **Mix**, a
drop-first transition planner for DJs. Load two songs and it scores how well they go together (0–100) and suggests
Beginner, Intermediate and Advanced transitions that land on the next song's drop. It suggests; the DJ performs.

This repo is the **platform phase (v8)**: the v7 single-file page (`anatomy7.html`) split into files, a small local
server, a dataset pipeline and a test suite. The UI started as v7 split into files (proven byte for byte until the first v8 change on 2026-10-09).

## Run it

```sh
npm start                 # http://127.0.0.1:5173/  (Node >= 20.12, no dependencies)
```
Or open `web/index.html` directly in Chrome; it still works from a file, like v7 did.

## Test it

```sh
npm install && npx playwright install chromium     # once, for the preview harness
npm test                  # web/ == anatomy7.html, server tests, engine + mixer regression on the demo songs
npm run test:songs        # tempo, key and drops for every test song (needs ffmpeg and the songs)
npm run test:pairs        # the preview harness on the 10 test pairs, both directions
```
Songs are never committed. Point the tests at them with `ANATOMY_SONGS=/path/to/folder`, or put
`{"dir": "~/Downloads"}` in `tests/songs.local.json`. The song list is `tests/songs.manifest.json`.

## Layout

| Path | What |
|---|---|
| `web/` | The app: `index.html`, `styles.css`, `js/engine.js` (live analysis), `js/demo.js` (synth demo songs), `js/mix.js` (the Mix brain), `js/app.js` (UI, visuals, previews) |
| `server/` | Local server for `web/`, plus the stub route for the future Claude API call (key in a gitignored `.env`) |
| `data/` | Dataset pipeline: download script (run on the Mac), stage plan, status |
| `tests/` | Regression, per-song profiles, the preview measurement harness, the song manifest |
| `tools/` | `build-single.mjs`: inline `web/` back into one HTML file |
| `docs/` | Overview, architecture, status and roadmap, test songs, results |

Start with `docs/00-overview.md`.
