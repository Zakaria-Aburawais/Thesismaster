'use strict';
/* The local citation/originality analytics that feed every audit prompt,
   plus the sampling and chunking machinery — all run against a realistic
   chapter fixture, not toy strings (CLAUDE.md editing lesson). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../tools/extract-functions.js');

const F = load([
  'sampleDoc', 'citationStats', 'uncitedParagraphs', 'referenceSection',
  'duplicateBlocks', 'orphanQuotes', 'pickPlagSentences',
  'parseReferences', 'parseCitationsF', 'chunkText', 'splitOffsets'
]);
const EN = fs.readFileSync(path.join(__dirname, '..', 'eval', 'fixture-chapter-en.txt'), 'utf8');

test('citationStats: markers, unique sources, ref list, uncited paragraphs', () => {
  const cs = F.citationStats(EN);
  // body: [1] [2-4] [5] [7,9] [6] = 5, reference list [1]..[8] = 8, (Almasi, 2021) = 1
  assert.equal(cs.markers, 14);
  // digits seen inside [..] anywhere; note "[2-4]" contributes 2 and 4 (not 3) here
  assert.equal(cs.unique, 9);
  assert.equal(cs.hasRefList, true);
  assert.equal(cs.paras, 8, 'substantive paragraphs (>200 chars)');
  assert.equal(cs.uncited, 3, 'sampling-frame, reviewer-quote, interview-phase paragraphs');
});

test('uncitedParagraphs: offset-tracked, skips headings and cited paragraphs', () => {
  const out = F.uncitedParagraphs(EN);
  assert.equal(out.length, 3);
  assert.ok(out[0].text.startsWith('The sampling frame'));
  for (const p of out) {
    assert.equal(EN.slice(p.start, p.end).trim(), p.text, 'offsets must map back to the raw document');
  }
});

test('referenceSection returns the list from its heading, capped', () => {
  const s = F.referenceSection(EN);
  assert.ok(s.includes('[1] J. Almasi'));
  assert.ok(s.length <= 2400);
});

test('duplicateBlocks catches the planted repeated 10-gram', () => {
  const hits = F.duplicateBlocks(EN);
  assert.ok(hits.length >= 1 && hits.length <= 3);
  assert.ok(hits[0].fragment.includes('measurement campaign was repeated'));
});

test('orphanQuotes: uncited quote flagged, cited quote passed over', () => {
  const out = F.orphanQuotes(EN);
  assert.ok(out.length >= 1);
  assert.ok(out[0].startsWith('the questionnaire measures'), 'reviewer quote has no citation within 90 chars');
  // the Verren quote is followed by [5] and must NOT be flagged
  assert.ok(!out.some(q => q.includes('grid federation studies')));
  // KNOWN BEHAVIOUR (candidate fix, grading-adjacent): the scan is not
  // body-only, and straight-quote pairing has no direction — inside an
  // IEEE-style reference list a CLOSING title quote pairs with the NEXT
  // title's OPENING quote, producing a spurious between-titles "quote" that
  // gets flagged as an orphan. Body-only scanning would fix this.
  assert.equal(out.length, 2);
  assert.ok(out[1].includes('Fictional Ethics Bulletin'), 'spurious between-titles span from the reference list');
});

test('pickPlagSentences: distinctive, length- and letter-ratio-bounded', () => {
  const picked = F.pickPlagSentences(EN, 4);
  assert.ok(picked.length >= 2 && picked.length <= 4);
  for (const s of picked) {
    assert.ok(s.length >= 90 && s.length <= 260);
    assert.ok(s.replace(/[^a-zA-Z]/g, '').length / s.length > 0.7);
  }
});

test('parseReferences: 8 numbered entries, multi-line entry merged', () => {
  const pr = F.parseReferences(EN);
  assert.ok(pr.start > 0);
  assert.equal(pr.entries.length, 8);
  assert.equal(pr.entries[0].num, 1);
  assert.ok(pr.entries[2].text.includes('Federated Dispatch Rooms'), 'continuation line joined into entry [3]');
});

test('parseCitationsF: range [2-4] expands, list [7,9] splits, refs excluded', () => {
  const pr = F.parseReferences(EN);
  const found = F.parseCitationsF(EN, pr.start);
  assert.deepEqual([...found.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 9]);
  assert.ok(found.get(3), 'range [2-4] must expand to include 3');
  assert.ok(!found.has(8), 'entry [8] is never cited in the body');
  // phantom: cited number with no reference entry
  const listed = new Set(pr.entries.map(e => e.num));
  const phantoms = [...found.keys()].filter(n => !listed.has(n));
  assert.deepEqual(phantoms, [9]);
  assert.ok(found.get(9).includes('retention schedule'), 'excerpt shows the citing sentence');
});

test('sampleDoc: short text passes through untouched', () => {
  const r = F.sampleDoc('short text', 5200);
  assert.equal(r.sampled, false);
  assert.equal(r.body, 'short text');
  assert.deepEqual(r.segments, [{ start: 0, end: 10 }]);
});

test('sampleDoc: long text samples begin/middle/end with true offsets', () => {
  const r = F.sampleDoc(EN, 1200);
  assert.equal(r.sampled, true);
  assert.equal(r.segments.length, 3);
  assert.equal(r.segments[0].start, 0);
  assert.equal(r.segments[2].end, EN.length);
  const rebuilt = EN.slice(r.segments[0].start, r.segments[0].end) +
    '\n[... middle of chapter ...]\n' +
    EN.slice(r.segments[1].start, r.segments[1].end) +
    '\n[... end of chapter ...]\n' +
    EN.slice(r.segments[2].start, r.segments[2].end);
  assert.equal(r.body, rebuilt, 'body is exactly the three segment slices');
});

test('chunkText: paragraphs packed under the size cap', () => {
  const chunks = F.chunkText(EN, 800);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 800);
  assert.ok(chunks.some(c => c.includes('Ethical clearance')), 'no paragraph content lost');
});

test('chunkText: a single huge paragraph is hard-split', () => {
  const chunks = F.chunkText('x'.repeat(2500), 1000);
  assert.deepEqual(chunks.map(c => c.length), [1000, 1000, 500]);
});

test('splitOffsets: contiguous jobs, each within max, covering [start,end)', () => {
  const jobs = F.splitOffsets(EN, 0, EN.length, 900);
  assert.equal(jobs[0].start, 0);
  assert.equal(jobs[jobs.length - 1].end, EN.length);
  for (let i = 0; i < jobs.length; i++) {
    assert.ok(jobs[i].end - jobs[i].start <= 900);
    if (i) assert.equal(jobs[i].start, jobs[i - 1].end, 'no gaps, no overlaps');
  }
});
