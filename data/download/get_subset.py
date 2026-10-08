#!/usr/bin/env python3
"""Pick a house/EDM subset of the DJ Mix Dataset and download it, plus Raveform's annotations.

Run this in YOUR OWN Terminal on the Mac (Claude's cloud workspace can't reach SoundCloud, Mixcloud, YouTube or
Hugging Face). It only writes inside data/ of this repo. Audio is for private research (Matt's decision,
2026-10-05) and is gitignored.

Needs: Python 3.9+, ffmpeg and yt-dlp on PATH   ->   brew install ffmpeg yt-dlp

    python3 data/download/get_subset.py                 # 1. dry run: fetch metadata, choose mixes, print the plan
    python3 data/download/get_subset.py --go            # 2. download (resumable: rerun to continue after a stop)
    python3 data/download/get_subset.py --raveform      # Raveform annotations only (small)

Options: --mixes N (default 250), --since YEAR (2012), --genres "House,Tech House,..." , --max-per-dj N (3),
         --no-tracks (mixes only), --min-transitions N (8).
"""
import argparse, json, re, shutil, subprocess, sys, time, urllib.request, zipfile
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]
RAW, WORK = DATA / "raw", DATA / "work"
DJMIX_URL = "https://raw.githubusercontent.com/mir-aidj/djmix-dataset/main/dataset/djmix-dataset.json"
RAVEFORM_URL = "https://huggingface.co/datasets/taejunkim/raveform/resolve/main/raveform.zip"
GENRES = ["House", "Tech House", "Deep House", "Progressive House", "Deep Tech House"]
SOURCES = {"soundcloud", "mixcloud", "youtube"}          # yt-dlp handles these; 'html_audio' links are skipped
EST_MB = {"mix_per_min": 1.0, "track": 7.0}             # rough sizes at the 128-160 kbps these sites serve


def fetch(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    print(f"  downloading {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(dest)
    return dest


def genres_of(mix):
    return {t["key"].split(":", 1)[1] for t in (mix.get("tags") or []) if t.get("key", "").startswith("Category:")}


def dj_of(mix):
    # MixesDB titles look like "2014-12-18 - Joris Voorn - 2014 Year Mix" or "... - Max Graham @ Cielo, NYC (...)"
    parts = mix["title"].split(" - ")
    who = parts[1] if len(parts) > 1 else mix["title"]
    return re.split(r"\s+@\s+", who)[0].strip().lower()


def select(mixes, a):
    want = set(a.genres)
    pool = []
    for m in mixes:
        year = m["title"][:4]
        if not year.isdigit() or int(year) < a.since:
            continue
        if m["audio_source"] not in SOURCES or not (genres_of(m) & want):
            continue
        if m["num_available_transitions"] < a.min_transitions:
            continue
        ident = m["num_identified_tracks"] / max(1, m["num_total_tracks"])
        if ident < 0.7:
            continue
        pool.append((m["num_available_transitions"] * ident, m))
    pool.sort(key=lambda x: -x[0])
    per_dj, chosen = Counter(), []
    for _, m in pool:
        if per_dj[dj_of(m)] >= a.max_per_dj:
            continue
        per_dj[dj_of(m)] += 1
        chosen.append(m)
        if len(chosen) >= a.mixes:
            break
    return chosen, len(pool)


def ytdlp(url, out_stem, archive, log):
    """One download through yt-dlp. Returns True on success. Never overwrites an existing file."""
    if list(out_stem.parent.glob(out_stem.name + ".*")):
        return True
    cmd = ["yt-dlp", "-f", "bestaudio/best", "--no-playlist", "--no-overwrites", "--continue", "--retries", "3",
           "--sleep-requests", "1", "--sleep-interval", "2", "--max-sleep-interval", "6",
           "--download-archive", str(archive), "-o", f"{out_stem}.%(ext)s", url]
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok = r.returncode == 0 and bool(list(out_stem.parent.glob(out_stem.name + ".*")))
    with open(log, "a") as f:
        f.write(json.dumps({"url": url, "out": out_stem.name, "ok": ok, "err": r.stderr.strip()[-400:] if not ok else ""}) + "\n")
    return ok


def raveform():
    z = fetch(RAVEFORM_URL, RAW / "raveform" / "raveform.zip")
    dest = RAW / "raveform" / "unzipped"
    if not dest.exists():
        with zipfile.ZipFile(z) as zf:
            for name in zf.namelist():                     # refuse paths that would escape the folder
                if name.startswith("/") or ".." in Path(name).parts:
                    sys.exit(f"refusing suspicious path in raveform.zip: {name}")
            zf.extractall(dest)
    # Write a schema summary so the next session can build the join without guessing field names.
    lines, parsed = [], 0
    for p in sorted(dest.rglob("*")):
        if p.is_file():
            lines.append(f"{p.relative_to(dest)}  {p.stat().st_size} bytes")
            if p.suffix in (".json", ".jsonl") and parsed < 8:
                parsed += 1
                try:
                    obj = json.loads(p.read_text().splitlines()[0]) if p.suffix == ".jsonl" else json.loads(p.read_text())
                    sample = obj[0] if isinstance(obj, list) and obj else obj
                    lines.append("    keys: " + (", ".join(list(sample)[:30]) if isinstance(sample, dict) else type(sample).__name__))
                except Exception as e:                       # summary only; never fatal
                    lines.append(f"    (could not parse: {e})")
            elif p.suffix in (".csv", ".tsv", ".txt"):
                with open(p, errors="replace") as f:
                    lines.append("    first line: " + f.readline().strip()[:300])
    (WORK).mkdir(parents=True, exist_ok=True)
    (WORK / "raveform_schema.txt").write_text("\n".join(lines[:400]) + "\n")
    print(f"  Raveform unpacked to {dest}; schema summary in data/work/raveform_schema.txt ({len(lines)} lines)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--go", action="store_true", help="actually download audio (default is a dry run)")
    ap.add_argument("--raveform", action="store_true", help="only fetch and unpack Raveform's annotations")
    ap.add_argument("--mixes", type=int, default=250)
    ap.add_argument("--since", type=int, default=2012)
    ap.add_argument("--genres", type=lambda s: [g.strip() for g in s.split(",")], default=GENRES)
    ap.add_argument("--max-per-dj", type=int, default=3)
    ap.add_argument("--min-transitions", type=int, default=8)
    ap.add_argument("--no-tracks", action="store_true")
    a = ap.parse_args()

    if a.raveform:
        return raveform()

    meta = json.loads(fetch(DJMIX_URL, RAW / "djmix" / "djmix-dataset.json").read_text())
    chosen, pool = select(meta, a)
    tracks = sorted({t["id"] for m in chosen for t in m["tracklist"] if t.get("id")})
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "subset.json").write_text(json.dumps({"args": vars(a), "mixes": [m["id"] for m in chosen], "tracks": tracks}, indent=1))

    # rough size: assume ~70 min per mix when the tracklist gives no length
    gb = (len(chosen) * 70 * EST_MB["mix_per_min"] + (0 if a.no_tracks else len(tracks) * EST_MB["track"])) / 1024
    src = Counter(m["audio_source"] for m in chosen)
    print(f"DJ Mix Dataset: {len(meta)} mixes; {pool} match {', '.join(a.genres)} since {a.since} with >= {a.min_transitions} transitions")
    print(f"Chosen: {len(chosen)} mixes ({dict(src)}), {sum(m['num_available_transitions'] for m in chosen)} transitions, {len(tracks)} unique tracks")
    print(f"Estimated download: ~{gb:.0f} GB{' (mixes only)' if a.no_tracks else ''}. Free space: {shutil.disk_usage(DATA).free / 2**30:.0f} GB")
    print("Written: data/work/subset.json")
    if not a.go:
        print("\nDry run. Nothing downloaded. Add --go to download (rerun any time to resume).")
        return
    for tool in ("yt-dlp", "ffmpeg"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found. Install with: brew install ffmpeg yt-dlp")
    if gb * 1.2 > shutil.disk_usage(DATA).free / 2**30:
        sys.exit("Not enough free disk space for this subset. Lower --mixes or add --no-tracks.")

    log, archive = WORK / "download_log.jsonl", WORK / "ytdlp_archive.txt"
    mdir, tdir = RAW / "audio" / "mixes", RAW / "audio" / "tracks"
    mdir.mkdir(parents=True, exist_ok=True); tdir.mkdir(parents=True, exist_ok=True)
    ok = fail = 0; t0 = time.time()
    jobs = [(m["audio_url"], mdir / m["id"]) for m in chosen]
    if not a.no_tracks:
        jobs += [(f"https://www.youtube.com/watch?v={t}", tdir / t) for t in tracks]
    for i, (url, stem) in enumerate(jobs, 1):
        if ytdlp(url, stem, archive, log):
            ok += 1
        else:
            fail += 1
        if i % 10 == 0 or i == len(jobs):
            print(f"  {i}/{len(jobs)}  ok {ok}  failed {fail}  ({(time.time() - t0) / 60:.0f} min)")
    print(f"Done: {ok} downloaded, {fail} failed (dead links are normal for older mixes; see data/work/download_log.jsonl)")


if __name__ == "__main__":
    main()
