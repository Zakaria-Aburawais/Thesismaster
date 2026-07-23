# ThesisMaster

AI-powered academic thesis studio — writes, reviews, audits/grades, corrects, verifies references, checks plagiarism, humanizes AI text, and manages references EndNote-style, with a six-scholar examination board. Six UI languages (EN/AR/TR/ID/FR/ES).

## Start here with Claude Code

```
cd tm-project
claude
```

Then paste prompt #1 from **PROMPTS.md** (orientation + baseline audit). Claude Code reads `CLAUDE.md` automatically.

## The four documents that matter

| File | What it is |
|---|---|
| `CLAUDE.md` | Operating manual — hard invariants, validation gate, editing lessons. Read first, always. |
| `PROMPTS.md` | Paste-ready prompts for each kind of session (orientation, features, bugs, grading changes, deploy). |
| `BRIEF.md` | The asset-quality programme: seven phases from security to unit economics. |
| `docs-architecture.md` | Full technical spec — every algorithm, prompt, and design decision. |

## Structure

- `thesismaster.html` — the whole client app, one file (edit this)
- `public/index.html` — deployment copy, kept identical
- `server/` — auth, quotas, Anthropic proxy, GDPR endpoints, payments
- `docs-video-production.md` — how-to video shot list and localized narration

## Deploy

See `server/README-deploy.md`.
