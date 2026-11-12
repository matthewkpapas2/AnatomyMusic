// Resolve test songs from tests/songs.manifest.json to files on this machine.
// Folder: $ANATOMY_SONGS, else tests/songs.local.json {"dir": "..."} (gitignored), else ~/Downloads.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './anatomy.mjs';

export const manifest = JSON.parse(readFileSync(join(ROOT, 'tests/songs.manifest.json'), 'utf8'));

export function songsDir() {
  if (process.env.ANATOMY_SONGS) return process.env.ANATOMY_SONGS;
  const local = join(ROOT, 'tests/songs.local.json');
  if (existsSync(local)) return JSON.parse(readFileSync(local, 'utf8')).dir.replace(/^~(?=\/|$)/, homedir());
  return join(homedir(), 'Downloads');
}

export function song(id) {
  const s = manifest.songs.find((x) => x.id === id);
  if (!s) throw new Error(`unknown song id "${id}" (see tests/songs.manifest.json)`);
  const path = join(songsDir(), s.file);
  return { ...s, path, present: existsSync(path) };
}

export const allSongs = () => manifest.songs.map((s) => song(s.id));
