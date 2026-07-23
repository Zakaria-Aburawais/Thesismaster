# ThesisMaster — Complete Technical Documentation

A single-file, AI-powered academic thesis studio. This document describes everything built: product concept, architecture, design system, every feature, every algorithm, the prompt engineering, the integrity principles, and the hard-won environment lessons. It is written so it can be converted into a Claude skill (SKILL.md + references) later.

---

## 1. Product overview

**ThesisMaster** is a self-contained web application (one HTML file, ~320 KB, zero build step, zero external dependencies at runtime) that acts as a complete academic examination board for thesis writing. It writes, reviews, audits, grades, corrects, verifies references, spot-checks plagiarism, and humanizes AI-flavoured prose — with a cast of six 3D scholar characters who perform each task.

**Intended user:** a graduate student preparing thesis chapters for submission and defense, or a builder productizing academic-writing tooling.

**Core value proposition:** an honest examiner, not a flatterer. Scores rise only when text genuinely improves; substantive gaps (citations, evidence, originality) are named for the author instead of papered over.

**Skill-trigger contexts (for a future skill description):** thesis writing, thesis audit, chapter grading, academic review, examiner simulation, citation checking, reference verification, plagiarism spot-check, humanizing AI text, academic register correction, viva/defense preparation, "make my chapter pass", "grade my thesis", "check my references are real".

---

## 2. Architecture

### 2.1 Single-file layout

```
thesismaster.html
├── <style>      one stylesheet: design tokens, landing page, studio, committee, faculty
├── <body>
│   ├── Landing page (hero, capabilities, FACULTY board, studio preview, method, footer)
│   └── Studio (tab bar + 7 panels)
└── <script>     one script: state, engines, parsers, renderers, characters, voices
```

Everything is embedded: fonts by CSS import, portraits as base64 JPEG data URIs, characters as inline SVG, PDF writer implemented from scratch. The only network calls at runtime are to the Anthropic API.

### 2.2 AI plumbing

- Endpoint: `POST https://api.anthropic.com/v1/messages` (no API key in code — the artifact environment injects auth).
- Model: `claude-sonnet-4-6`, `max_tokens: 1000` per call (a hard environment constraint that shaped every prompt format — see §8.1).
- `callClaude(prompt)` — plain completion; joins all `type:"text"` content blocks.
- `callClaudeSearch(prompt)` — same but passes `tools:[{type:'web_search_20250305', name:'web_search'}]`, enabling **live web search inside the artifact** (used by plagiarism check and reference verification).
- `callJSON(prompt)` / `callJSONSearch(prompt)` — call, then `parseJSON`, retrying once on failure.
- `parseJSON(raw)` — robust extraction: strips code fences/preambles, finds the first balanced `{...}` via brace counting, falls back to a control-character-tolerant pass. Unit-tested against 7 malformed-reply shapes.

### 2.3 State

- `thesis = { meta:{title}, chapters:[{id, num, title, text, status, updatedAt, audits:[{ts, grade, overall}]}] }`
- Persistence: `window.storage` key `thesis:data` (single JSON blob to respect rate limits).
- `saveThesis()` debounces 1200 ms → `saveThesisNow()` with 3 retries and backoff.
- **Capability-aware storage** (§8.3): `isCapabilityError` regex (`/capab|not available|unsupported|denied|not implemented/i`); the first capability-class failure calls `disableStorage()` — storage is off for the session, a single amber note explains session-only mode, no host toasts.
- `lastAudit` — working context of the most recent audit: `{text, flags, recurring, cs, dims}`; feeds Apply-corrections, Close-the-gap, plagiarism inline.
- `linkedChapterId` — when an audit came from a dashboard chapter, corrections/inserts sync back to it automatically.
- `refVerifyCache` — session cache of reference verdicts keyed by entry text (§6.7).

---

## 3. Design system — "Midnight Scriptorium"

- **Palette:** ink-navy `#0B0E15` background; surfaces `#141927`/`#1A2032`; brass/gold accent `#C9A557` (bright `#E9CD82`); status colors good `#7FBF8E`, warn `#D9A65B`, bad `#CF7A6E`. All as CSS custom properties.
- **Typography:** Fraunces (display/serif headings, italic speech), Manrope (UI), IBM Plex Mono (labels, kickers, chips — uppercase, letter-spaced).
- **Day mode:** full parchment theme via `html.light` overrides (warm creams `#FDFAF1`, brown-gold accents); sun/moon toggle in the nav; auto-detects system preference.
- **Ambient background:** a fixed decorative layer of floating thesis pages, self-drawing chart strokes, and academic glyphs (∑, π, ∫, √x), positioned in the margins so it never sits behind reading surfaces; studio panels are near-opaque on top of it.
- **Motion language:** slow floats, perspective tilts, drawn strokes; everything respects `prefers-reduced-motion`.

---

## 4. The cast — six 3D scholars

Three professors + three doctors, each mapped to tasks:

| Character | Role | Prop (animated) | Engines |
|---|---|---|---|
| Prof. Haddad | Board chair | clipboard w/ self-drawing checkmarks | audit |
| Prof. Novak | Supervisor | red pen (ticking) | review, manuscript correction |
| Prof. Idris | Thesis writer | quill scribbling + ink line | write |
| Dr. Chen | Scientific examiner | magnifier (sweeping) | audit, manuscript, refiner |
| Dr. Salma | Language examiner | open book (page flips) | audit |
| Dr. Amara | Refinement editor | sparkle wand (pulsing stars) | AI refiner, manuscript |

### 4.1 Two art layers

1. **Embedded photo portraits** (primary): HiggsField-generated Pixar-style 3D renders (navy gowns, gold trim, golden rim light), embedded as **base64 JPEG data URIs** (~8–11 KB each) in `PROF_IMAGES` — the single source of truth for both the home-page faculty board and the in-studio committee. Data URIs load everywhere, including offline and inside sandboxed previews that block remote images.
2. **Shaded SVG busts** (fallback): hand-built inline SVGs with radial-gradient spherical skin shading, rim-light arcs, specular glass lenses, gradient gowns — each character's gradients namespaced (`hd/no/wr(idris)/ch/sa/am` prefixes) because inline SVG ids are global in the DOM and three characters render simultaneously.

Fallback logic: `profImgFail(img,key)` (committee) and `hydrateFaculty()` (home page) swap a failed image for the SVG bust; last resort is a gold monogram.

### 4.2 Committee staging (in-studio loading overlays)

`startCommittee(prefix)` renders during any engine run: a speech bubble cycling in-character `ENGINE_PHRASES` every 2.6 s (fade-swap), a perspective-projected row of the engine's cast (`ENGINE_CAST`), each bust swaying ±10° in 3D (`bustSway`, staggered timings), a breathing elliptical ground shadow, and the engine-appropriate animated prop overlaid per member (`TASK_PROPS`). Overlays are scroll-safe (`.load-inner` with auto margins) so tall content never clips.

### 4.3 Faculty board (home page)

Section `#faculty` between Capabilities and Studio (nav + footer links added): six gold-framed portrait cards, idle-floating at individual rhythms; hover/focus → 3D tilt + glow + a speech bubble with an in-character introduction. `tabindex="0"` makes tap work on mobile.

### 4.4 Voices

Web Speech API (`speechSynthesis` — built-in, offline, free). `FACULTY_LINES` holds spoken introductions; `FACULTY_VOICE` gives each scholar pitch/rate (Haddad 0.72/0.9 deep-slow → Amara 1.06/1.03 bright) and a gender hint used by `facPickVoice` name-heuristics over the system voice list. Hover/focus speaks (canceling any current speech), leave/blur hushes; the portrait pulses a golden ring while speaking (`.fac-speaking`). A "Voices on/off" toggle chip sits in the section head; the toggle hides itself when the browser lacks speech. Browser note: speech requires one prior user interaction (autoplay policy).

---

## 5. The seven tabs

### 5.1 Dashboard — thesis portfolio
Persistent chapter manager. Stats chips (chapters, total words, average score, thesis grade via `gradeFromAvg`). Add chapter by paste or upload. Expandable chapter cards: inline edit textarea (save re-renders), audit history rows with grade deltas (▲/▼ vs previous), per-chapter Download menu, and **two-step inline delete** (first click arms a red "Confirm delete" state for 4 s; second click deletes and saves immediately) — because `confirm()` is blocked in sandboxed previews (§8.2). "Audit this chapter" jumps to the Audit tab pre-linked.

### 5.2 Write — thesis writer (Prof. Idris)
Inputs: topic, discipline, level (Bachelor/Master/PhD), section type, citation style, notes. **Voice switch:** Classic academic vs *Human & natural* — the latter injects `HUMAN_STYLE`, a prompt block banning AI-tells ("delve", "moreover" chains, empty intensifiers, uniform sentence length). Citations are **bracketed placeholders only** (`[Author, Year]`); the writer never invents real references.

### 5.3 Review — supervisor's read (Prof. Novak)
Upload (.docx via mammoth CDN, .txt, .md) or paste. Returns exactly 3 issues as JSON, each with a **verbatim excerpt**, severity, comment, and suggested revision; plus strengths and a summary. "Apply suggested revisions" patches the text via the fuzzy matcher. Downloads: review report and revised document.

### 5.4 Audit — the examination board (flagship; see §6)

### 5.5 Manuscript — approve or correct
Upload a full manuscript. A large approval tickbox: ticked → green APPROVED seal + download as-is; unticked → **multi-pass correction**: text chunked (~1500 chars), up to 10 passes, per-chunk JSON with plain-text fallback, coverage reported honestly ("corrected X of Y words").

### 5.6 AI Refiner — humanizer (Dr. Amara)
For ChatGPT-drafted chapters. Two depths: Light polish / Deep rewrite. First diagnoses AI habits (quoting the offending phrases), then rewrites multi-pass to natural academic register. The hint reminds users to follow their university's AI-disclosure policy.

### 5.7 References — registrar's verification (see §6.6–6.7)

---

## 6. The audit engine (deep dive)

### 6.1 Eleven dimensions, four boards
`AUDIT_DIMS`: Academic rigor (Argument defensibility; Evidence & sourcing; Originality of framing) · Scientific soundness (Technical accuracy & terminology; Methodological soundness; Data & equation presentation) · Language (Grammar & mechanics; Sentence & paragraph structure; Academic register & flow) · References & citations (Citation coverage & placement; Reference consistency & format). Each scored 0–100 with a one-line note; group averages and a weighted overall + letter grade render as animated score bars.

### 6.2 Anchored rubric (anti-anchoring lesson)
The prompt anchors the scale: 90–100 publication-ready · 80–89 strong/minor polish · 70–79 competent/clear issues · 55–69 weak · <55 deficient, with an explicit "USE THE FULL RANGE — do not default to the 60s." **Lesson:** an earlier hint that "most drafts score 55–80" anchored every audit to ~68; describing a *distribution* biases the judge — describe *criteria* instead.

### 6.3 Compact reply format (token-limit lesson)
Dims return as `"dims": [[score,"note"], ...]` in fixed order; the client maps indices back to names. This survived the 1000-token ceiling that verbose JSON kept truncating (§8.1).

### 6.4 Local citation scan + originality scan (every audit, free)
`citationStats(text)` scans the **full document** (not the sample): total `[n]` markers, unique sources, reference-list presence, uncited substantive paragraphs — rendered as chips and injected into the prompt for dimensions 10–11. `duplicateBlocks` (repeated 10-grams) and `orphanQuotes` (quotes ≥40 chars with no citation within ~90 chars) are also injected: "raise a flag if either is nonzero."

### 6.5 Sampling
`sampleDoc(text, 5200)` examines beginning/middle/end windows of long chapters and returns their offsets (`segments`); the report states when sampling was used. The corrector rewrites exactly the sampled windows (what the examiner reads), plus document-wide recurring fixes.

### 6.6 Flags, corrections, fuzzy patching
2–3 flags `{issue, quote(verbatim), suggestion, corrected}` plus `recurring:[{find,replace}]` (0–2 document-wide systematic fixes, e.g. a tense error repeated everywhere). "Apply all suggested corrections" patches via **`fuzzyReplaceAll`** — a typography-normalizing matcher (curly↔straight quotes, en/em dashes, case, collapsed whitespace) built as `NORM_MAP → buildNorm → fuzzyFind`, mapping normalized hits back to raw-string offsets. Unit-tested 4/4 including curly-quote and dash variants. Applies update the linked chapter and offer re-audit + download.

### 6.7 Examiner summary fallback
If the model omits `examiner_summary`, the client synthesizes one from the two lowest dimensions — the summary box never renders empty.

### 6.8 "Audit until it passes" — the pass loop
Target select (70/80/85). Up to **7 rounds**, each: **blind independent audit** (the judge never sees prior scores, round numbers, or that text was corrected — the integrity core) → if ≥ target: PASSED seal → else **corrector stage**: rewrite the sampled segments (jobs split ≤1800 chars, spliced back in reverse order, 400 ms spacing, one retry, preamble-strip, length sanity check), guided by the full 11-dim scoresheet, the explicit gap ("THE BOARD REQUIRES AT LEAST target; current X"), **escalating depth** (THOROUGH → AGGRESSIVE → PUBLICATION EXEMPLAR from round 3 or gap >10) and **focus rotation** (`focusCycle`: round 1 language precision; round 2 argument/topic sentences/vague-quantifier purge; round 3 citation *placement* — repositioning EXISTING `[n]` markers only, never inventing) → apply recurring + flag patches → re-audit fresh.

Stopping rules: pass, round budget exhausted, or **hard stall only** (text physically unchanged two rounds — a technical failure, reported honestly as likely rate-limiting). There is deliberately **no plateau early-stop**: flat rounds trigger a *strategy change*, not surrender (a lesson — an earlier "two weak rounds → quit" rule overrode the user's round budget). `best` tracking guarantees the loop never ends on a worse-than-best round. Every round records to chapter history; the final banner shows the score trail, corrections applied, and — when short of target — the **two lowest dimensions with notes** ("these need your substantive input, not more editing").

### 6.9 "Close the gap" assistant
Appears on non-passing audits when uncited paragraphs exist or Originality < 75. Two modules:
1. **Citation matching:** `uncitedParagraphs(text)` (offset-tracked) + `referenceSection(text)` → the model proposes which EXISTING `[n]` fits each uncited paragraph ("NEVER invent a source"); each suggestion renders with its own **Insert** button — per-item human approval, because attaching a source to a claim it doesn't support is fabrication. Inserts patch the text and linked chapter.
2. **Originality angles:** two analytical angles grounded in the chapter's existing content + a drafted framing paragraph (copy button) for the author to adapt.

### 6.10 Plagiarism check
- **Every audit:** the local scans of §6.4 feed the prompt automatically.
- **Individually:** "Plagiarism check" button (and "+ Add a spot-check to this report" inline). `pickPlagSentences(text,4)` samples 4 distinctive sentences (90–260 chars, letter-ratio >0.7, spread across the document); one search-enabled call verifies each on the live web; strict statuses MATCH / SIMILAR / CLEAR with source name + URL; overall LOW/MEDIUM/HIGH risk verdict; internal-signal chips and orphan-quote flags beneath. **Disclaimer printed in the report:** a sampled spot-check, cannot query paywalled journals or Turnitin — clear is encouraging, not conclusive; the university's official check is the authority.

---

## 7. References tab — verification engine

### 7.1 Stage 1 — instant local cross-match
`parseReferences` finds the References/Bibliography heading and parses numbered entries (`[1] …` / `1. …`, multi-line-aware). `parseCitationsF` collects every in-text marker before the list, expanding ranges `[2-4]` and lists `[7,9]`. Cross-match yields: **phantom citations** (cited, not listed — red cards with the exact sentence excerpt: a fake/broken citation), **never-cited references** (amber chips — padding), and per-entry **format defects** (placeholder text, missing year, too short).

### 7.2 Stage 2 — live authenticity verification
Batches of 5; one web search per entry (title + lead author); statuses **VERIFIED REAL** (found, matching, with link) / **SUSPECT** / **NOT FOUND — LIKELY FAKE** (red). Progress line per batch; completion totals.

### 7.3 Stability engineering (flip-flop lesson)
Single-sample web judgments naturally flip run-to-run. Two fixes:
1. **Evidence-gated verdicts:** SUSPECT is only allowed with a *named contradiction* rendered on the card ("year: cited 2021, found 2019"); "could not confirm a detail" is explicitly not a discrepancy; a code-level gate promotes evidence-less suspects to verified.
2. **Session verdict cache:** `refVerifyCache` keyed by entry text — unchanged entries keep their verdict on re-runs (labelled "from an earlier check this session"); edited entries re-verify automatically (text change = new key). Per-card **Re-check** button forces a second opinion. Honest framing: NOT FOUND can also mean offline/paywalled — "treat as likely fake unless you can produce the source."

---

## 8. Environment lessons (critical for any rebuild)

### 8.1 The 1000-token output ceiling
Every JSON schema must be compact. Fixes used: indexed-array dims format; chunked multi-pass correction; capped list lengths ("exactly 3 issues", "at most 7 suggestions"); "perform at most N searches, then STOP and output ONLY the JSON" for search-enabled calls.

### 8.2 Sandboxed previews block dialogs
`alert()`, `confirm()`, `prompt()` fail silently (confirm returns false → actions never run). Replace with inline UI: two-step confirm buttons, inline error notes. Zero dialog calls remain.

### 8.3 Host capabilities vary
`window.storage` may exist but throw "Client server capabilities not available" — detect the error class once, disable for the session, tell the user, never spam retries. Clipboard likewise wrapped (fallback: "Select & copy manually").

### 8.4 Remote images are blocked in previews
External `<img>` sources (CDNs) can be refused by CSP; `web_fetch` and the container's allowlisted network can't retrieve them either. **Embed as base64 data URIs** (the "LingoVibe manner") — with layered fallback (photo → SVG bust → monogram). Portraits were recovered by programmatically cropping the user's library screenshot (tile-boundary detection via brightness-valley analysis).

### 8.5 CDN scripts can be blocked
jsPDF failed to load → replaced with a **from-scratch PDF 1.4 writer** (`pdfLatin/pdfWrap/downloadPDF`): Times fonts, A4, word-wrap, pagination, xref table — validated externally with `pdfinfo` (12-page output from a real 5,204-word chapter). mammoth (docx) still loads from cdnjs with graceful failure.

### 8.6 Patch-tooling lessons (for building similar apps by script)
Python heredocs break on JS template literals containing `"""` and on `\u` escapes in `re.subn` string replacements — use file-based payloads and `lambda m: payload`; verify every anchor with `s.count(old)==1` *before* writing; distinguish literal em-dashes in HTML from `\u2014` escape sequences in JS strings; after every patch run: `new Function(scriptContent)` syntax check, CSS brace balance, div balance, keyword presence, and unit tests of pure functions against the user's real document.

---

## 9. Integrity principles (the product's spine)

1. **Blind judging:** the examiner never sees prior scores or round context; corrector and judge never share state.
2. **No score paths:** displayed scores are exactly what the examination returned; "best round" selection prevents ending worse, never inflates.
3. **Anchor criteria, not distributions** (§6.2).
4. **Automate language, gate substance:** correctors rewrite prose freely but preserve facts, numbers, equations, and citation markers; anything touching *sourcing* (citation inserts) requires per-item human approval; originality help is proposals to adopt, not silent insertion.
5. **Honest capability labels:** plagiarism = sampled spot-check, not Turnitin; NOT FOUND ≠ proven fake; sampled corrections noted; AI-disclosure reminder in the refiner.
6. **Fail loud, fail specific:** stalls report "likely rate limit," not fake progress; storage limits explain session-only mode; empty summaries synthesize rather than render blank.
7. **The author owns the final read:** corrected text is different text; the UI and messaging push the user to read what they will defend.

---

## 10. Reusable components inventory

| Component | Purpose |
|---|---|
| `parseJSON` | balanced-brace JSON extraction from LLM replies |
| `fuzzyFind` / `fuzzyReplaceAll` | typography-tolerant verbatim-quote patching |
| `sampleDoc` | begin/middle/end sampling with offsets |
| `chunkText` + multi-pass loop | long-document correction under token limits |
| `citationStats`, `uncitedParagraphs`, `referenceSection` | local citation analytics |
| `duplicateBlocks`, `orphanQuotes`, `pickPlagSentences` | local originality analytics |
| `parseReferences`, `parseCitationsF` | reference-list + marker parsing (ranges/lists) |
| `callClaudeSearch` | web-search-enabled artifact API calls |
| `refVerifyCache` pattern | evidence-gated, sticky verdicts for nondeterministic checks |
| built-in PDF writer | dependency-free PDF export |
| `downloadWord` (HTML-blob .doc) | dependency-free Word export |
| capability-aware storage wrapper | graceful degradation in restricted hosts |
| committee/faculty character system | task-representing animated cast with layered art fallbacks |
| `speechSynthesis` voice layer | per-character spoken lines with gesture-policy handling |

## 11. Deployment note

For real hosting (e.g., Hostinger): the artifact-injected API auth does not exist outside Claude previews — route `callClaude*` through a small server-side proxy holding the API key, and swap `window.storage` for `localStorage`. Everything else is portable as-is.
