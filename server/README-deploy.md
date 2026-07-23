# ThesisMaster — Platform Deployment (Hostinger / any Node host)

## 1. Files
- `server.js`, `package.json`, `.env` (copy from `.env.example` and fill it)
- `public/index.html` — this is your `thesismaster.html`, renamed

## 2. Deploy (Hostinger Node.js app / any VPS)
```
npm install
node server.js        # or use the host's Node app manager / pm2
```
**Restart the Node app whenever you replace `public/index.html`** — the strict
Content-Security-Policy hashes the inline script at boot; a stale hash blocks
the new script entirely.

Serve over HTTPS (Hostinger provides SSL). The app auto-detects deployed mode:
login gate appears, all AI calls route through /api/claude (your key stays server-side),
and each user's theses live in their own rows in thesismaster.db.

## 3. What's already handled
- Auth: bcrypt-hashed passwords, 30-day JWT sessions, register + login
- Per-user private store (3MB/doc cap), profile-namespaced keys
- Daily AI quotas: free 25 calls, pro 300 (edit QUOTAS in server.js)
- GDPR: GET /api/me/export (full JSON export), DELETE /api/me (full erasure)
- Paddle webhook stub at /api/paddle/webhook — VERIFY THE SIGNATURE before going live
- Server-enforced model + 1000-token ceiling (clients cannot override)

## 4. Operations checklist before real users
- Backups: copy `thesismaster.db` nightly (it's a single file); test a restore once
- Set a strong JWT_SECRET; rotate the Anthropic key if it was ever exposed
- Add your Terms + Privacy pages stating: user owns their thesis, text is never
  used for model training, private by default — the app's Trust section promises this
- Calibration: keep 3–5 real chapters with known human grades; re-run them after any
  prompt/model change and compare to the stored Examiner v2.0 scores before shipping
- Monitor: watch usage table growth and 429 rates to tune QUOTAS
