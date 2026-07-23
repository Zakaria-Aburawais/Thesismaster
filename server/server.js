/* ThesisMaster platform server — auth, per-user store, quotas, Anthropic proxy, GDPR endpoints.
   Run: cp .env.example .env (fill it) && npm install && node server.js */
require('dotenv').config();
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const { ANTHROPIC_API_KEY, JWT_SECRET, PADDLE_WEBHOOK_SECRET, PORT = 3000 } = process.env;
if (!ANTHROPIC_API_KEY || !JWT_SECRET) { console.error('Set ANTHROPIC_API_KEY and JWT_SECRET in .env'); process.exit(1); }

// TM_DB_PATH / ANTHROPIC_API_URL exist for the test suite; production uses the defaults.
const db = new Database(process.env.TM_DB_PATH || path.join(__dirname, 'thesismaster.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free', created INTEGER);
CREATE TABLE IF NOT EXISTS store (user_id INTEGER, key TEXT, value TEXT, updated INTEGER,
  PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS usage (user_id INTEGER, day TEXT, calls INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS feedback (user_id INTEGER, ts INTEGER, payload TEXT);
CREATE TABLE IF NOT EXISTS auth_fails (email TEXT PRIMARY KEY, fails INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0);
`);

const QUOTAS = { free: 25, pro: 300 }; // AI calls per day
const app = express();
app.set('trust proxy', 1); // first hop only (Hostinger/nginx) so req.ip is the client, not the proxy
// verify() keeps the raw bytes: Paddle's HMAC must be computed over the exact
// request body, and the parsed-then-restringified object would not match.
app.use(express.json({ limit: '4mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

/* ---- abuse control ---- */
// Per-IP: 30 auth attempts / 15 min. Per-email lockout below survives restarts (DB-backed).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts — try again in a few minutes' } });
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
const lockRow = email => db.prepare('SELECT fails, locked_until FROM auth_fails WHERE email = ?').get(email);
function noteAuthFail(email) {
  const r = lockRow(email), fails = (r ? r.fails : 0) + 1;
  db.prepare('INSERT INTO auth_fails (email, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until')
    .run(email, fails, fails >= LOCK_AFTER ? Date.now() + LOCK_MS : (r ? r.locked_until : 0));
}
const clearAuthFails = email => db.prepare('DELETE FROM auth_fails WHERE email = ?').run(email);
const isLocked = email => { const r = lockRow(email); return r && r.locked_until > Date.now(); };

/* ---- security headers (S3) ---- */
// The app is ONE file with ONE inline <script>: hash it at boot so script-src
// can be strict — no 'unsafe-inline' for scripts anywhere. Inline style
// attributes are part of the app's design, so style-src keeps 'unsafe-inline'
// (script injection is the threat model that matters; see docs/AUDIT-baseline.md S3).
const PUBLIC_DIR = [path.join(__dirname, 'public'), path.join(__dirname, '..', 'public')]
  .find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, 'public');
/* The inline-script hash must track the FILE, not the boot: deploying a new
   index.html without restarting would otherwise silently kill the whole app
   (CSP blocks the changed script). Recomputed only when mtime changes. */
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
let hashCache = { mtime: 0, value: null };
function scriptHash() {
  try {
    const mtime = fs.statSync(INDEX_PATH).mtimeMs;
    if (mtime !== hashCache.mtime) {
      const m = fs.readFileSync(INDEX_PATH, 'utf8').match(/<script>([\s\S]*)<\/script>/);
      hashCache = { mtime, value: m ? "'sha256-" + require('crypto').createHash('sha256').update(m[1]).digest('base64') + "'" : null };
    }
  } catch (e) { hashCache = { mtime: 0, value: null }; }
  return hashCache.value;
}
if (!scriptHash()) console.warn('CSP: no public/index.html found — inline script hash omitted');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', (req, res) => scriptHash() || "'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  strictTransportSecurity: { maxAge: 15552000, includeSubDomains: true }, // 180 days
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false, // COEP would block nothing here but can break embeds
}));
// behind the host's TLS terminator: force HTTPS (no-op for direct local traffic)
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  next();
});

/* ---- serve the app ---- */
app.use(express.static(PUBLIC_DIR)); // put thesismaster.html here as index.html

/* ---- auth ---- */
const sign = u => jwt.sign({ uid: u.id, email: u.email }, JWT_SECRET, { expiresIn: '30d' });
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    // a signed token must not outlive its account: GDPR deletion ends access NOW,
    // not at token expiry 30 days later
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.user.uid)) throw new Error('gone');
    next();
  }
  catch (e) { res.status(401).json({ error: 'Sign in required' }); }
}
const emailOk = e => /^\S+@\S+\.\S+$/.test(e || '');

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { email, pass } = req.body || {};
  if (!emailOk(email) || !pass || pass.length < 8) return res.status(400).json({ error: 'Valid email and 8+ char password required' });
  try {
    const info = db.prepare('INSERT INTO users (email, hash, created) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), bcrypt.hashSync(pass, 12), Date.now());
    res.json({ token: sign({ id: info.lastInsertRowid, email }) });
  } catch (e) { res.status(409).json({ error: 'An account with that email already exists' }); }
});
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, pass } = req.body || {};
  const em = (email || '').toLowerCase();
  if (isLocked(em)) return res.status(429).json({ error: 'Too many failed sign-ins — this account is locked for 15 minutes' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u || !bcrypt.compareSync(pass || '', u.hash)) { noteAuthFail(em); return res.status(401).json({ error: 'Wrong email or password' }); }
  clearAuthFails(em);
  res.json({ token: sign(u) });
});

/* ---- per-user document store (namespaced keys, private by design) ---- */
const KEY_OK = /^(thesis:|profiles:|settings:|feedback:)/;
app.get('/api/store/:key', auth, (req, res) => {
  if (!KEY_OK.test(req.params.key)) return res.status(400).json({ error: 'bad key' });
  const row = db.prepare('SELECT value FROM store WHERE user_id = ? AND key = ?').get(req.user.uid, req.params.key);
  if (!row) return res.status(404).end();
  res.json({ key: req.params.key, value: row.value });
});
app.put('/api/store/:key', auth, (req, res) => {
  if (!KEY_OK.test(req.params.key)) return res.status(400).json({ error: 'bad key' });
  const v = String((req.body || {}).value || '');
  if (v.length > 3_000_000) return res.status(413).json({ error: 'document too large' });
  db.prepare('INSERT INTO store (user_id, key, value, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated = excluded.updated')
    .run(req.user.uid, req.params.key, v, Date.now());
  res.json({ ok: true });
});

/* ---- Anthropic proxy with per-user daily quota ---- */
app.post('/api/claude', auth, async (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  const u = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.uid);
  const row = db.prepare('SELECT calls FROM usage WHERE user_id = ? AND day = ?').get(req.user.uid, day) || { calls: 0 };
  const limit = QUOTAS[u && u.plan] || QUOTAS.free;
  if (row.calls >= limit) return res.status(429).json({ error: 'Daily examination quota reached (' + limit + '). Upgrade or return tomorrow.' });
  const body = req.body || {};
  // hard server-side constraints: model + token ceiling are ours, not the client's
  const payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: Math.min(1000, +body.max_tokens || 1000),
    messages: body.messages
  };
  if (Array.isArray(body.tools) && body.tools.every(t => t && t.type === 'web_search_20250305')) payload.tools = body.tools;
  try {
    const r = await fetch((process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    // quota counts successful examinations only — an upstream error or
    // rate-limit must never consume the user's daily allowance
    if (r.ok) db.prepare('INSERT INTO usage (user_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1')
      .run(req.user.uid, day);
    res.status(r.status).json(j);
  } catch (e) { res.status(502).json({ error: 'The examination engine is unreachable — try again shortly.' }); }
});

/* ---- GDPR: export everything / delete everything ---- */
app.get('/api/me/export', auth, (req, res) => {
  const u = db.prepare('SELECT id, email, plan, created FROM users WHERE id = ?').get(req.user.uid);
  const docs = db.prepare('SELECT key, value, updated FROM store WHERE user_id = ?').all(req.user.uid);
  res.setHeader('Content-Disposition', 'attachment; filename="thesismaster-export.json"');
  res.json({ account: u, documents: docs, exported: new Date().toISOString() });
});
app.delete('/api/me', auth, (req, res) => {
  db.prepare('DELETE FROM store WHERE user_id = ?').run(req.user.uid);
  db.prepare('DELETE FROM usage WHERE user_id = ?').run(req.user.uid);
  db.prepare('DELETE FROM feedback WHERE user_id = ?').run(req.user.uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.uid);
  res.json({ deleted: true });
});

/* ---- payments (Paddle Billing webhook — signature-verified, fail-closed) ----
   Requires PADDLE_WEBHOOK_SECRET (Paddle dashboard → Notifications → webhook secret).
   Without it the route refuses every request: an unverified upgrade path is an
   account-privilege exploit, so this endpoint never trusts an unsigned body. */
const crypto = require('crypto');
function paddleSignatureOk(req, rawBody) {
  const header = req.headers['paddle-signature'] || '';
  const parts = Object.fromEntries(header.split(';').map(kv => kv.split('=').map(s => s.trim())).filter(p => p.length === 2));
  const ts = parts.ts, h1 = parts.h1;
  if (!ts || !h1 || Math.abs(Date.now() / 1000 - +ts) > 300) return false; // reject >5 min skew (replay)
  const expected = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET).update(ts + ':' + rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(h1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
app.post('/api/paddle/webhook', express.raw({ type: () => true, limit: '256kb' }), (req, res) => {
  if (!PADDLE_WEBHOOK_SECRET) return res.status(503).json({ error: 'webhook not configured' });
  // JSON bodies were already consumed by express.json above — use its raw copy
  const raw = (req.rawBody || req.body || Buffer.alloc(0)).toString('utf8');
  if (!paddleSignatureOk(req, raw)) return res.status(401).json({ error: 'bad signature' });
  let body; try { body = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'bad payload' }); }
  const d = body.data || {};
  const email = ((d.customer && d.customer.email) || d.customer_email || body.email || '').toLowerCase();
  const event = body.event_type || body.alert_name || '';
  if (email && /subscription\.(created|activated)|transaction\.completed|subscription_(created|payment_succeeded)/.test(event)) {
    db.prepare("UPDATE users SET plan = 'pro' WHERE email = ?").run(email);
  }
  if (email && /subscription\.canceled|subscription_cancelled/.test(event)) {
    db.prepare("UPDATE users SET plan = 'free' WHERE email = ?").run(email);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('ThesisMaster platform on :' + PORT + ' — put thesismaster.html at public/index.html'));
