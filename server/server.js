/* ThesisMaster platform server — auth, per-user store, quotas, Anthropic proxy, GDPR endpoints.
   Run: cp .env.example .env (fill it) && npm install && node server.js */
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const { ANTHROPIC_API_KEY, JWT_SECRET, PORT = 3000 } = process.env;
if (!ANTHROPIC_API_KEY || !JWT_SECRET) { console.error('Set ANTHROPIC_API_KEY and JWT_SECRET in .env'); process.exit(1); }

const db = new Database(path.join(__dirname, 'thesismaster.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free', created INTEGER);
CREATE TABLE IF NOT EXISTS store (user_id INTEGER, key TEXT, value TEXT, updated INTEGER,
  PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS usage (user_id INTEGER, day TEXT, calls INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS feedback (user_id INTEGER, ts INTEGER, payload TEXT);
`);

const QUOTAS = { free: 25, pro: 300 }; // AI calls per day
const app = express();
app.use(express.json({ limit: '4mb' }));

/* ---- serve the app ---- */
app.use(express.static(path.join(__dirname, 'public'))); // put thesismaster.html here as index.html

/* ---- auth ---- */
const sign = u => jwt.sign({ uid: u.id, email: u.email }, JWT_SECRET, { expiresIn: '30d' });
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Sign in required' }); }
}
const emailOk = e => /^\S+@\S+\.\S+$/.test(e || '');

app.post('/api/auth/register', (req, res) => {
  const { email, pass } = req.body || {};
  if (!emailOk(email) || !pass || pass.length < 8) return res.status(400).json({ error: 'Valid email and 8+ char password required' });
  try {
    const info = db.prepare('INSERT INTO users (email, hash, created) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), bcrypt.hashSync(pass, 12), Date.now());
    res.json({ token: sign({ id: info.lastInsertRowid, email }) });
  } catch (e) { res.status(409).json({ error: 'An account with that email already exists' }); }
});
app.post('/api/auth/login', (req, res) => {
  const { email, pass } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(pass || '', u.hash)) return res.status(401).json({ error: 'Wrong email or password' });
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
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    db.prepare('INSERT INTO usage (user_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1')
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

/* ---- payments (Paddle webhook stub: verify signature, upgrade plan) ---- */
app.post('/api/paddle/webhook', express.urlencoded({ extended: true }), (req, res) => {
  // TODO before going live: verify the Paddle signature with your public key.
  const email = (req.body && (req.body.email || req.body.customer_email) || '').toLowerCase();
  const event = req.body && (req.body.alert_name || req.body.event_type) || '';
  if (email && /subscription_(created|payment_succeeded)|transaction\.completed/.test(event)) {
    db.prepare("UPDATE users SET plan = 'pro' WHERE email = ?").run(email);
  }
  if (email && /subscription_cancelled|subscription\.canceled/.test(event)) {
    db.prepare("UPDATE users SET plan = 'free' WHERE email = ?").run(email);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('ThesisMaster platform on :' + PORT + ' — put thesismaster.html at public/index.html'));
