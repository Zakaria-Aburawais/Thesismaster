# CLAUDE.md — ThesisMaster

Read this first. It is the operating manual for this repository.

## What this is
ThesisMaster is an AI-powered academic thesis studio: it writes, reviews, audits/grades (11-dimension rubric), corrects, verifies references, spot-checks plagiarism, and humanizes AI-flavoured prose, with a cast of six 3D scholar characters who perform each task. Built for Zak. Bilingual (English + Arabic/RTL).

## Repository layout
- `thesismaster.html` — **the entire client app in ONE file** (~350KB: `<style>`, landing page + studio, `<script>`). This is the primary artifact. `public/index.html` is a copy served in deployed mode; keep them identical (see build step below).
- `server/` — Node/Express platform backend: auth (bcrypt+JWT), per-user private store, daily AI quotas, Anthropic proxy (keeps the API key server-side), GDPR export/delete, Paddle webhook. See `server/README-deploy.md`.
- `docs-architecture.md` — full technical documentation of every feature, algorithm, prompt, and design decision. Read it before large changes.

## How the app is edited
This is a single hand-authored HTML file, **not** a framework project. There is no bundler. Edit `thesismaster.html` directly with precise string edits. After ANY change to it, run the validation gate below, then copy it to `public/index.html`.

## Dual-mode design (critical)
The file auto-detects its environment via `PLATFORM.mode`:
- **preview/file**: calls the Anthropic API directly (auth injected by the host); uses `window.storage`.
- **deployed** (served from a real domain): shows a login gate, routes all AI calls through `/api/claude`, and swaps storage to the server. `anthropicFetch()` and the `window.storage` shim handle this. Never hard-code `api.anthropic.com` anywhere except inside `anthropicFetch` and `server.js`.

## VALIDATION GATE — run after every edit to thesismaster.html
```
node -e "const fs=require('fs');const h=fs.readFileSync('thesismaster.html','utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);const c=h.match(/<style>([\s\S]*)<\/style>/)[1];if((c.match(/{/g)||[]).length!==(c.match(/}/g)||[]).length)throw'CSS unbalanced';if((h.match(/<div/g)||[]).length!==(h.match(/<\/div>/g)||[]).length)throw'div unbalanced';console.log('OK')"
cp thesismaster.html public/index.html
```
Also run `node --check server/server.js` after server edits.

## HARD RULES — do not break these
1. **Integrity of grading.** The audit judge is BLIND: it never sees prior scores, round numbers, or that text was corrected. Corrector and judge never share state. There is NO code path that adds points to a returned score. Never add score inflation, never remove blind judging. See `docs-architecture.md` §9.
2. **Never fabricate scholarship.** The AI must never invent sources, references, data, or citations. Citation inserts are ALWAYS behind a per-item human approval button. Correctors preserve facts, numbers, equations, and `[n]` markers.
3. **Anchor criteria, not distributions** in rubric prompts (describing a score distribution biases the judge — a real past bug).
4. **1000-token output ceiling.** Every AI JSON schema must be compact (indexed arrays, capped list lengths, "output ONLY the JSON"). Chunk long-document work.
5. **Sandbox-hostile environment.** No `alert`/`confirm`/`prompt` (blocked — use inline UI). No in-page `href="#..."` anchors (the preview shows an external-link dialog — use `data-target` + the scroll interceptor). No remote images (embed as base64). No CDN-only hard dependencies (the PDF writer is hand-rolled for this reason). Storage and clipboard are capability-guarded — keep them so.
6. **Child of the skill.** A user skill at `thesis-master-developer` governs this project. Keep behaviour consistent with it and with `docs-architecture.md`.
7. **Bilingual.** UI strings live in the i18n layer (`AR_MAP`, `FAC_*_AR`, `ENGINE_PHRASES_AR`). Engines reply in the document's language via `docLangLine()`. Keep both languages working; RTL uses logical CSS properties.

## Editing lessons (save yourself pain)
- Prefer precise unique-string edits; verify each anchor is unique before replacing.
- When scripting bulk edits, JS template literals containing `"""` and `\u` escapes break naïve Python patchers — use file payloads + `lambda m: payload` replacements.
- Distinguish literal em-dashes in HTML from `\u2014` escapes inside JS strings.
- After edits, unit-test pure functions (parsers, fuzzy matcher, samplers) against a real chapter, not just toy strings.

## Good first tasks to calibrate
1. Read `docs-architecture.md`, then explain the pass-loop (`runPassLoop`) back before changing it.
2. Add a citation-style selector (APA/IEEE/Harvard/Chicago/MLA) to the Write tab — a self-contained, low-risk feature.
3. Set up git and make the first commit.

## Deploy
Hostinger/any Node host: `public/index.html` + `server/`. Fill `server/.env` from `.env.example`, `npm install`, `node server.js`. Full checklist in `server/README-deploy.md`. Before real users: verify the Paddle webhook signature, write Terms/Privacy (the app's Trust section makes promises they must formalize), and build a calibration set of human-graded chapters.
