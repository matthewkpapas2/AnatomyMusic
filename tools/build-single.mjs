#!/usr/bin/env node
// Inline web/ back into one self-contained HTML file (the pre-platform format).
//
//   node tools/build-single.mjs              -> writes dist/anatomy.html, prints its sha256
//   node tools/build-single.mjs --check      -> exits 1 unless the output hashes to V7_SHA256
//
// The --check mode is the proof that web/ is the v7 page split into files and
// nothing else: inlining the stylesheet and the four scripts must reproduce
// anatomy7.html byte for byte. Once web/ starts changing on purpose, the check
// is retired by moving V7_SHA256 into docs/ history (see docs/testing.md).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// sha256 of ~/Downloads/anatomy7.html as saved on 2026-10-05 (460,115 bytes).
export const V7_SHA256 = '4081c8c190069791cdb411955dc36d12738086abe2dec412c0900b97c542b14b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');

export function buildSingle() {
  const html = readFileSync(join(web, 'index.html'), 'utf8');
  let out = '', styles = 0, scripts = 0;
  for (const line of html.split(/(?<=\n)/)) {
    const css = line.match(/^<link rel="stylesheet" href="(styles\.css)">\n$/);
    const js = line.match(/^<script src="(js\/[a-z]+\.js)"><\/script>\n$/);
    if (css) { out += '<style>\n' + readFileSync(join(web, css[1]), 'utf8') + '</style>\n'; styles++; }
    else if (js) { out += '<script>\n' + readFileSync(join(web, js[1]), 'utf8') + '</script>\n'; scripts++; }
    else out += line;
  }
  if (styles !== 1 || scripts !== 4) throw new Error(`expected 1 stylesheet and 4 scripts in web/index.html, found ${styles} and ${scripts}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildSingle();
  const sha = createHash('sha256').update(out, 'utf8').digest('hex');
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'anatomy.html'), out);
  console.log(`dist/anatomy.html  ${Buffer.byteLength(out)} bytes  sha256 ${sha}`);
  if (process.argv.includes('--check')) {
    if (sha !== V7_SHA256) { console.error('FAIL: does not match anatomy7.html'); process.exit(1); }
    console.log('OK: byte-identical to anatomy7.html');
  }
}
