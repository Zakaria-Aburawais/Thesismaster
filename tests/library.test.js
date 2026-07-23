'use strict';
/* Reference Library: BibTeX/RIS importers, marker renumbering, bibliography
   formatting. Importers must never invent fields — a dropped entry is
   acceptable, a guessed one is not (hard invariant 8). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../tools/extract-functions.js');

const F = load([
  'BIB_MAP', 'RIS_MAP', 'libId', 'splitAuthors', 'nameParts', 'initials', 'authorsFor',
  'NUMERIC_STYLES', 'isNumeric', 'formatRef', 'parseBibTeX', 'parseRIS',
  'expandMarkers', 'collapseRun', 'parseReferences', 'renumberText',
  'refMalformedNote', 'bibliographyText'
], { globals: { library: { items: [] }, libStyle: 'ieee' } });

const BIB = `@article{alm2019,
  author = {Almasi, J. and Verren, K.},
  title = {Sequencing Mixed Designs in Infrastructure Research},
  journal = {Journal of Fictional Methods},
  year = {2019},
  volume = {12},
  pages = {45--67}
}

@phdthesis{voss2020,
  author = {Voss, M.},
  title = {Layered Mesh Governance},
  school = {Fictional Institute of Technology},
  year = "2020"
}

@book{broken1,
  author = {Nobody, N.},
  year = {2001}
}
`;

test('parseBibTeX: fields mapped, authors split, types resolved', () => {
  const out = F.parseBibTeX(BIB);
  assert.equal(out.length, 2, 'the no-title entry is dropped, not guessed at');
  const [a, t] = out;
  assert.equal(a.type, 'article');
  assert.equal(a.title, 'Sequencing Mixed Designs in Infrastructure Research');
  assert.equal(a.container, 'Journal of Fictional Methods');
  assert.deepEqual(a.authors, ['Almasi, J.', 'Verren, K.']);
  assert.equal(a.year, '2019');
  assert.equal(a.pages, '45--67');
  assert.equal(t.type, 'thesis');
  assert.equal(t.publisher, 'Fictional Institute of Technology', 'school maps to publisher');
  assert.equal(t.year, '2020', 'quoted field values parse too');
});

const RIS = `TY  - JOUR
AU  - Karim, L.
AU  - Voss, M.
TI  - Signal Integrity in Layered Meshes
JO  - Fictional Networks Quarterly
PY  - 2019/03/01
VL  - 7
SP  - 101
EP  - 118
ER  -
TY  - THES
AU  - Ostrovski, R.
TI  - Bylaws as Data
PB  - Fictional University Press
PY  - 2016
ER  -
TY  - JOUR
AU  - Anon, A.
PY  - 2001
ER  -
`;

test('parseRIS: author accumulation, year extraction, page range join', () => {
  const out = F.parseRIS(RIS);
  assert.equal(out.length, 2, 'the no-title record is dropped');
  const [j, th] = out;
  assert.equal(j.type, 'article');
  assert.deepEqual(j.authors, ['Karim, L.', 'Voss, M.']);
  assert.equal(j.year, '2019', 'year pulled out of a full RIS date');
  assert.equal(j.pages, '101–118', 'SP/EP joined with an en-dash');
  assert.equal(j.container, 'Fictional Networks Quarterly');
  assert.equal(th.type, 'thesis');
  assert.equal(th.publisher, 'Fictional University Press');
});

test('expandMarkers: order of first appearance, ranges expanded, duplicates ignored', () => {
  const order = F.expandMarkers('Alpha [3] beta [1,3] gamma [5-7] delta [2] epsilon [9]');
  assert.deepEqual(order, [3, 1, 5, 6, 7, 2, 9]);
});

test('collapseRun: runs of 3+ collapse to en-dash ranges, pairs stay explicit', () => {
  assert.equal(F.collapseRun([4, 2, 3, 9]), '[2–4, 9]');
  assert.equal(F.collapseRun([2, 1]), '[1, 2]');
  assert.equal(F.collapseRun([7]), '[7]');
});

const RENUM_DOC = `Alpha claim [3]. Beta claim [1,3]. Gamma survey [5-7]. Delta note [2].

References

[1] One, A., "First Fictional Source," 2010.
[2] Two, B., "Second Fictional Source," 2011.
[3] Three, C., "Third Fictional Source," 2012.
[5] Five, E., "Fifth Fictional Source," 2014.
[6] Six, F., "Sixth Fictional Source," 2015.
[7] Seven, G., "Seventh Fictional Source," 2016.
`;

test('renumberText: markers renumbered into order of appearance, list untouched', () => {
  const r = F.renumberText(RENUM_DOC);
  assert.deepEqual(r.order, [3, 1, 5, 6, 7, 2]);
  assert.deepEqual(r.map, { 3: 1, 1: 2, 5: 3, 6: 4, 7: 5, 2: 6 });
  assert.ok(r.newBody.startsWith('Alpha claim [1]. Beta claim [1, 2]. Gamma survey [3–5]. Delta note [6].'));
  assert.ok(r.tail.includes('[1] One, A.'), 'reference list text is preserved for the approval step');
});

test('refMalformedNote: short, placeholder, and no-year defects', () => {
  assert.equal(F.refMalformedNote({ text: 'Short' }), 'entry too short to identify a source');
  assert.equal(F.refMalformedNote({ text: 'TBD — add the analytical transparency citation here.' }), 'placeholder text in entry');
  assert.equal(F.refMalformedNote({ text: 'H. Tan, "Joint Displays for Mixed Methods," Fictional Analysis Letters, vol. 2, pp. 61-74.' }), 'no publication year stated');
  assert.equal(F.refMalformedNote({ text: 'K. Verren, "Survivorship in Grid Federation Samples," Fictional Energy Policy, 2020.' }), '');
});

test('formatRef: IEEE and APA render from the same item without inventing fields', () => {
  const it = { type: 'article', authors: ['Almasi, J.', 'Verren, K.'], title: 'Sequencing Mixed Designs',
    container: 'Journal of Fictional Methods', year: '2019', volume: '12', issue: '3', pages: '45-67' };
  const ieee = F.formatRef(it, 'ieee');
  assert.ok(ieee.includes('J. Almasi and K. Verren, "Sequencing Mixed Designs,"'));
  assert.ok(ieee.includes('vol. 12'));
  const apa = F.formatRef(it, 'apa');
  assert.ok(apa.includes('(2019)'));
  assert.ok(apa.includes('Almasi, J.'));
  const bare = F.formatRef({ type: 'article', title: 'Only a Title' }, 'ieee');
  assert.ok(bare.includes('"Only a Title,"'));
  assert.ok(bare.includes('n.d.'), 'missing year renders as n.d., never a guessed year');
});
