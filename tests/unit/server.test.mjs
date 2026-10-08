import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../../server/index.mjs';

let base;
before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise((r) => server.close(r)));

test('serves the page and its scripts', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<script src="js\/mix\.js"><\/script>/);
  const js = await fetch(`${base}/js/mix.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('health route', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true });
});

test('Claude route is a stub that never echoes the key', async () => {
  const r = await fetch(`${base}/api/creative`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 501);
  const body = await r.text();
  assert.match(body, /not_implemented/);
  if (process.env.ANTHROPIC_API_KEY) assert.ok(!body.includes(process.env.ANTHROPIC_API_KEY));
});

test('nothing outside web/ is served', async () => {
  for (const p of ['/%2e%2e/package.json', '/..%2fpackage.json', '/%2e%2e/.env', '/js/../../server/index.mjs']) {
    const r = await fetch(`${base}${p}`);
    assert.ok(r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
  }
});

test('unknown API routes and writes are refused', async () => {
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/index.html`, { method: 'PUT', body: 'x' })).status, 405);
});
