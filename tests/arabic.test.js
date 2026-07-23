'use strict';
/* Arabic-fixture coverage (، ؛ «» and RTL text) — the invariants require the
   analytics to keep working on Arabic chapters, not just English ones. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, declarationsOf, scriptSource } = require('../tools/extract-functions.js');

const F = load(['parseReferences', 'parseCitationsF', 'citationStats', 'orphanQuotes', 'docLangLine', 'fuzzyFind', 'buildNorm', 'NORM_MAP']);
const AR = fs.readFileSync(path.join(__dirname, '..', 'eval', 'fixture-chapter-ar.txt'), 'utf8');

test('parseReferences finds numbered Arabic entries under an English heading', () => {
  const pr = F.parseReferences(AR);
  assert.ok(pr.start > 0);
  assert.equal(pr.entries.length, 3);
  assert.ok(pr.entries[0].text.includes('الماسي'));
});

test('KNOWN LIMITATION: an Arabic-only heading (المراجع) is not recognised', () => {
  // Pinned so a future fix is a conscious, tested change. Arabic theses that
  // use only «المراجع» as the heading currently get no reference parsing.
  const arOnly = AR.replace('References', 'المراجع');
  const pr = F.parseReferences(arOnly);
  assert.equal(pr.start, -1);
});

test('citation markers with Western digits are found in Arabic text', () => {
  const pr = F.parseReferences(AR);
  const found = F.parseCitationsF(AR, pr.start);
  assert.deepEqual([...found.keys()].sort(), [1, 2, 3]);
  const cs = F.citationStats(AR);
  assert.equal(cs.hasRefList, true);
  assert.ok(cs.markers >= 6, 'body [1][2][3] plus the three list markers');
});

test('orphanQuotes reads «guillemet» quotes', () => {
  const out = F.orphanQuotes(AR);
  assert.ok(out.length >= 1);
  assert.ok(out[0].includes('الاستبانة تقيس'), 'the uncited «...» reviewer quote');
});

test('docLangLine (effective definition): Arabic detected, English silent', () => {
  const arLine = F.docLangLine(AR);
  assert.ok(/Arabic/.test(arLine));
  assert.ok(arLine.includes('[n] citation markers'));
  assert.equal(F.docLangLine('A plain English methods paragraph.'), '',
    'effective definition returns NOTHING for non-Arabic documents');
});

test('KNOWN DEFECT (pinned): docLangLine is declared twice with different behaviour', () => {
  /* The file contains an earlier, more capable definition (always instructs
     "reply in the document's language" — correct for tr/id/fr/es documents)
     and a later Arabic-only definition. In JS the LATER one wins, so the
     multilingual version is dead code and non-Arabic non-English documents
     get no language instruction at all. Fixing this changes engine prompts
     (grading-adjacent) — it needs an EXAMINER_VERSION decision, so this test
     pins the current state until that decision is made. */
  const decls = declarationsOf(scriptSource(), 'docLangLine');
  assert.equal(decls.length, 2);
});

test('fuzzyFind works on Arabic text with Arabic punctuation', () => {
  const hit = F.fuzzyFind(AR, 'إطارُ المعاينة عنايةً خاصة');
  assert.ok(hit);
  assert.ok(AR.slice(hit.start, hit.end).includes('المعاينة'));
});
