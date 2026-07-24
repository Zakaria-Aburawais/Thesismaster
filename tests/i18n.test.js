'use strict';
/* i18n integrity: six languages, one key set. A key added to en but missing
   in ar/tr/id/fr/es ships an English string into a localized UI — this test
   makes partial translation a CI failure, and verifies every t('key') used
   in the code actually exists. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, scriptSource } = require('../tools/extract-functions.js');

const { I18N, LANGS } = load(['I18N', 'LANGS']);

test('all six languages exist and share the exact same key set', () => {
  const langs = Object.keys(I18N);
  assert.deepEqual(langs.sort(), ['ar', 'en', 'es', 'fr', 'id', 'tr']);
  const base = Object.keys(I18N.en).sort();
  for (const l of langs) {
    assert.deepEqual(Object.keys(I18N[l]).sort(), base, 'key set differs in "' + l + '"');
    for (const k of base) {
      assert.ok(String(I18N[l][k]).trim().length > 0, l + '.' + k + ' is empty');
    }
  }
});

test('LANGS and I18N agree on the language codes', () => {
  assert.deepEqual(LANGS.map(l => l.c).sort(), Object.keys(I18N).sort());
});

test('every t(key) used in the app exists in the dictionaries', () => {
  const src = scriptSource();
  const used = new Set([...src.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map(m => m[1]));
  assert.ok(used.size >= 20, 'expected many t() call sites, found ' + used.size);
  const missing = [...used].filter(k => !(k in I18N.en));
  assert.deepEqual(missing, [], 'keys used in code but absent from I18N.en');
});

test('the wp template carries both placeholders in every language', () => {
  for (const l of Object.keys(I18N)) {
    assert.ok(I18N[l].wp.includes('{w}') && I18N[l].wp.includes('{p}'), 'wp malformed in ' + l);
  }
});
