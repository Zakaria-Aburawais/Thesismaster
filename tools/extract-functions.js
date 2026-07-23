'use strict';
/* Extracts named top-level declarations from thesismaster.html's <script> so
   node:test can exercise the app's pure functions without a browser DOM.
   The app is a single hand-authored file with no module system; this is the
   seam that makes it testable without changing how it is built.

   Guarantees:
   - every extracted declaration is re-parsed standalone (new Function) —
     a mis-extraction fails loudly, never silently truncates;
   - declarations are emitted in file order, so const/let initialization
     order (TDZ) matches the app;
   - duplicate function names return ALL occurrences; load() uses the LAST,
     which is what the browser executes (later declarations win). */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'thesismaster.html');

function scriptSource() {
  const m = fs.readFileSync(HTML_PATH, 'utf8').match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('no <script> block in thesismaster.html');
  return m[1];
}

/* If src[i] is '/' opening a regex literal, return the index of its closing
   '/', honouring \escapes and [character classes] (where '/' and quotes are
   plain characters — the case that breaks naïve scanners). -1 if this can't
   be a regex literal (falls back to division). */
function regexEnd(src, i) {
  let cls = false;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '\n') return -1;
    if (cls) { if (c === ']') cls = false; }
    else if (c === '[') cls = true;
    else if (c === '/') return j;
  }
  return -1;
}

/* Characters/keywords after which a '/' must start a regex, not division. */
const RE_BEFORE = /[(,=:[!&|?{};+\-*%~^<>]/;
const RE_KEYWORD = /(?:^|[^\w$])(return|case|typeof|in|of|do|else|void|delete|instanceof|new|yield)$/;

/* Core scanner: walks src from `start` tracking (){}[] depth outside
   strings, comments, and regex literals.
   stopAt(c, depth) is called for each code character; return true to stop.
   Returns the stop index. */
function scanCode(src, start, stopAt) {
  let depth = 0, q = null, word = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === '\\') i++;
      else if (q === '//' && c === '\n') q = null;
      else if (q === '/*' && c === '*' && n === '/') { q = null; i++; }
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; word = ''; continue; }
    if (c === '/' && n === '/') { q = '//'; continue; }
    if (c === '/' && n === '*') { q = '/*'; continue; }
    if (c === '/') {
      const prev = word || lastSigOf(src, i);
      if (prev === '' || RE_BEFORE.test(prev.slice(-1)) || RE_KEYWORD.test(prev)) {
        const e = regexEnd(src, i);
        if (e > -1) { i = e; word = ''; continue; }
      }
      word = '';
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    if (stopAt(c, depth, i)) return i;
    word = /[\w$]/.test(c) ? word + c : (/\s/.test(c) ? word : '');
  }
  throw new Error('scanCode ran off the end from index ' + start);
}

/* Last non-whitespace char before index i (cheap fallback when the tracked
   word buffer is empty, e.g. right after a string or nested scan). */
function lastSigOf(src, i) {
  for (let j = i - 1; j >= 0; j--) if (!/\s/.test(src[j])) return src[j];
  return '';
}

/* All top-level declarations of `name`, in file order: [{src, index}] */
function declarationsOf(source, name) {
  const out = [];
  const fnRe = new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + name + '\\s*\\(', 'g');
  let m;
  while ((m = fnRe.exec(source))) {
    const start = m.index + m[1].length;
    // depth returns to 0 at the '}' closing the function body
    const end = scanCode(source, start, (c, depth) => c === '}' && depth === 0);
    out.push({ src: source.slice(start, end + 1), index: start });
  }
  const constRe = new RegExp('(^|\\n)\\s*(const|let|var)\\s+' + name + '\\s*=', 'g');
  while ((m = constRe.exec(source))) {
    const start = m.index + m[1].length;
    const end = scanCode(source, constRe.lastIndex, (c, depth) => c === ';' && depth === 0);
    out.push({ src: source.slice(start, end + 1), index: start });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/* Load the named declarations and return them. Evaluated in the CURRENT
   realm (not a vm context) so returned objects share the test's prototypes
   and assert.deepStrictEqual works. opts.globals — extra values visible to
   the loaded functions (app state like `library`), passed as parameters so
   nothing leaks onto globalThis. */
function load(names, opts = {}) {
  const source = scriptSource();
  const picked = [];
  for (const n of names) {
    const decls = declarationsOf(source, n);
    if (!decls.length) throw new Error('declaration not found in app script: ' + n);
    const d = decls[decls.length - 1]; // later declarations win, as in the browser
    new Function(d.src); // extraction sanity: must parse standalone
    picked.push(d);
  }
  picked.sort((a, b) => a.index - b.index); // preserve app initialization order
  const globals = opts.globals || {};
  const keys = Object.keys(globals);
  const body = picked.map(d => d.src).join('\n') + '\nreturn {' + names.join(',') + '};';
  return new Function(...keys, body)(...keys.map(k => globals[k]));
}

module.exports = { load, declarationsOf, scriptSource, scanCode };
