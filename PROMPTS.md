# PROMPTS.md — what to paste into Claude Code

Six prompts. Copy the one that matches what you're doing. They assume `CLAUDE.md`, `BRIEF.md`, and `docs-architecture.md` are in the repo root (they are).

---

## 1. First session ever — orientation (paste this first)

```
Read CLAUDE.md, BRIEF.md, docs-architecture.md, thesismaster.html, and server/server.js.
Do not change any code yet.

Then do three things:
1. Explain the architecture back to me in your own words — especially the dual-mode
   PLATFORM design, the audit pass loop, and the reference Library's hallucination gate.
2. Tell me which of the hard invariants in CLAUDE.md you think are most at risk of being
   broken accidentally during normal development, and why.
3. Execute Phase 0 of BRIEF.md: produce docs/AUDIT-baseline.md with security,
   correctness, and legal/IP risk tables (each row: what, where, severity, effort),
   current measurements (file size, Lighthouse scores, untested functions), and a
   punch-list prioritized by impact x effort.

Then stop and present the punch-list for my approval.
```

---

## 2. Working a phase of the brief

```
Work Phase N of BRIEF.md.

Rules: follow the hard invariants in CLAUDE.md; run the validation gate after every edit
to thesismaster.html and copy it to public/index.html; commit in small focused steps.
Ask me before anything destructive or anything touching auth, payments, data deletion,
or the grading integrity spine.

Start by listing what you plan to do in this phase and what you will NOT do, then begin.
Report as: what changed · how to test it · the single highest-leverage next step.
```

---

## 3. Adding a feature

```
Feature: <describe it in one or two sentences>.

Before writing code:
1. Check docs-architecture.md §10 (reusable components) — most features here are
   compositions of existing helpers (parseJSON, fuzzyReplaceAll, sampleDoc, chunkText,
   citationStats, the PDF writer, the character system, the i18n layer).
2. Tell me which existing pieces you will reuse and what genuinely new code is needed.
3. Confirm it does not violate any hard invariant in CLAUDE.md.

Then implement it fully: Midnight Scriptorium design tokens, all six UI languages
(add keys to I18N, never hardcode strings), RTL-safe CSS logical properties, no browser
dialogs, no remote assets, capability-guarded storage. Unit-test any new pure function
against a real chapter fixture. Run the validation gate. Then report what changed,
how to test it in a sandboxed preview, and the next highest-leverage step.
```

---

## 4. Fixing a bug

```
Bug: <what you saw, where, and what you expected instead>.

Find the root cause before proposing a fix — do not patch the symptom. Tell me the cause
first, in one paragraph, and what else in the codebase shares that cause. Then fix it,
add a regression test if the broken thing is a pure function, run the validation gate,
and tell me how to verify it myself.
```

---

## 5. Changing anything that touches grading

```
I want to change <the rubric / a prompt / the pass loop / the model>.

This is the product's integrity spine, so: first re-read CLAUDE.md hard rule 1 and
docs-architecture.md §6 and §9. Tell me whether the change risks blind judging, score
inflation, distribution anchoring, or fabricated scholarship — and say so plainly if it does.

If it is safe: implement it, bump EXAMINER_VERSION, run the calibration harness from
BRIEF.md Phase 3 against the golden set, and show me the before/after correlation and
variance. Ship only if correlation holds and variance does not widen. Record the outcome
in docs/CHANGELOG-examiner.md.
```

---

## 6. Deploying

```
Prepare a deployment to Hostinger following server/README-deploy.md.

Verify before we ship: no secrets in the repo or git history; .env ignored; JWT_SECRET
is strong; store isolation test passes (user A cannot read user B's documents); quotas
enforced; GDPR export and delete both work; the Paddle webhook verifies its signature.
Confirm public/index.html is byte-identical to thesismaster.html.

Give me a numbered checklist of what I must do by hand (DNS, SSL, env vars, Paddle keys),
and tell me honestly what is still missing before real users should be let in.
```

---

## How to phrase things generally

- **Give it the goal, not the keystrokes.** "Make the Library import handle Chicago-style entries" beats "edit line 3400."
- **Ask for the cause before the fix.** It prevents symptom-patching, which is how single-file apps rot.
- **Demand the report format** — *what changed · how to test · next step* — every time. It keeps sessions auditable.
- **Say "do not change anything yet"** when you only want analysis. Claude Code will otherwise start editing.
- **When it proposes something that conflicts with an invariant**, that's the moment to slow down: the invariants are the product.
