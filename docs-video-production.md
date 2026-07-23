# ThesisMaster — How-To Video Production Guide (6 languages)

The app already ships a **localized, narrated, interactive walkthrough** (six steps, in English, Arabic, Turkish, Indonesian, French and Spanish). This guide is for producing *recorded* videos to sit alongside it — for the landing page, YouTube, and app stores.

## 1. Where the videos plug in

`thesismaster.html` → `TOUR_VIDEOS`:

```js
const TOUR_VIDEOS = { en: '', ar: '', tr: '', id: '', fr: '', es: '' };
```

Paste an **embed URL** per language (e.g. `https://www.youtube.com/embed/XXXXXXXX?rel=0`). Any language left empty simply shows the interactive walkthrough — so you can ship one language at a time with no code changes. When a URL is present, the video appears at the top of the walkthrough modal and the six steps remain beneath it as a text summary.

## 2. Narration scripts

**The scripts are already written and translated — they are the walkthrough strings in the app.** For each language, the narration for step *n* is `I18N[lang].sNt` + `I18N[lang].sNb`. Pull them straight from the file so the video and the app always say the same thing.

English reference (steps 1–6):

1. **Add your chapter.** Open the Dashboard and paste your text or upload a .docx file. Each chapter is saved to your portfolio with its full audit history.
2. **Convene the board.** Go to the Audit tab and start the examination. Six scholars judge your chapter across eleven dimensions in four boards.
3. **Read the verdict.** You get a grade, a score for every dimension with the examiner's reasoning, a citation scan of the whole document, and specific flagged passages.
4. **Fix and climb.** Apply the suggested corrections, or run "Audit until it passes": the board rewrites, re-examines blindly, and changes strategy each round until it reaches your target.
5. **Close the gap.** When only substance remains, the assistant matches uncited paragraphs to your existing sources — you approve each one — and proposes original framing angles.
6. **Verify and export.** The References tab checks that every source is real and every citation matches. Then export to Word or PDF with an AI-assistance disclosure statement.

**Opening line (add before step 1):** "ThesisMaster is an examination board for your thesis. Here is how it works, in six steps."
**Closing line (after step 6):** "Your chapter, examined the way your committee will examine it — before they do."

## 3. Shot list (same for every language)

| # | Duration | On screen | Notes |
|---|---|---|---|
| 0 | 0:00–0:10 | Landing hero, slow scroll to the faculty board, one scholar hover | Establishes the product's character |
| 1 | 0:10–0:35 | Dashboard: paste text → chapter card appears | Use a real but anonymized chapter |
| 2 | 0:35–1:00 | Audit tab → committee overlay with the three scholars deliberating | Let the loading animation breathe — it is a signature moment |
| 3 | 1:00–1:35 | Score bars filling, examiner's summary, reference scan chips | Hold on one dimension note so it is readable |
| 4 | 1:35–2:10 | "Audit until it passes" → round trail climbing → gold PASSED seal | The emotional peak of the video |
| 5 | 2:10–2:35 | Close-the-gap: a citation suggestion with its approve button | Say aloud that the user approves each one |
| 6 | 2:35–3:00 | References tab verdicts, then the export menu and the disclosure statement | End on the disclosure — it is the trust close |

Total target: **under 3 minutes.** Record at 1920×1080, 60fps if possible, in **dark mode** for steps 0–4 and switch to **day mode** for 5–6 to show both themes exist.

## 4. Localization specifics

- **Record the UI in the target language.** Switch the app's language selector before capturing — the entire interface, the scholars' introductions, and the committee phrases are all localized, so the footage should match the narration.
- **Arabic:** capture with `dir="rtl"` active (automatic when Arabic is selected). Narration in Modern Standard Arabic (فصحى), not dialect. Subtitles right-aligned.
- **Voice:** a human voice artist is strongly preferred over synthesis for published videos; the in-app narration already covers the synthetic case. Brief the artist to sound like a calm senior academic, not an advertisement.
- **Subtitles:** burn in nothing; ship `.srt` per language so YouTube can index them. Subtitle text = the same strings.
- **Screen text:** avoid captions that duplicate the narration word-for-word; use short keyword overlays instead ("11 dimensions", "blind re-examination", "you approve every citation").

## 5. Honesty rules for the video (non-negotiable)

The video is marketing, and marketing is where products lie. These claims must stay accurate:

- Never state or imply the tool guarantees a grade, or that its score equals a university grade. It is a *predictive examination*, with a stated ±3–4 point variance.
- Never present the plagiarism feature as equivalent to Turnitin. It is a sampled live-web spot-check; say so.
- Never show a citation being inserted without the approval click.
- Do not imply the tool writes a thesis for the user. Position it as examination and preparation — that framing is also what keeps universities recommending rather than banning it.
- If a screen recording is sped up, note it ("accelerated") so nobody expects a 7-round loop in ten seconds.

## 6. Checklist before publishing

- [ ] Footage recorded in the target language, both themes shown
- [ ] Narration matches the app strings (pull from `I18N`)
- [ ] `.srt` subtitles per language
- [ ] Honesty rules reviewed line by line against §5
- [ ] Embed URL pasted into `TOUR_VIDEOS`, validation gate run, `public/index.html` updated
- [ ] Video tested inside the app modal on mobile and desktop
