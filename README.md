# ThesisMaster

AI-powered academic thesis studio — writes, reviews, audits/grades, corrects, verifies references, checks plagiarism, and humanizes AI text, with a six-scholar examination board. Bilingual (EN/AR).

## Quick start with Claude Code
```
cd tm-project
claude
```
Claude Code reads `CLAUDE.md` first — it has the full operating manual, hard rules, and validation gate.

## Structure
- `thesismaster.html` — the whole client app, one file (edit this)
- `public/index.html` — deployment copy (kept identical to the above)
- `server/` — auth + quotas + Anthropic proxy + GDPR + payments (Node/Express)
- `docs-architecture.md` — complete technical documentation
- `CLAUDE.md` — operating manual for AI-assisted development

## Run the app locally (preview mode)
Open `thesismaster.html` in a browser. AI calls need the deployed server (see `server/README-deploy.md`) unless run inside a Claude preview.

## Deploy
See `server/README-deploy.md`.
