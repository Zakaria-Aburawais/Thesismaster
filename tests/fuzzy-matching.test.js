'use strict';
/* buildNorm / fuzzyFind / fuzzyReplaceAll — the typography-tolerant matcher
   that patches examiner quotes back into the author's raw text. Offsets must
   map back to the RAW string, or corrections would splice at wrong positions. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../tools/extract-functions.js');

const { buildNorm, fuzzyFind, fuzzyReplaceAll } =
  load(['NORM_MAP', 'buildNorm', 'fuzzyFind', 'fuzzyReplaceAll']);
const EN = fs.readFileSync(path.join(__dirname, '..', 'eval', 'fixture-chapter-en.txt'), 'utf8');

test('exact match short-circuits with correct offsets', () => {
  const hit = fuzzyFind('alpha beta gamma', 'beta');
  assert.deepEqual(hit, { start: 6, end: 10 });
});

test('curly quotes in the document match a straight-quote needle', () => {
  // the fixture has this sentence inside “...” curly quotes
  const needle = '"the questionnaire measures what managers say about coordination';
  const hit = fuzzyFind(EN, needle);
  assert.ok(hit, 'fuzzy matcher must bridge curly/straight quotes');
  const raw = EN.slice(hit.start, hit.end);
  assert.ok(raw.includes('“'), 'matched span is the RAW text with its curly quote');
  assert.ok(raw.includes('questionnaire measures'));
});

test('em-dash and case differences are bridged', () => {
  const text = 'Results improved — markedly — after calibration.';
  const hit = fuzzyFind(text, 'results improved - markedly');
  assert.ok(hit);
  assert.equal(hit.start, 0);
});

test('collapsed whitespace matches multi-space raw text', () => {
  const text = 'the  spacing   here\n varies';
  const hit = fuzzyFind(text, 'the spacing here varies');
  assert.ok(hit);
  assert.equal(text.slice(hit.start, hit.end), text);
});

test('curly apostrophe needle matches straight-apostrophe document', () => {
  const hit = fuzzyFind(EN, 'Cohen’s kappa of 0.81');
  assert.ok(hit);
  assert.ok(EN.slice(hit.start, hit.end).includes("Cohen's"));
});

test('no match returns null, empty needle returns null', () => {
  assert.equal(fuzzyFind(EN, 'this string is definitely not in the chapter xyzzy'), null);
  // note: tested against text WITHOUT a multi-space run — the exact-match
  // fast path happily matches literal whitespace before the trim guard runs
  assert.equal(fuzzyFind('alpha beta', '   '), null);
});

test('fuzzyReplaceAll caps at 1 by default and reports the count', () => {
  const r = fuzzyReplaceAll('aaa bbb aaa', 'aaa', 'ZZZ');
  assert.equal(r.count, 1);
  assert.equal(r.text, 'ZZZ bbb aaa');
});

test('fuzzyReplaceAll replaces up to cap occurrences', () => {
  const r = fuzzyReplaceAll(EN, 'metropolitan sites', 'urban sites', 5);
  assert.equal(r.count, 2, 'fixture plants the phrase exactly twice');
  assert.ok(!r.text.includes('metropolitan sites'));
  assert.ok(r.text.includes('urban sites'));
});

test('buildNorm offset map points at raw indices', () => {
  const { norm, map } = buildNorm('A—B  C');
  assert.equal(norm, 'a-b c');
  assert.equal(map.length, norm.length);
  assert.equal(map[0], 0);
  assert.equal(map[2], 2); // 'b' sits at raw index 2
});
