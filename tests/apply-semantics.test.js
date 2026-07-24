'use strict';
/* Patch-application semantics (regression guard for a real bug: applying
   review revisions dropped a score from 71 to 41).

   Contract: a review issue or audit flag quotes ONE specific passage and its
   replacement is written for that context — it must be applied with cap 1.
   Replacing further fuzzy matches of a short excerpt pastes the revision
   into unrelated sentences and corrupts the document. Document-wide fixes
   are exclusively the recurring[] find/replace mechanism, which by design
   uses a high cap. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scriptSource, load } = require('../tools/extract-functions.js');

test('quoted-passage replacements use cap 1; recurring fixes stay document-wide', () => {
  const src = scriptSource();
  const calls = [...src.matchAll(/fuzzyReplaceAll\(\s*\w+\s*,\s*([\w.]+)\s*,\s*([\w.]+)\s*,\s*(\d+)\s*\)/g)]
    .map(m => ({ find: m[1], replace: m[2], cap: +m[3] }));
  assert.ok(calls.length >= 4, 'expected the known call sites, found ' + calls.length);
  for (const c of calls) {
    if (/\.(excerpt|quote)$/.test(c.find)) {
      assert.equal(c.cap, 1, c.find + ' targets one quoted passage — cap must be 1, found ' + c.cap);
    }
    if (/\.find$/.test(c.find)) {
      assert.ok(c.cap >= 10, c.find + ' is a document-wide recurring fix — cap must be high, found ' + c.cap);
    }
  }
});

test('review revisions replace whole sentences and refuse advice', () => {
  const src = scriptSource();
  assert.ok(/looksLikeAdvice\(i\.revision\)/.test(src), 'apply path must guard against advice-shaped revisions');
  assert.ok(/replaceSentenceIn\(newText,\s*i\.excerpt/.test(src), 'review apply must replace the containing sentence, not splice the fragment');
  assert.ok(/ENTIRE corrected sentence/.test(src), 'review prompt must demand full-sentence revisions');
});

test('cap 1 on a repeated phrase touches only the first occurrence', () => {
  const { fuzzyReplaceAll } = load(['NORM_MAP', 'buildNorm', 'fuzzyFind', 'fuzzyReplaceAll']);
  const doc = 'Solar energy is cost effective. Storage helps. Solar energy is cost effective in cold climates too.';
  const r = fuzzyReplaceAll(doc, 'Solar energy is cost effective', 'Evidence suggests solar energy is cost effective', 1);
  assert.equal(r.count, 1);
  assert.ok(r.text.startsWith('Evidence suggests solar energy is cost effective. Storage helps.'));
  assert.ok(r.text.includes('Solar energy is cost effective in cold climates too.'), 'second occurrence untouched');
});

const F2 = load(['NORM_MAP', 'buildNorm', 'fuzzyFind', 'replaceSentenceIn', 'looksLikeAdvice']);

test('replaceSentenceIn: a fragment excerpt swaps the WHOLE containing sentence', () => {
  const doc = 'Costs fell sharply. Perovskite devices have demonstrated certified efficiencies exceeding 25%, yet stability limits commercial use. Deployment continues.';
  const out = F2.replaceSentenceIn(doc, 'certified efficiencies exceeding 25%',
    'Perovskite devices have demonstrated certified laboratory efficiencies exceeding 25% [Author, Year], although stability constrains near-term deployment.');
  assert.equal(out,
    'Costs fell sharply. Perovskite devices have demonstrated certified laboratory efficiencies exceeding 25% [Author, Year], although stability constrains near-term deployment. Deployment continues.');
  assert.ok(!out.includes('yet stability limits'), 'no orphaned tail of the old sentence');
});

test('replaceSentenceIn: decimals do not truncate the sentence', () => {
  const doc = 'Older claim here. Degradation rates of 0.5–0.8% per annum reduce yield over time. Final sentence.';
  const out = F2.replaceSentenceIn(doc, 'reduce yield over time',
    'Degradation rates of 0.5–0.8% per annum appear to reduce long-term yield [Author, Year].');
  assert.ok(out.startsWith('Older claim here. Degradation rates of 0.5–0.8% per annum appear'));
  assert.ok(out.endsWith('Final sentence.'));
  assert.equal((out.match(/0\.5–0\.8%/g) || []).length, 1, 'no doubled decimal clause');
});

test('replaceSentenceIn: sentence at document start and end, and Arabic ؟', () => {
  const out1 = F2.replaceSentenceIn('First sentence here. Second.', 'First sentence', 'A corrected opening sentence.');
  assert.equal(out1, 'A corrected opening sentence. Second.');
  const out2 = F2.replaceSentenceIn('Second. Last claim stands', 'Last claim', 'The final claim is bounded.');
  assert.equal(out2, 'Second. The final claim is bounded.');
  const ar = 'هل تقيس الاستبانة التنسيق فعليًا؟ نعم إلى حد ما.';
  const out3 = F2.replaceSentenceIn(ar, 'تقيس الاستبانة', 'هل تقيس الاستبانة السلوك المسجل؟');
  assert.equal(out3, 'هل تقيس الاستبانة السلوك المسجل؟ نعم إلى حد ما.');
});

test('replaceSentenceIn returns null when the excerpt is absent; missing terminator added', () => {
  assert.equal(F2.replaceSentenceIn('Some text.', 'not present anywhere', 'X.'), null);
  const out = F2.replaceSentenceIn('One two three. Tail.', 'two three', 'A revision without terminator');
  assert.equal(out, 'A revision without terminator. Tail.');
});

test('looksLikeAdvice: instructions are refused, prose is accepted', () => {
  assert.ok(F2.looksLikeAdvice('Replace all instances with real references before submission.'));
  assert.ok(F2.looksLikeAdvice('Consider adding a citation here'));
  assert.ok(F2.looksLikeAdvice('Ensure the units are consistent.'));
  assert.ok(!F2.looksLikeAdvice('Evidence suggests the reduction is durable [Author, Year].'));
  assert.ok(!F2.looksLikeAdvice('The data indicate a persistent effect across sites.'));
});
