'use strict';
/* The hand-rolled PDF text pipeline and grade banding. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../tools/extract-functions.js');

const F = load(['pdfLatin', 'pdfWrap', 'gradeFromAvg']);

test('pdfLatin: typographic characters mapped to Latin-1-safe output', () => {
  assert.equal(F.pdfLatin('em—dash “quoted” → done…'), 'em-dash "quoted" -> done...');
  assert.equal(F.pdfLatin('café'), 'café', 'Latin-1 range passes through');
  assert.equal(F.pdfLatin('中文'), '??', 'outside Latin-1 becomes ?');
});

test('pdfLatin: PDF string syntax characters are escaped', () => {
  assert.equal(F.pdfLatin('f(x) = a\\b'), 'f\\(x\\) = a\\\\b');
});

test('pdfWrap: wraps at word boundaries within max', () => {
  const lines = F.pdfWrap('the quick brown fox jumps over the lazy dog', 15);
  assert.ok(lines.length >= 3);
  for (const l of lines) assert.ok(l.length <= 15);
  assert.equal(lines.join(' '), 'the quick brown fox jumps over the lazy dog');
});

test('pdfWrap: a single overlong word is hard-split, nothing dropped', () => {
  const lines = F.pdfWrap('supercalifragilisticexpialidocious', 10);
  assert.equal(lines.join(''), 'supercalifragilisticexpialidocious');
  for (const l of lines) assert.ok(l.length <= 10);
});

test('gradeFromAvg: letter bands at their exact boundaries', () => {
  const cases = [[95, 'A'], [90, 'A'], [89, 'A-'], [85, 'A-'], [84, 'B+'], [80, 'B+'],
    [79, 'B'], [72, 'B'], [71, 'B-'], [66, 'B-'], [65, 'C+'], [60, 'C+'], [59, 'C'], [50, 'C'], [49, 'F'], [0, 'F']];
  for (const [avg, g] of cases) assert.equal(F.gradeFromAvg(avg), g, 'avg ' + avg);
});
