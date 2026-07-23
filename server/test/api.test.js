'use strict';
/* API-level tests against a real running server.js with a scratch DB and a
   local mock standing in for the Anthropic API. The store-isolation test is,
   per BRIEF.md, the single most important test in the codebase. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const PADDLE_SECRET = 'test-paddle-secret';
let tmpDir, proc, base, mockUpstream, upstream;

function startServer(env, port) {
  const p = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.stderr.on('data', d => process.stderr.write('[server] ' + d));
  return p;
}
async function waitUp(url) {
  for (let i = 0; i < 100; i++) {
    try { await fetch(url); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not come up: ' + url);
}
const j = (method, path2, body, token) =>
  fetch(base + path2, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-test-'));
  // mock Anthropic upstream: /v1/messages responds per the x-mock-status the
  // test sets beforehand, and counts calls
  upstream = { status: 200, calls: 0 };
  mockUpstream = http.createServer((req, res) => {
    upstream.calls++;
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(upstream.status === 200
      ? { content: [{ type: 'text', text: 'ok' }] }
      : { error: { message: 'mock upstream error' } }));
  });
  await new Promise(r => mockUpstream.listen(3906, r));
  proc = startServer({
    ANTHROPIC_API_KEY: 'test-key-not-real',
    JWT_SECRET: 'test-jwt-secret-for-api-tests',
    PADDLE_WEBHOOK_SECRET: PADDLE_SECRET,
    TM_DB_PATH: path.join(tmpDir, 'test.db'),
    ANTHROPIC_API_URL: 'http://127.0.0.1:3906'
  }, 3905);
  base = 'http://127.0.0.1:3905/api';
  await waitUp(base + '/auth/login');
});
after(() => { try { proc.kill(); } catch (e) {} try { mockUpstream.close(); } catch (e) {} });

let tokenA, tokenB;

test('register validates email and password length', async () => {
  assert.equal((await j('POST', '/auth/register', { email: 'bad', pass: 'longenough1' })).status, 400);
  assert.equal((await j('POST', '/auth/register', { email: 'a@test.dev', pass: 'short' })).status, 400);
  const rA = await j('POST', '/auth/register', { email: 'a@test.dev', pass: 'password-A1' });
  assert.equal(rA.status, 200);
  tokenA = (await rA.json()).token;
  const rB = await j('POST', '/auth/register', { email: 'b@test.dev', pass: 'password-B1' });
  tokenB = (await rB.json()).token;
  assert.ok(tokenA && tokenB);
});

test('login works and wrong password fails', async () => {
  assert.equal((await j('POST', '/auth/login', { email: 'a@test.dev', pass: 'password-A1' })).status, 200);
  assert.equal((await j('POST', '/auth/login', { email: 'a@test.dev', pass: 'wrong-password' })).status, 401);
});

test('STORE ISOLATION: user B can never read user A\'s documents', async () => {
  const put = await j('PUT', '/store/thesis:data', { value: 'A-private-thesis' }, tokenA);
  assert.equal(put.status, 200);
  const asB = await j('GET', '/store/thesis:data', undefined, tokenB);
  assert.equal(asB.status, 404, 'same key, different user: nothing leaks');
  const asA = await j('GET', '/store/thesis:data', undefined, tokenA);
  assert.equal((await asA.json()).value, 'A-private-thesis');
});

test('store requires auth and an allowlisted key prefix', async () => {
  assert.equal((await j('GET', '/store/thesis:data')).status, 401);
  assert.equal((await j('PUT', '/store/evil:key', { value: 'x' }, tokenA)).status, 400);
  const big = await j('PUT', '/store/thesis:data', { value: 'x'.repeat(3_000_001) }, tokenA);
  assert.equal(big.status, 413, 'oversized documents rejected');
});

test('failed upstream calls do NOT consume quota; successful ones do', async () => {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(tmpDir, 'test.db'));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('b@test.dev').id;
  const calls = () => (db.prepare('SELECT calls FROM usage WHERE user_id = ?').get(uid) || { calls: 0 }).calls;

  upstream.status = 500;
  assert.equal((await j('POST', '/claude', { messages: [{ role: 'user', content: 'hi' }] }, tokenB)).status, 500);
  assert.equal(calls(), 0, 'upstream 500 must not count against the user');

  upstream.status = 200;
  assert.equal((await j('POST', '/claude', { messages: [{ role: 'user', content: 'hi' }] }, tokenB)).status, 200);
  assert.equal(calls(), 1, 'successful call counts');
  db.close();
});

test('quota exhaustion returns 429 without calling upstream', async () => {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(tmpDir, 'test.db'));
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('b@test.dev').id;
  const day = new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE usage SET calls = 25 WHERE user_id = ? AND day = ?').run(uid, day);
  db.close();
  const callsBefore = upstream.calls;
  const r = await j('POST', '/claude', { messages: [{ role: 'user', content: 'hi' }] }, tokenB);
  assert.equal(r.status, 429);
  assert.equal(upstream.calls, callsBefore, 'quota check happens before any upstream spend');
});

test('GDPR export contains the user\'s documents', async () => {
  const r = await j('GET', '/me/export', undefined, tokenA);
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.account.email, 'a@test.dev');
  assert.ok(out.documents.some(d => d.key === 'thesis:data' && d.value === 'A-private-thesis'));
});

test('GDPR delete erases account, documents, and access', async () => {
  assert.equal((await j('DELETE', '/me', undefined, tokenA)).status, 200);
  assert.equal((await j('GET', '/store/thesis:data', undefined, tokenA)).status, 401, 'token useless after erasure');
  assert.equal((await j('POST', '/auth/login', { email: 'a@test.dev', pass: 'password-A1' })).status, 401);
  const Database = require('better-sqlite3');
  const db = new Database(path.join(tmpDir, 'test.db'));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM store WHERE value = ?').get('A-private-thesis').c, 0, 'document rows physically gone');
  db.close();
});

test('account lockout after 5 failed sign-ins, even with the right password', async () => {
  await j('POST', '/auth/register', { email: 'c@test.dev', pass: 'password-C1' });
  for (let i = 0; i < 5; i++) {
    assert.equal((await j('POST', '/auth/login', { email: 'c@test.dev', pass: 'nope-' + i })).status, 401);
  }
  const locked = await j('POST', '/auth/login', { email: 'c@test.dev', pass: 'password-C1' });
  assert.equal(locked.status, 429, 'locked out despite correct credentials');
});

function paddleSig(rawBody, secret, ts) {
  ts = ts || Math.floor(Date.now() / 1000);
  const h1 = crypto.createHmac('sha256', secret).update(ts + ':' + rawBody).digest('hex');
  return 'ts=' + ts + ';h1=' + h1;
}
const paddlePost = (rawBody, sig) =>
  fetch(base + '/paddle/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(sig ? { 'Paddle-Signature': sig } : {}) },
    body: rawBody
  });

test('paddle webhook: unsigned and bad-signature requests are rejected', async () => {
  const body = JSON.stringify({ event_type: 'subscription.activated', data: { customer: { email: 'b@test.dev' } } });
  assert.equal((await paddlePost(body)).status, 401);
  assert.equal((await paddlePost(body, paddleSig(body, 'wrong-secret'))).status, 401);
  const stale = paddleSig(body, PADDLE_SECRET, Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await paddlePost(body, stale)).status, 401, 'hour-old timestamp rejected (replay)');
});

test('paddle webhook: a correctly signed event upgrades the plan', async () => {
  const body = JSON.stringify({ event_type: 'subscription.activated', data: { customer: { email: 'b@test.dev' } } });
  assert.equal((await paddlePost(body, paddleSig(body, PADDLE_SECRET))).status, 200);
  const Database = require('better-sqlite3');
  const db = new Database(path.join(tmpDir, 'test.db'));
  assert.equal(db.prepare('SELECT plan FROM users WHERE email = ?').get('b@test.dev').plan, 'pro');
  db.close();
});

test('paddle webhook fails closed when no secret is configured', async () => {
  const p2 = startServer({
    ANTHROPIC_API_KEY: 'test-key-not-real',
    JWT_SECRET: 'test-jwt-secret-for-api-tests',
    TM_DB_PATH: path.join(tmpDir, 'test2.db')
  }, 3907);
  try {
    await waitUp('http://127.0.0.1:3907/api/auth/login');
    const r = await fetch('http://127.0.0.1:3907/api/paddle/webhook', { method: 'POST', body: '{}' });
    assert.equal(r.status, 503);
  } finally { p2.kill(); }
});

test('security headers: strict CSP with hashed inline script, HSTS, nosniff', async () => {
  const r = await fetch('http://127.0.0.1:3905/');
  assert.equal(r.status, 200, 'app served from repo public/ fallback');
  const csp = r.headers.get('content-security-policy') || '';
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(/script-src [^;]*'sha256-/.test(csp), 'inline script allowed by hash, not unsafe-inline');
  assert.ok(!/script-src [^;]*'unsafe-inline'/.test(csp), 'no unsafe-inline for scripts');
  assert.ok(/font-src [^;]*data:/.test(csp), 'embedded fonts allowed');
  assert.ok(r.headers.get('strict-transport-security'), 'HSTS present');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
});

test('http behind the proxy is redirected to https', async () => {
  const r = await fetch('http://127.0.0.1:3905/', {
    headers: { 'X-Forwarded-Proto': 'http' }, redirect: 'manual'
  });
  assert.equal(r.status, 301);
  assert.ok((r.headers.get('location') || '').startsWith('https://'));
});

/* LAST: this deliberately trips the shared per-IP limiter. */
test('per-IP rate limiter trips on repeated auth attempts', async () => {
  let tripped = false;
  for (let i = 0; i < 35 && !tripped; i++) {
    const r = await j('POST', '/auth/login', { email: 'nobody@test.dev', pass: 'whatever-123' });
    if (r.status === 429) tripped = true;
  }
  assert.ok(tripped, 'limiter must return 429 within 35 attempts');
});
