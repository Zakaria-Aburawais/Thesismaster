'use strict';
/* Init-order regression guard. Real bug: initSettings() was CALLED before
   the `let storageOK` declaration it reads — a TDZ ReferenceError rejected
   the async init silently on every page load, leaving the language switcher
   (and settings restore) dead in all modes. The single-file app has no
   module system to enforce order, so this test does. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scriptSource } = require('../tools/extract-functions.js');

test('initSettings() runs only after storageOK is declared', () => {
  const src = scriptSource();
  const decl = src.search(/let storageOK\s*=/);
  assert.ok(decl > -1, 'storageOK declaration exists');
  const calls = [...src.matchAll(/^\s*initSettings\(\);/gm)].map(m => m.index);
  assert.ok(calls.length >= 1, 'initSettings() is called somewhere');
  for (const c of calls) {
    assert.ok(c > decl, 'initSettings() at index ' + c + ' precedes the storageOK declaration at ' + decl + ' — TDZ crash on load');
  }
});

test('no other early top-level call reads storageOK before it exists', () => {
  const src = scriptSource();
  const decl = src.search(/let storageOK\s*=/);
  // functions that read storageOK on their first synchronous lines
  for (const fn of ['initProfiles', 'initTmSettings']) {
    const re = new RegExp('^\\s*' + fn + '\\(\\);', 'gm');
    for (const m of [...src.matchAll(re)]) {
      assert.ok(m.index > decl, fn + '() is called before storageOK is declared');
    }
  }
});
