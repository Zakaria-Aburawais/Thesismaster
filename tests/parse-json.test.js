'use strict';
/* parseJSON — balanced-brace extraction of the FIRST JSON object from noisy
   LLM replies. These are the malformed-reply shapes the app must survive. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../tools/extract-functions.js');

const { parseJSON } = load(['parseJSON']);

test('plain valid object', () => {
  assert.deepEqual(parseJSON('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test('markdown code fences stripped', () => {
  assert.deepEqual(parseJSON('```json\n{"score": 82}\n```'), { score: 82 });
});

test('preamble prose before the object', () => {
  assert.deepEqual(parseJSON('Here is the requested audit:\n{"grade":"B+"}'), { grade: 'B+' });
});

test('trailing commentary after the object is ignored', () => {
  assert.deepEqual(parseJSON('{"a":{"b":2}}\nI hope this helps!'), { a: { b: 2 } });
});

test('only the FIRST complete object is returned', () => {
  assert.deepEqual(parseJSON('{"first":true} {"second":true}'), { first: true });
});

test('braces inside string values do not derail the scan', () => {
  assert.deepEqual(parseJSON('{"note":"uses { and } freely","n":1}'), { note: 'uses { and } freely', n: 1 });
});

test('raw control characters inside strings recover via second pass', () => {
  const out = parseJSON('{"summary":"line one\nline two"}');
  assert.equal(out.summary, 'line one line two');
});

test('escaped quotes inside strings', () => {
  assert.deepEqual(parseJSON('{"q":"he said \\"stop\\""}'), { q: 'he said "stop"' });
});

test('no JSON at all throws', () => {
  assert.throws(() => parseJSON('The model refused to answer.'), /bad json/);
});
