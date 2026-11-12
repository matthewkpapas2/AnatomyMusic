# data/: the dataset pipeline (skeleton)

Goal (docs/roadmap.md): learn from real DJ mixes what makes a good transition, then fit the weights that are
judgment calls today (sound-check rows, payoff, ranking, compatibility, drop thresholds).

Nothing in `data/raw/`, `data/work/` or `data/out/` is committed (see `.gitignore`). Audio stays on Matt's Mac.

## Step 1: download (Matt's Terminal, not Claude's workspace)

Claude's cloud workspace can't reach SoundCloud, Mixcloud, YouTube or Hugging Face, so the download runs on the Mac.

```sh
brew install ffmpeg yt-dlp                              # once
cd AnatomyMusic
python3 data/download/get_subset.py --raveform          # Raveform annotations (small): do this first
python3 data/download/get_subset.py --mixes 50          # dry run: what would be downloaded, and how big
python3 data/download/get_subset.py --mixes 50 --go     # download; rerun the same command to resume
python3 data/pipeline/status.py                         # what's on disk
```

**Size, measured on 2026-10-08 against the real metadata:** the default 250 mixes (house / tech house / deep house /
progressive house, 2012 or later, at least 8 transitions, at most 3 mixes per DJ) bring **5,783 unique tracks**,
about **57 GB** and ~6,000 downloads at a polite rate. 50 mixes is about 14 GB. Start with 50: older SoundCloud
links die, and the success rate is worth seeing before committing a day of downloading.

| Folder | What |
|---|---|
| `raw/djmix/djmix-dataset.json` | DJ Mix Dataset metadata (5,040 mixes; tracks are YouTube ids) |
| `raw/raveform/` | Raveform annotations zip and its unpacked files |
| `raw/audio/mixes/<mix id>.*`, `raw/audio/tracks/<youtube id>.*` | Audio as served (m4a/opus/mp3), never re-encoded |
| `work/subset.json` | The chosen mix ids and track ids, with the options used |
| `work/download_log.jsonl`, `work/ytdlp_archive.txt` | Per-download results; the resume list |
| `work/raveform_schema.txt` | Files and field names found in Raveform, written by `--raveform` |

## Stages (planned; each gets a script when it's built, not before)

| # | Stage | In | Out | Status |
|---|---|---|---|---|
| 1 | Select + download | djmix metadata, Raveform zip | `raw/` | **built** (`download/get_subset.py`) |
| 2 | Join Raveform labels to the subset | `work/raveform_schema.txt` | `work/labels.json` | waits on Raveform's schema |
| 3 | Validate `findDrops` against Raveform's drop labels | tracks + labels | precision/recall per threshold | after 2 |
| 4 | Align each mix to its tracks (where each track plays, at what tempo) | mixes + tracks | `work/alignment/` | the djmix package has alignment code to evaluate first |
| 5 | Where DJs mix in and out relative to drops | 2 + 4 | `out/mixpoints.json` | after 4 |
| 6 | Fit the ranking/payoff/sound-check weights (pairwise: predict the DJ's choice among Anatomy's candidates) | 5 + `web/js/mix.js` | proposed weights + held-out accuracy | after 5 |

Only after stage 6 does the Claude API "creativity dial" get wired (server/index.mjs `POST /api/creative`).

## Licensing notes
- DJ Mix Dataset metadata: from `mir-aidj/djmix-dataset` (cite Kim et al., DAFx 2022). Audio comes from the
  original hosts.
- Raveform annotations: CC BY 4.0 (TISMIR 2026).
- Downloaded audio is for private research only, and never committed or redistributed.
