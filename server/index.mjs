#!/usr/bin/env node
// Anatomy local server: serves web/ on http://127.0.0.1:PORT and holds the
// place for the server-side Claude API call (not wired yet, by decision:
// the Claude API comes after the data pipeline; see docs/roadmap.md).
//
//   npm start            (or: node server/index.mjs)
//
// No dependencies. Binds to 127.0.0.1 only, so nothing outside this Mac can reach it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(root, 'web');
const ENV = join(root, '.env');

// .env is gitignored. Node >= 20.12 parses it natively; the key is never logged or sent to the page.
if (existsSync(ENV)) process.loadEnvFile(ENV);
const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// --- API -------------------------------------------------------------------
// POST /api/creative: the future "creativity dial". The plan (docs/roadmap.md):
// the page sends the measured analysis plus Anatomy's candidate plans; the server
// asks Claude to propose or rank creative variants; the measured sound check keeps
// a veto. Until the data pipeline exists this returns 501 and says whether a key is set.
async function creative(req, res) {
  send(res, 501, {
    error: 'not_implemented',
    message: 'The Claude API call is a stub. It is wired after the data pipeline (docs/roadmap.md).',
    keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY)
  });
}

const routes = {
  'GET /api/health': (req, res) => send(res, 200, { ok: true }),
  'POST /api/creative': creative
};

// --- static files from web/ --------------------------------------------------
async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'bad_path' }); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(WEB, rel));
  if (file !== WEB && !file.startsWith(WEB + sep)) return send(res, 403, { error: 'forbidden' });
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch { send(res, 404, { error: 'not_found' }); }
}

export const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${HOST}`);
  const route = routes[`${req.method} ${pathname}`];
  if (route) return route(req, res);
  if (pathname.startsWith('/api/')) return send(res, 404, { error: 'no_such_route' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
  return serveStatic(req, res, pathname);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, HOST, () => console.log(`Anatomy: http://${HOST}:${PORT}/  (Claude API key ${process.env.ANTHROPIC_API_KEY ? 'set' : 'not set'}; the API route is a stub)`));
}
