# Anatomy: test song set (v8, platform phase)

_Created 2026-10-07; measured 2026-10-08. Matt downloads the songs; the analysis runs on them. Tempo, key and length
are as published (Beatport for DJ versions, songbpm.com otherwise). Anatomy measures its own values, and disagreements
are part of the test. In the repo, the machine-readable list is `tests/songs.manifest.json`._

## Measured 2026-10-08 (v7 profiler and drop detector, `npm run test:songs`)
Decoded with ffmpeg at 44.1 kHz and analyzed in Node exactly as the Mix tab does. "?" marks a drop or hit with
confidence under 0.6. "Gap-only" counts the engine's silence moments that had no bass return (confidence 0.30,
impact 0); they're not in the drop column because on house tracks they fire at 8-bar phrase ends.

| Song | Length | BPM measured / published | Key measured / published | LUFS | Sung | Drops and hits (mm:ss; ? = low confidence) | Gap-only |
|---|---|---|---|---|---|---|---|
| FISHER – Losing It | 4:09 | 125.0 / 125: match | G major (9B) / G major: match | -8.8 | 19% | 0:15 drop, 1:16 drop, 2:02 drop, 3:19 drop |  |
| Mau P – Drugs From Amsterdam | 2:26 | 125.0 / 125: match | E♭ major (5B) / E♭ major: match | -8.6 | 73% | 0:29 drop, 1:46 drop | 1 |
| Avicii – Levels | 5:39 | 126.0 / 126: match | E major (12B) / E major / C♯ minor: match | -9.5 | 82% | 0:30 drop, 1:24 drop, 2:10 drop, 4:19 drop, 5:05 drop |  |
| Martin Garrix – Animals | 5:05 | 128.0 / 128: match | F major (7B) / F major: match | -9.0 | 36% | 0:30 drop, 1:52 drop, 3:15 drop | 8 |
| Eric Prydz – Opus | 5:27 | 126.0 / 128: off by -1.6% | A major (11B) / A major: match | -11.2 | 94% | 2:00 hit?, 3:10 hit?, 4:00 hit? |  |
| Chris Lake & Alexis Roberts – Turn Off The Lights | 3:32 | 125.0 / 125: match | E minor (9A) / B minor: neighbor (one step on the wheel) | -9.0 | 82% | 0:34 drop, 1:20 drop, 2:52 drop | 8 |
| Swedish House Mafia ft. John Martin – Don't You Worry Child | 5:35 | 129.0 / 129: match | D major (10B) / D major: match | -11.5 | 89% | 0:37 drop, 1:36 drop, 2:21 drop, 3:39 drop, 4:09 hit? |  |
| deadmau5 – Strobe | 10:37 (cut at 10:00) | 128.0 / 128 (or 88): match | A♭ minor (1A) / A♭ minor: match | -10.3 | 26% | 4:26 drop, 6:48 drop |  |
| Peggy Gou – (It Goes Like) Nanana | 6:08 | 130.0 / 130: match | C minor (5A) / C minor: match | -8.3 | 86% | 2:56 drop, 4:46 drop | 2 |
| Dom Dolla – girl$ | 5:33 | 134.0 / 134: match | G major (9B) / G major: match | -8.7 | 58% | 1:40 drop, 3:34 drop | 2 |
| Disclosure ft. Sam Smith – Latch | 4:17 | 122.0 / 122: match | A♭ major (4B) / C♯ major: neighbor (one step on the wheel) | -8.7 | 70% | 1:04 drop, 1:20 hit, 2:39 drop | 2 |
| Fred again.. & The Blessed Madonna – Marea (We've Lost Dancing) | 4:45 | 123.0 / 123: match | A♭ major (4B) / F minor: relative (same notes) | -8.5 | 46% | 0:48 drop, 2:53 drop, 3:40 hit | 1 |
| Calvin Harris – Feel So Close | 3:27 | 128.0 / 128: match | G major (9B) / —: not published | -7.5 | 86% | 0:45 drop, 1:45 drop, 2:45 drop? |  |
| Skrillex, Fred again.. & Flowdan – Rumble | 2:27 | 140.0 / 140: match | F minor (4A) / G♭ minor: different | -8.3 | 42% | 0:19 drop, 1:14 hit? | 6 |
| Kelly Clarkson – Since U Been Gone | 3:09 | 131.0 / 131: match | G major (9B) / G major: match | -8.7 | 80% | 0:44 hit?, 1:32 hit?, 2:12 drop |  |
| Justin Bieber ft. Nicki Minaj – Beauty And A Beat | 3:48 | 128.0 / 128: match | C major (8B) / C major: match | -14.0 | 87% | 0:08 drop, 1:01 hit, 2:16 hit | 1 |
| John Summit & Hayla – Where You Are | 3:56 | 126.0 / 126: match | A minor (8A) / A minor: match | -8.3 | 81% | 0:17 drop, 1:03 drop, 1:33 drop, 3:05 drop |  |
| Drake – Pipe Down | 3:26 | 77.5 / 77.5: match | C♯ minor (12A) / C♯ minor: match | -9.1 | 84% | 0:06 drop? | 3 |
| Rihanna – Where Have You Been | 4:05 | 128.0 / —: not published | C minor (5A) / —: not published | -10.4 | 89% | 0:19 drop, 1:16 drop, 2:46 drop | 2 |
| Troye Sivan – Rush | 3:42 | 126.0 / —: not published | B♭ major (6B) / —: not published | -8.1 | 54% | 0:54 drop | 3 |

**Tempo:** 17 of the 18 songs with a published tempo match it exactly, including Strobe, where Anatomy settles the
128-vs-88 disagreement at **128**. The exception is **Opus at 126.0 vs 128**, and Anatomy's own grid drifts 71 ms over
the song there, so the 126 is most likely Anatomy's error (or this radio edit is at a different speed). Tap it to check.

**Key:** 13 of the 17 published keys match exactly. Marea reads as A♭ major, the relative major of the published F minor (same notes, so the
same for mixing). Two read **one step away on the wheel**: Turn Off The Lights (E minor vs B minor) and Latch (A♭ major
vs C♯ major). One reads **a semitone away**: Rumble (F minor vs G♭ minor), the only real disagreement.

**The four v7 songs reproduce v7.** Kelly 0:44 / 1:32 / 2:12, John 0:17 / 1:03 / 1:33 / 3:05, Bieber 0:08 plus hits.
Bieber's hits print 1:01 and 2:16 here vs 1:00 and 2:15 in the v7 notes: they're at 60.7 and 135.7 s, so that's
rounding, not a change.

**Grid confidence worth knowing:** where each bar starts is a low-confidence guess on Feel So Close (0.05), Nanana
(0.13), Rush (0.15), Losing It (0.22) and Turn Off The Lights (0.36). A wrong bar start shifts cue points by whole
beats, so check the "1" of the drops on those songs. The grid drifts (not steady) on Opus (71 ms), Strobe (81 ms),
Drake (69 ms) and Rush (66 ms).

**Vocals:** the detector calls **Opus 94% sung, Levels 82% and Nanana 86%**. Opus is instrumental and Levels is mostly
a synth lead around a short vocal sample, so the detector is reading lead synths as singing (tech debt #15). This
matters for transitions: the one-voice floors then block Intermediate and Advanced ideas on instrumental house, too.

### Timestamps to check by ear
Write down every drop you hear, including ones missing here, to the nearest second.

**Check first (the detector is least sure, or the result is surprising):**
1. **Opus:** 2:00, 3:10, 4:00. Only low-confidence chorus-type hits, no full drop. Is there a real drop in this radio edit, and where?
2. **Marea:** 0:48, 2:53. The song was picked for having *no conventional drop*, yet both read as full drops at confidence 1.00 and 0.99.
3. **Strobe:** 4:26, 6:48. Where does the long build actually release?
4. **Animals:** 0:30, 1:52, 3:15. Do these land right after the silence?
5. **Rumble:** 0:19, and 1:14 (low confidence). Half-time drop shape.
6. **Kelly:** 0:44 and 1:32 (low-confidence chorus hits), 2:12.
7. **Nanana:** 2:56, 4:46. Nothing found in the first 2:56. Is there an earlier drop?
8. **Losing It** (bar start uncertain): 0:15, 1:16, 2:02, 3:19. Is each one on the "1"?

**Then the rest:**
- Drugs From Amsterdam: 0:29, 1:46
- Levels: 0:30, 1:24, 2:10, 4:19, 5:05
- Turn Off The Lights: 0:34, 1:20, 2:52
- Don't You Worry Child: 0:37, 1:36, 2:21, 3:39, and 4:09 (low confidence)
- girl$: 1:40, 3:34
- Latch: 1:04, 1:20 (hit), 2:39
- Feel So Close: 0:45, 1:45, and 2:45 (low confidence)
- Where Have You Been: 0:19, 1:16, 2:46
- Rush: 0:54
- Pipe Down: 0:06 (low confidence)
- Beauty And A Beat: 0:08, 1:01 (hit), 2:16 (hit)
- Where You Are: 0:17, 1:03, 1:33, 3:05

## Received 2026-10-08: version check (unchanged on 2026-10-08 evening)
All 14 songs arrived. Lengths and bitrates were checked with ffprobe; "published length" is the length of the DJ
version. **#1, #2 and #5 are still the short versions** (rechecked: 4:09, 2:26 and 5:28), and Strobe (10:37) is longer
than the Mix tab's 600 s cap, so only its first 10:00 is analyzed.

| # | File received | Length | kbps | Status |
|---|---|---|---|---|
| 1 | FISHER – Losing It (Official Audio) | 4:09 | 192 | **Wrong version.** This is the radio edit; the Extended is 6:40. The DJ intro and outro are missing. |
| 2 | Mau P – Drugs From Amsterdam (Official Music Video) | 2:26 | 192 | **Wrong version.** This is the video edit; the Extended Mix is 5:23. It's half the length and may include video sound effects. |
| 3 | Avicii – Levels (Original Version) | 5:39 | 192 | OK |
| 4 | Martin Garrix – Animals (Original Mix) | 5:05 | 192 | OK |
| 5 | Eric Prydz – Opus (Radio edit) | 5:28 | 192 | **Wrong version.** The Original Mix is 9:03, and its long build is the reason the song is in the set. |
| 6 | Chris Lake & Alexis Roberts – Turn Off The Lights | 3:32 | **122** | Usable, but the bitrate is low and this is the radio length. |
| 7 | SHM ft. John Martin – Don't You Worry Child (Official Video) | 5:35 | 192 | Video version (the Original Mix is 6:43). It may have non-music audio. Check it. |
| 8 | deadmau5 – Strobe | 10:37 | 192 | OK (the full original). **Over the 600 s analysis cap.** |
| 9 | Peggy Gou – (It Goes Like) Nanana | 6:08 | 192 | OK (the Original Mix length) |
| 10 | Dom Dolla – girl$ (Extended Mix) | 5:33 | 192 | OK |
| 11 | Disclosure – Latch ft. Sam Smith | 4:17 | **134** | Usable, but the bitrate is low. |
| 12 | Fred again.. & The Blessed Madonna – Marea | 4:45 | 192 | OK |
| 13 | Calvin Harris – Feel So Close (Lyrics) | 3:27 | 192 | Usable. This is the lyric-video upload, shorter than the 3:45 listed. |
| 14 | Skrillex, Fred again.. & Flowdan – Rumble | 2:27 | 192 | OK |

**Next step for Matt:** re-download #1, #2 and #5 as the Extended or Original Mix. Until then, the radio edits are
fine for testing the drop detector but not for testing transitions.

## Why these songs
Each song is here for a **role**: a drop shape the detector must catch, a tempo or key relationship the engine reasons
about, how much singing it has, or DJ-version structure. The focus is house/EDM (Matt's decision), with a few
contrasts. Most are tracks real DJs actually play, so the transitions can be judged against how DJs mix them.

## How to download
- **Prefer the DJ version**: "Extended Mix" or "Original Mix", not the radio edit. DJ versions have the 16–32 bar drum intros and outros real transitions use.
- **Name the files `Artist - Title (Mix).mp3`.** The lyric and title code reads the filename. Add the filename to `tests/songs.manifest.json`.
- **Quality:** 256–320 kbps mp3, or wav/aiff/flac. Avoid "lyric video" or live versions with cut intros.
- Put them in `~/Downloads`, or set `ANATOMY_SONGS` / `tests/songs.local.json`.

## Tier 1: get these first (6)
| # | Song (version) | BPM | Key (published) | Length | Role |
|---|---|---|---|---|---|
| 1 | FISHER – Losing It (Extended) | 125 | G major | 6:40 | The archetypal tech-house drop: the bass leaves for a breakdown and slams back. Almost no vocals. |
| 2 | Mau P – Drugs From Amsterdam (Extended Mix) | 125 | E♭ major | 5:23 | Tech house with vocal chops. Same tempo as Losing It, so a pure drop and key test. |
| 3 | Avicii – Levels (Original Version) | 126 | E major / C♯ minor | 5:38 | The classic riser build into a drop, with the bass kept under the riser (the shape v6 missed). |
| 4 | Martin Garrix – Animals (Original Mix) | 128 | F major | 5:04 | Instrumental big room with a silence right before the drop: tests the silence switch and fake-out. |
| 5 | Eric Prydz – Opus (Original Mix) | 128 | A major | 9:03 | A very long build into one huge drop. Tests the 32-bar build cap and long launches. |
| 6 | Chris Lake & Alexis Roberts – Turn Off The Lights (Original Mix) | 125 | B minor | 3:31 (radio) | Vocal tech house with an exposed vocal breakdown. Tests the one-voice rules on house. |

## Tier 2 (8)
| # | Song (version) | BPM | Key (published) | Length | Role |
|---|---|---|---|---|---|
| 7 | Swedish House Mafia ft. John Martin – Don't You Worry Child (Original Mix) | 129 | D major | 6:43 | A vocal festival anthem with a big breakdown and drop. |
| 8 | deadmau5 – Strobe (Original Mix) | 128 (songbpm); Beatport lists 88 | A♭ minor | 10:33 | A roughly 3-minute build. The sources disagree on tempo; **Anatomy's grid says 128.** |
| 9 | Peggy Gou – (It Goes Like) Nanana (Original Mix) | 130 | C minor | 6:07 | Melodic house with a long intro. 130 against 125–126 is a 3–4% stretch. |
| 10 | Dom Dolla – girl$ (Extended) | 134 | G major | — | Faster house/techno. 134 against 125 is about 7%, the edge of beatmatching. |
| 11 | Disclosure – Latch | 122 | C♯ major | 4:17 | Vocal-heavy, garage-tinged groove. Stresses the grid, the drop detector and the voice rule. |
| 12 | Fred again.. & The Blessed Madonna – Marea (We've Lost Dancing) | 123 | F minor | 4:45 | Builds from a vocal sample, with no conventional drop. Tests the fallback when there's no drop. |
| 13 | Calvin Harris – Feel So Close | 128 | — | 3:45 | EDM-pop crossover. Pairs with Rihanna's "Where Have You Been" (same producer, same era). |
| 14 | Skrillex, Flowdan & Fred again.. – Rumble | 140 | G♭ minor | 2:26 | 140 half-time dubstep/grime: a different drop shape, the half-time relation, and an 11% gap to house (no beatmatch). |

## Already in Downloads
Kelly Clarkson – Since U Been Gone (pop-rock 131), Justin Bieber – Beauty And A Beat (EDM-pop 128), John Summit & Hayla –
Where You Are (house 126), Drake – Pipe Down (hip-hop 77.5), Rihanna – Where Have You Been (EDM-pop), Troye Sivan – Rush
(dance-pop). The tempo and key listed for the first four are the values from the v7 notes, not a published source.

## Test pairs (Track 1 → Track 2)
| Pair | What it tests |
|---|---|
| Losing It → Drugs From Amsterdam | The tech-house standard: same tempo, bass-return drops. Should produce double drops and drop swaps. |
| Drugs From Amsterdam → Turn Off The Lights | Into a vocal track at the same tempo: the one-voice rules on house. |
| Levels → Animals | Riser drop → silence drop at 126 → 128: fake-out and silence switch. |
| Animals → Don't You Worry Child | Instrumental → vocal anthem at 128 → 129. |
| Strobe → Opus | Long progressive builds: build into build, long blends. |
| Where You Are → Nanana | Melodic house, a 3% stretch. |
| girl$ → Losing It | A 7% tempo gap: the beatmatch edge, ramps and tempo ride. |
| Where Have You Been → Feel So Close | EDM-pop crossover from the same producer. |
| Latch → Marea | Vocal-heavy into "no drop": the fallback landings. |
| Rumble → Animals | No beatmatch possible: echo, wash and tape stop into a big-room drop. |

Every pair also runs reversed (Swap). Results: `04-results-2026-10-08.md`.

## What gets measured on each pair
- **Drops vs. ear:** Matt marks where he hears the drops (list above), and Anatomy's drop list is compared against them. Raveform's expert labels come later.
- **The preview harness** (`docs/testing.md`): beat phase, two basslines, vocal clash, cut words, dead air, loudness steps, peaks, the bass jump at the landing, and how long both songs play at full level together.
- **Matt's ratings** of the top 3 previews per level, once the rating control exists.

## Sources
- Beatport track pages (BPM, key, length): Losing It (Extended), Drugs From Amsterdam (Extended Mix), Animals (Original Mix), Don't You Worry Child (Original Mix), Levels (Original Version), Strobe (Original Mix), Opus (Original Mix), Rumble, (It Goes Like) Nanana (Original Mix); Dom Dolla's track list for girl$.
- songbpm.com: Turn Off The Lights, Latch, Marea, Feel So Close, Strobe, Levels, Animals.
