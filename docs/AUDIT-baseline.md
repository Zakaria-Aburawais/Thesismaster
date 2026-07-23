# ThesisMaster — Phase 0 Baseline Audit

Date: 2026-07-23 · Auditor: Claude Code (Opus 4.8) · Commit audited: `e3102f4`
No code was changed to produce this document.

---

## 1. Method

- Read in full: `CLAUDE.md`, `BRIEF.md`, `docs-architecture.md`, `server/server.js`; targeted reads + pattern scans of `thesismaster.html` (escaping discipline, token handling, platform layer, render paths, dialogs, remote dependencies).
- Scanned the entire git history for secrets.
- Live smoke test: served `public/` statically on `localhost:8123` (deployed-mode path) in a real browser; measured navigation timing, verified the login gate, checked the console, verified I18N parity at runtime.

## 2. Measurements

| Metric | Value | Notes |
|---|---|---|
| `thesismaster.html` size | 437,513 B (427 KB) | gzip: 155,474 B (152 KB) — enable compression on the host |
| `public/index.html` | byte-identical to source | verified by hash |
| Top-level functions | 131 | single `<script>` block |
| Untested pure functions | **~24 (all of them — zero tests in repo)** | parseJSON, buildNorm, fuzzyFind, fuzzyReplaceAll, chunkText, sampleDoc, citationStats, uncitedParagraphs, referenceSection, duplicateBlocks, orphanQuotes, pickPlagSentences, parseReferences, parseCitationsF, splitOffsets, gradeFromAvg, docLangLine, pdfLatin, pdfWrap, strictLine, parseBibTeX, parseRIS, renumberText, bibliographyText |
| Warm load (localhost, desktop) | DOMContentLoaded 77 ms · load 125 ms | cold 7.2 s figure was server start-up, not the app |
| Console errors on load | 0 | deployed mode, landing + login gate |
| Login gate | renders correctly (`#tm-login`, fixed, z-200) | client gate is UX; real enforcement is server-side auth ✓ |
| I18N parity | 56 keys × 6 languages (en/ar/tr/id/fr/es), 0 missing | verified at runtime, not by reading code |
| `EXAMINER_VERSION` | 2.0 | |
| Validation gate | passes | JS parses, CSS braces balanced, divs balanced |
| Dialog calls (`alert/confirm/prompt`) | 0 | invariant holds |
| In-page `href="#"` | 0 | invariant holds |
| Secrets in git history | none found | scan across all commits |
| Lighthouse | **not yet measured** | no Chrome CLI in audit environment — belongs in CI (Phase 2); punch-list item |

**Escaping discipline (XSS):** 53 `innerHTML` sites, 82 `esc()` calls. Every spot-checked path that renders model output or user document text (`renderAuditReport`, dashboard cards, gap-assist, review) escapes correctly. Not exhaustively proven — a lint rule in CI should enforce it (see C6).

**Remote dependencies found:** `fonts.googleapis.com` (CSS import, graceful degradation), `cdnjs.cloudflare.com` (mammoth for .docx, documented graceful failure), `api.anthropic.com` (only inside `anthropicFetch` + server ✓).

## 3. Security risks

| # | What | Where | Severity | Effort | Suggested fix |
|---|---|---|---|---|---|
| S1 | **Paddle webhook accepts unsigned requests.** Anyone who can POST `{email, alert_name}` upgrades any account to `pro` (or downgrades it). This is an active privilege escalation the moment the server is deployed, not just a "before payments" item. | `server/server.js:118` | **Critical** | S–M | Verify the Paddle signature; reject unsigned. Match on Paddle customer ID, not raw email. Until then, comment the route out. |
| S2 | **No rate limiting or lockout on auth.** Unlimited password guesses against `/api/auth/login`; unlimited account creation. | `server/server.js:41–55` | High | S | `express-rate-limit` per-IP on `/api/auth/*` + progressive lockout per account; per-IP cap on register. |
| S3 | **No security headers, no HTTPS enforcement.** No HSTS, CSP, X-Content-Type-Options, Referrer-Policy. | `server/server.js` | High | S–M | helmet + redirect. CSP needs care: the app is one file of inline style/script — use a nonce or hash, and self-host fonts first (L2). |
| S4 | **JWT in `localStorage`.** Any future XSS miss = 30-day account takeover token exfiltrated. Currently mitigated by good escaping, but it is one missed `esc()` away. | `thesismaster.html:2381` (`tmToken`) | Medium | M | httpOnly SameSite cookie option server-side; or accept the risk consciously once CSP (S3) and the lint rule (C6) exist. |
| S5 | **30-day JWT, no revocation.** Sign-out only deletes the local copy; a stolen token stays valid for a month. | `server/server.js:33` | Medium | M | Shorter expiry + refresh, or a token-version claim checked against the user row (bump on sign-out-everywhere / password change). |
| S6 | **No password reset flow.** Locked-out users have no path back; support burden and an invitation to insecure workarounds. | server (absent) | Medium | M | Email-token reset that does not reveal account existence. |
| S7 | **Account-existence leaks.** Register returns 409 "account already exists"; login returns early on unknown email (timing). | `server/server.js:48,52–53` | Low | S | Uniform responses; always run a dummy bcrypt compare. |
| S8 | **`/api/claude` forwards arbitrary `messages`.** Model + token ceiling are pinned server-side (good), but the proxy is a generic LLM endpoint within quota — cost abuse and ToS exposure. | `server/server.js:81–88` | Low–Med | S | Schema-check shape/size of `messages`; optionally require a known prompt envelope. |
| S9 | **No lockfile, no dependency audit.** `server/package.json` has ranges only; no `package-lock.json` committed; `npm audit` never run. | `server/` | Medium | S | Commit lockfile, run `npm audit`, add Dependabot. |
| S10 | **No audit log of auth events.** Breach forensics currently impossible. | server | Low–Med | S | Append-only log of register/login/fail/delete with IP, PII-lean. |

## 4. Correctness / reliability risks

| # | What | Where | Severity | Effort | Suggested fix |
|---|---|---|---|---|---|
| C1 | **Zero automated tests.** All ~24 pure parsing/matching functions untested in-repo; the `/eval` fixtures `CLAUDE.md` references do not exist here. The fuzzy matcher and reference parsers are the highest-regression-risk code in the product. | whole repo | **High** | M | node:test suite against a real chapter fixture incl. Arabic (، ؛ «») per BRIEF Phase 2. |
| C2 | **No CI.** The validation gate and the `public/index.html` copy are manual steps — drift is a matter of time. | repo | **High** | S | GitHub Actions: validation gate + tests + byte-identity check on every push. |
| C3 | **No backups for `thesismaster.db`.** For a thesis product, data loss is product-ending. | ops | **High** | S–M | Nightly copy + one performed restore test, documented. |
| C4 | **Quota counts failed AI calls.** Usage increments even when Anthropic returns 4xx/5xx — users pay quota for errors (incl. every 429 during an outage). | `server/server.js:95–98` | Medium | S | Increment only on 2xx; never on upstream 429/5xx. |
| C5 | **Save debounce data-loss window.** 1200 ms debounce with no flush on `beforeunload`/`visibilitychange` — closing the tab right after an edit loses it. | `thesismaster.html` (`saveThesis`) | Medium | S | Flush pending save on `visibilitychange`→hidden (works on mobile too, unlike `beforeunload`). |
| C6 | **Escaping is convention, not enforcement.** 53 innerHTML sites are hand-disciplined; nothing stops the 54th from missing `esc()`. | client | Medium | S | CI lint: fail on any `innerHTML` line concatenating a variable not wrapped in `esc(`/known-safe builder. |
| C7 | **Pass loop dies with the client.** A 7-round audit run is lost if the laptop sleeps (BRIEF Phase 2 names this). | client (`runPassLoop`) | Medium | L | Server-side resumable job + polling. Defer until Phases 1–2 core is done. |
| C8 | **No health endpoint / monitoring / structured logs.** | server | Medium | S | `/api/health`, uptime check, structured logs with thesis text scrubbed. |
| C9 | **.docx upload depends on cdnjs at runtime.** Graceful failure exists, but the feature silently depends on a third party. | client (`loadMammoth`) | Low | M | Consider vendoring mammoth into the file (size cost) or documenting the dependency as accepted. |
| C10 | **Docs drift.** `docs-architecture.md` still says seven tabs/EN-AR only (superseded note exists in CLAUDE.md, but §5 is stale); `/eval` referenced but absent. | docs | Low | S | Update §5 or add the same "superseded" banner; create `eval/` when Phase 3 starts. |

## 5. Legal / IP risks

| # | What | Where | Severity | Effort | Suggested fix |
|---|---|---|---|---|---|
| L1 | **No Terms of Service or Privacy Policy, while the UI actively promises** "private to your account… never used to train models… exportable and deletable" (login gate + Trust section). Unbacked promises are worse than none. | product | **High** | M | Draft ToS + Privacy formalizing exactly what the Trust section says: ownership, no-training, retention, data location, subprocessors (Anthropic, host, Paddle), GDPR rights, contact. Needs Zak's decisions + ideally counsel review. |
| L2 | **Google Fonts loaded remotely.** Transmits visitor IPs to Google — held a GDPR violation by German courts (LG München I, 3 O 17493/20); also a privacy-promise inconsistency. | `thesismaster.html` (CSS import) | Medium | M | Self-host: subset WOFF2 for Fraunces/Manrope/IBM Plex/Arabic fonts, embed or serve locally. Include OFL license texts. |
| L3 | **Scholar portrait licensing unverified.** Six HiggsField-generated portraits embedded; commercial-use and ownership terms not recorded. A buyer's lawyer will ask. | embedded assets | Medium | S | Check HiggsField ToS for commercial rights; record in `docs/IP-INVENTORY.md`; regenerate under clear terms if murky. |
| L4 | **Academic-integrity posture undocumented.** The app drafts thesis text; without a public integrity page + disclosure-by-default posture, universities may ban rather than recommend it. The disclosure-statement feature already exists — the positioning doesn't. | product | Medium | M | BRIEF Phase 5 page, written for supervisors. |
| L5 | **Font/library license inventory absent.** OFL requires license inclusion when self-hosting; mammoth BSD-2 requires notice. | repo | Low | S | `docs/IP-INVENTORY.md` table: asset, source, license, commercial-use status. |
| L6 | **"ThesisMaster" name unchecked** for trademark conflicts in target markets. | product | Low | S | Basic search before spending on brand. |
| L7 | **GDPR mechanics untested.** Export/delete endpoints exist but completeness/irreversibility never verified by test. | `server/server.js:103–115` | Medium | S | API tests as part of Phase 2 suite. |

## 6. Punch-list — prioritized by impact × effort

**P0 — before the server is ever deployed anywhere** (each ≤ half a day)
1. **S1** Disable or signature-verify the Paddle webhook.
2. **S2** Rate-limit + lockout on `/api/auth/*`.
3. **C2** CI: GitHub Actions running the validation gate + `public/index.html` byte-identity on every push.
4. **S9** Commit `package-lock.json`, run `npm audit`, enable Dependabot.

**P1 — Phase 1–2 core (the next 2–3 sessions)**
5. **C1** Test suite: ~24 pure functions vs a real chapter fixture (incl. Arabic), wired into CI. *(Biggest single quality lever in the repo.)*
6. **S3** helmet + HTTPS + CSP (sequenced after L2 fonts so CSP can be strict).
7. **C3** Backup script + performed restore test for `thesismaster.db`.
8. **C4** Quota: don't count failed upstream calls.
9. **C5** Flush pending saves on `visibilitychange`.
10. **C6** CI lint enforcing `esc()` at innerHTML sites.
11. **L7** API tests: store isolation (user A ≠ user B), quotas, export, delete.

**P2 — trust & asset value (Phase 1 tail + Phase 5/6 starts)**
12. **L1** Terms + Privacy (needs Zak; template can be drafted now).
13. **L2** Self-host fonts.
14. **S4–S6** Cookie option, JWT revocation, password reset.
15. **L3/L5** IP inventory incl. portrait license verification.
16. **C8** `/api/health` + monitoring.
17. Lighthouse in CI (fills the measurement gap above).

**P3 — the moat (Phase 3, after the above is green)**
18. Golden set + calibration harness + regression gate (`npm run eval`).
19. **C7** Server-side resumable pass loop.

**Deliberately not proposed:** new features, new tabs, design changes — out of scope per BRIEF §10 until Phases 0–3 are green.

## 7. Invariant conflicts found

None requiring a decision. Two tensions worth naming:
- The Google-Fonts CSS import predates the "no remote assets" invariant's spirit; it degrades gracefully, so it is a P2 cleanup (L2), not a violation.
- A strict CSP (S3) and the single-file inline-everything design are in tension; resolvable with hashes/nonces, but it is why S3 is sequenced with care rather than dropped in.
