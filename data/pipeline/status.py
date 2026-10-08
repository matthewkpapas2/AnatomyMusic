#!/usr/bin/env python3
"""Report what the data pipeline has on disk:  python3 data/pipeline/status.py"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]


def count(folder):
    p = DATA / folder
    return sum(1 for f in p.iterdir() if f.is_file() and not f.name.endswith(".part")) if p.exists() else 0


def main():
    meta = DATA / "raw/djmix/djmix-dataset.json"
    print(f"DJ Mix Dataset metadata : {'yes' if meta.exists() else 'no'}")
    print(f"Raveform annotations    : {'unpacked' if (DATA / 'raw/raveform/unzipped').exists() else 'no'}"
          f"{' (schema summary in data/work/raveform_schema.txt)' if (DATA / 'work/raveform_schema.txt').exists() else ''}")
    sub = DATA / "work/subset.json"
    if sub.exists():
        s = json.loads(sub.read_text())
        print(f"Subset                  : {len(s['mixes'])} mixes, {len(s['tracks'])} tracks chosen")
        print(f"Audio downloaded        : {count('raw/audio/mixes')} / {len(s['mixes'])} mixes, {count('raw/audio/tracks')} / {len(s['tracks'])} tracks")
    else:
        print("Subset                  : not chosen yet (run data/download/get_subset.py)")
    log = DATA / "work/download_log.jsonl"
    if log.exists():
        rows = [json.loads(l) for l in log.read_text().splitlines() if l.strip()]
        print(f"Download attempts       : {len(rows)} ({sum(not r['ok'] for r in rows)} failed)")


if __name__ == "__main__":
    main()
