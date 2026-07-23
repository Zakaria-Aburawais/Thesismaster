# ThesisMaster — Engineering & Value Brief for Claude Code

**How to use this file:** save it in the repo root as `BRIEF.md`, commit it, then open Claude Code in the project and paste the *Kickoff* block at the bottom. Work the phases in order. Do not skip Phase 0.

---

## 0. Mission

ThesisMaster is being treated as a **durable digital asset**, not a demo. That means it must survive three kinds of scrutiny:

1. **A hostile user** — someone who tries to break, abuse, or exploit it.
2. **A skeptical university** — someone who asks whether its grades are defensible and its academic-integrity posture is sound.
3. **A due-diligence buyer or investor** — someone who asks whether the code, the IP, the data, and the metrics would transfer cleanly to a new owner.

Every task below exists to serve one of those three. If a proposed change serves none of them, it is polish, and polish is the lowest priority in this brief.

**The honest premise:** valuation comes from users who pay and stay, plus defensible quality — not from feature count. So the order here is: make it safe, make it correct, make it provably good, make it easy to adopt, then make it grow.

---

## 1. Inherited invariants — never violate

These come from `CLAUDE.md` and `docs-architecture.md`. They are not negotiable and not up for redesign:

- **Blind judging.** The audit examiner never sees prior scores, round numbers, or that text was corrected. No code path may add points to a returned score.
- **Never fabricate scholarship.** No invented sources, references, data, or citations. Citation insertion stays behind per-item human approval. Correctors preserve facts, numbers, equations, and `[n]` markers.
- **Anchor rubric criteria, never score distributions.**
- **Honest capability labels.** Plagiarism is a sampled spot-check, not Turnitin. NOT FOUND ≠ proven fake. Sampling is always disclosed.
- **1000-token output ceiling** shapes every prompt: compact schemas, capped lists, chunked long documents.
- **Sandbox-hostile constraints:** no `alert/confirm/prompt`, no in-page `href="#..."`, no remote images, no hard CDN dependencies, capability-guarded storage and clipboard.
- **Bilingual (EN/AR) must keep working**, with true RTL via logical CSS properties.
- **Design system:** Midnight Scriptorium tokens exactly — never a parallel palette.

If a task in this brief appears to conflict with an invariant, **stop and raise it** rather than resolving it yourself.

---

## 2. Phase 0 — Baseline and truth (do this first, change nothing)

Produce a written baseline before any edits. Deliverable: `docs/AUDIT-baseline.md`, committed.

- Read `CLAUDE.md`, `docs-architecture.md`, `thesismaster.html`, and `server/server.js`. Summarize the architecture back in your own words, including the pass loop and the dual-mode (`PLATFORM.mode`) design.
- Inventory every risk you find in three tables: **security**, **correctness/reliability**, **legal/IP**. Each row: what, where (file + symbol), severity, effort, and suggested fix.
- Measure the current state: file size, initial render time, Lighthouse scores (performance, accessibility, best practices, SEO), and count of untested pure functions.
- Produce a prioritized punch-list (impact × effort). **Present it and wait for approval before writing code.**

---

## 3. Phase 1 — Security (blocking; nothing ships before this)

Assume the app will be attacked. Target: no critical or high findings remain.

- **Secrets:** confirm no API key, token, or credential exists anywhere in the client or in git history. Verify `.env` is ignored and never committed. Document key-rotation steps.
- **Auth hardening (`server/`):** password rules, bcrypt cost review, JWT expiry and rotation, secure/httpOnly cookie option instead of `localStorage` tokens where feasible, login rate limiting and lockout on repeated failure, timing-safe comparisons, and a password-reset flow that doesn't leak account existence.
- **Transport & headers:** enforce HTTPS, add HSTS, CSP, X-Content-Type-Options, Referrer-Policy, and a strict CORS allowlist. CSP must not break the app's inline styles/scripts — adjust the app if needed.
- **Input validation everywhere:** body size caps, key allowlists on the store routes, JSON schema validation on `/api/claude`, and rejection of oversized or malformed documents with clear errors.
- **Abuse control:** per-IP and per-account rate limits, quota enforcement verified by test, and an audit log of auth events.
- **Dependency hygiene:** `npm audit`, pin versions, add Dependabot or an equivalent update routine.
- **Ownership isolation test:** write an automated test proving user A can never read or write user B's documents. This is the single most important test in the codebase.

**Acceptance:** a written `docs/SECURITY.md` (threat model, controls, disclosure contact) plus passing tests for isolation, rate limits, and quota enforcement.

---

## 4. Phase 2 — Reliability and engineering hygiene

- **Test suite.** Add a runner (node:test or vitest). Unit-test every pure function against a real chapter fixture: `parseJSON`, `fuzzyFind/fuzzyReplaceAll`, `sampleDoc`, `chunkText`, `citationStats`, `uncitedParagraphs`, `parseReferences`, `parseCitationsF` (including `[2-4]` and `[7,9]` expansion), `duplicateBlocks`, `orphanQuotes`, `pickPlagSentences`, `docLangLine`. Include Arabic fixtures (، ؛ «») per the invariants. Target: meaningful coverage of parsing/matching logic, not a coverage percentage for its own sake.
- **API-level tests** for the server: auth, store isolation, quotas, export, delete.
- **CI:** GitHub Actions running tests + the validation gate (JS syntax, CSS brace balance, div balance) on every push. A red build blocks merge.
- **Error handling:** every AI call path degrades gracefully with a specific, honest message. No silent failures. Add server-side structured logging and an error tracker (e.g. Sentry) with PII scrubbed — thesis text must never leave in a log.
- **Durability:** automated nightly backup of the database, plus a **documented and actually-performed restore test**. An untested backup is not a backup.
- **Long jobs:** move the multi-round pass loop server-side as a resumable job so a closed laptop or locked phone doesn't kill a 7-round run; the client polls for status.
- **Health:** `/api/health`, uptime monitoring, and a public status page.

---

## 5. Phase 3 — Provable examiner quality (this is the moat)

The product's core claim is an honest, stable examiner. Make that measurable.

- **Golden set:** build `eval/` with 8–12 real chapters spanning weak→excellent, each with a human reference grade (Zak supplies; anonymize before committing, or keep them out of git and load from a private path).
- **Calibration harness:** a script that runs the audit engine over the golden set N times, then reports per-dimension mean, standard deviation, and correlation with human grades. Commit results as `eval/results-vN.json`.
- **Regression gate:** any prompt, rubric, or model change must re-run the harness and be compared against the previous version. Ship only if correlation holds and variance doesn't widen. Record the outcome in `docs/CHANGELOG-examiner.md` and bump `EXAMINER_VERSION`.
- **Publish honestly:** confirm the in-app variance band matches measured reality. If measured variance is ±5, the UI must say ±5, not ±3.
- **Feedback loop:** surface the collected 👍/👎 fairness data in an internal view; use disagreement clusters to target rubric work.

**Acceptance:** a reproducible command (`npm run eval`) and a documented statement of examiner accuracy and variance that Zak could defend to a university.

---

## 6. Phase 4 — Product quality that users feel

- **Performance:** measure first, then act. Lazy-load heavy assets, defer non-critical work, consider splitting the single file into build-time-concatenated modules *only if* it doesn't break the zero-build invariant — otherwise keep one file and optimize within it. Target: interactive in under 2.5s on a mid-range phone over 4G.
- **Accessibility to WCAG 2.2 AA:** keyboard-complete flows, focus states, ARIA on custom controls, contrast checks in both themes, screen-reader pass on the audit report, and reduced-motion compliance verified.
- **Mobile-first pass** on all seven tabs and the faculty board.
- **i18n QA:** full RTL audit — layout mirroring, chevrons, progress bars, numerals policy, Arabic typography. Then prove extensibility by scaffolding a third language dictionary (even partially) to confirm adding a language is a data change.
- **Onboarding:** a first-run path that gets a new user to their first audit in under three minutes, with a sample chapter they can try before uploading their own work.
- **Empty, loading, and error states** for every panel — the places products usually feel unfinished.

---

## 7. Phase 5 — Trust, compliance, and academic-integrity posture

- **Legal pages:** Terms of Service and Privacy Policy that formalize what the Trust section already promises — user owns their thesis, content is never used for model training, private by default, export and deletion rights, data location, retention period, subprocessors (including the AI provider), and contact.
- **GDPR mechanics:** verify export completeness and deletion irreversibility with tests. Add consent handling for any analytics.
- **Academic-integrity page:** state plainly what the tool does and does not do, aimed at supervisors and institutions. Include the disclosure-statement feature. This page is a sales asset, not a disclaimer — it is what makes a university recommend rather than ban the product.
- **Incident response:** a short runbook for breach, outage, and AI-provider failure.

---

## 8. Phase 6 — Value, transferability, and growth

Asset value lives here as much as in the code.

- **IP hygiene (do this carefully):** verify licensing and commercial-use rights for **every** embedded asset — the six generated scholar portraits, all fonts (Fraunces, Manrope, IBM Plex Mono, IBM Plex Sans Arabic, Amiri), icons, and any library. Record each in `docs/IP-INVENTORY.md` with source, license, and commercial-use status. Replace anything with unclear rights. A buyer's lawyer will ask for exactly this table.
- **Transferability:** no personal accounts or credentials hard-wired anywhere; infrastructure reproducible from the repo; a `docs/RUNBOOK.md` that lets a new engineer deploy from scratch in under an hour.
- **Metrics that define value:** instrument (privacy-respecting) activation (signup → first completed audit), retention (weekly return rate), conversion (free → paid), and cost per user (AI spend). Build a simple internal dashboard. **Unit economics — revenue per user minus AI cost per user — must be positive and visible.**
- **Pricing and packaging:** propose tiers grounded in measured cost per audit, with quotas that protect margin. Present the analysis; Zak decides.
- **Distribution assets:** landing-page SEO fundamentals, a demo video script, and two or three case studies once real users exist.

---

## 9. Working agreement

- Small, focused commits with clear messages; one concern per PR-sized change.
- **Ask before** anything destructive, anything touching auth/payments/data deletion, or any change to the integrity invariants.
- After every change to `thesismaster.html`, run the validation gate in `CLAUDE.md` and copy to `public/index.html`.
- Keep `CLAUDE.md`, `docs-architecture.md`, and this brief current — stale docs destroy asset value.
- Record significant technical decisions as short ADRs in `docs/adr/`.
- Report in this format: **what changed · how to test it · the single highest-leverage next step.**
- Prefer deleting complexity over adding it. Every feature added is a feature to maintain forever.

---

## 10. Explicitly out of scope

Do not add: gamification, AI chatbots unrelated to examination, social feeds, blockchain anything, or new tabs — until Phases 0–3 are complete and green. Scope discipline is what makes this an asset rather than a hobby.

---

## Kickoff — paste this into Claude Code

> Read `CLAUDE.md`, `docs-architecture.md`, `BRIEF.md`, `thesismaster.html`, and `server/server.js`. Do not change any code yet.
>
> Execute **Phase 0** of `BRIEF.md`: explain the architecture and the pass loop back to me in your own words, then produce `docs/AUDIT-baseline.md` containing (a) security, correctness, and legal/IP risk tables with severity and effort, (b) current measurements including Lighthouse scores and file size, and (c) a prioritized punch-list ranked by impact × effort.
>
> Then stop and present the punch-list for my approval. Flag anything that appears to conflict with the hard invariants in §1 instead of resolving it yourself.
