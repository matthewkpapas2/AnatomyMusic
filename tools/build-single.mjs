#!/usr/bin/env node
// Inline web/ back into one self-contained HTML file (the pre-platform format).
//
//   node tools/build-single.mjs              -> writes dist/anatomy.html, prints its sha256
//
// npm test runs it so the single-file build keeps working (one stylesheet, four scripts).
// Until 2026-10-09 a --check mode also proved web/ was anatomy7.html byte for byte; it was
// retired with the first intentional web/ change (docs/testing.md has the hash and the last
// commit where it passed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
}
