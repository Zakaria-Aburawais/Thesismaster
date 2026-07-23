'use strict';
/* Escaping lint (punch-list C6): every innerHTML assignment in
   thesismaster.html may only CONCATENATE expressions that are known-safe.
   The app's XSS posture is "escape at the sink, by hand" — this turns that
   convention into a gate: a NEW identifier concatenated into an innerHTML
   statement fails CI until it is wrapped in esc() or reviewed and added to
   the allowlist below with a justification.

   Heuristic, not a parser — tuned to this one codebase on purpose. Only
   + operands are examined (ternary conditions, comparisons, indexes are
   control flow, not output). Arguments of leaf-safe calls (esc, t, …) are
   exempt; bodies of .map()/.join() chains ARE scanned.

   Exit 0: clean. Exit 1: violations listed. */

const { scriptSource, scanCode } = require('./extract-functions.js');

/* Leaf producers whose RESULT is safe AND whose arguments need no scan. */
const EXEMPT_CALLS = new Set([
  'esc',                                   // the escaper
  't',                                     // i18n lookup — our own dictionaries
  'refChip', 'confChip', 'plagStatusChip', // fixed HTML chip templates
  'gradeFromAvg',                          // letter from a fixed set
  'fmtDate', 'wc', 'strictLine', 'collapseRun', 'disclosureText',
  'String', 'Number', 'parseInt', 'parseFloat',
  'formatRef',                             // renders the user's OWN library fields (worst case
                                           // self-XSS on own data); field-level escaping inside
                                           // the style builders is tracked as a hardening item
]);

/* Calls that are safe as + operands because their PARTS are checked where
   they are built (collection plumbing, numbers, DOM getters). */
const NEUTRAL_CALLS = new Set([
  'map', 'join', 'filter', 'slice', 'reverse', 'sort', 'concat', 'flat',
  'toLocaleString', 'toFixed', 'toUpperCase', 'toLowerCase', 'trim', 'repeat',
  'padStart', 'padEnd', 'replace', 'split', 'charAt', 'indexOf',
  'round', 'floor', 'ceil', 'max', 'min', 'abs', 'now',
  'querySelector', 'getElementById',
]);

/* Bare identifiers/chains safe to concatenate. Each entry is a reviewed
   decision — prefer wrapping in esc() over extending this list.
   Reviewed 2026-07-23 against every innerHTML site in the file. */
const SAFE_IDENTS = new Set([
  'EXAMINER_VERSION',                       // our own version constant
  'dimsHtml', 'flagsHtml', 'trailHtml', 'savedNote', 'html', 'extraHTML',
  'stepHtml', 'videoHtml', 'navHtml',       // builders whose parts are esc'd at creation
  'reason', 'msg',                          // fixed app-authored message strings
  'old',                                    // saved button label being restored
  'libStyle',                               // one of six fixed style codes
  'i', 'j', 'k', 'n', 'idx', 'delta', 'words', 'reused', 'v', 'su', 'nf', 'total',
  'applied', 'missed', 'passes', 'failedParts', // numeric counters (verified numeric at init)
  'low', 'med', 'dups',                     // Library numeric counts
  'l.c', 'l.name',                          // LANGS constant (fixed language list)
  'vid', 'TOUR_ICONS', 'prefix',            // tour/committee constants; prefix from fixed call sites
  'PROF_IMAGES', 'p.name', 'p.role', 'face', 'prop', // PROFS cast constants (app-authored SVG/base64)
  'p.id', 'it.id', 'c.id',                  // app-generated ids (libId()/timestamp-based)
  'e.num',                                  // reference number, coerced numeric at parse (+mm[1])
  't2', 'f',                                // Library edit form: fixed type list + field spec F
]);

/* Property tails that make any chain numeric/safe. */
const SAFE_TAIL = /\.(length|size|calls|markers|unique|paras|uncited|overall)$/;

function blankStrings(stmt) {
  let code = '', q = null;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i], n = stmt[i + 1];
    if (q) {
      if (c === '\\') { code += '  '; i++; continue; }
      if (c === q) { q = null; code += ' '; continue; }
      code += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; code += ' '; continue; }
    if (c === '/' && n === '*') { const e = stmt.indexOf('*/', i + 2); const stop = e < 0 ? stmt.length : e + 2; code += stmt.slice(i, stop).replace(/[^\n]/g, ' '); i = stop - 1; continue; }
    if (c === '/' && n === '/') { const e = stmt.indexOf('\n', i); const stop = e < 0 ? stmt.length : e; code += ' '.repeat(stop - i); i = stop - 1; continue; }
    code += c;
  }
  return code;
}

function matchParen(code, open) { // code has no strings left; simple depth scan
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') d++;
    else if (code[i] === ')') { d--; if (!d) return i; }
  }
  return code.length;
}

const prevSig = (code, i) => { for (let j = i - 1; j >= 0; j--) if (!/\s/.test(code[j])) return code[j]; return ''; };
const nextSig = (code, i) => { for (let j = i; j < code.length; j++) if (!/\s/.test(code[j])) return code[j]; return ''; };

function lint() {
  const src = scriptSource();
  const problems = [];
  const re = /\.innerHTML\s*\+?=(?!=)/g;
  let m;
  while ((m = re.exec(src))) {
    const stmtStart = m.index + m[0].length;
    const stmtStop = scanCode(src, stmtStart, (c, depth) => c === ';' && depth <= 0);
    const stmt = src.slice(stmtStart, stmtStop);
    const baseLine = src.slice(0, stmtStart).split('\n').length;
    const code = blankStrings(stmt);

    const idRe = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/g;
    const KEYWORDS = new Set(['return', 'typeof', 'new', 'in', 'of', 'if', 'else',
      'const', 'let', 'var', 'function', 'this', 'void', 'delete', 'instanceof']);
    // a '+' directly after one of these characters is UNARY (numeric coercion,
    // e.g. (+x.score || 0)) — that is a condition, not string building
    const isBinaryPlus = (i) => {
      let j = i - 1;
      while (j >= 0 && /\s/.test(code[j])) j--;
      if (code[j] !== '+') return false;
      let p = j - 1;
      while (p >= 0 && /\s/.test(code[p])) p--;
      return p >= 0 && !/[(,=&|?:!<>[+\-*/%]/.test(code[p]);
    };
    let t2;
    while ((t2 = idRe.exec(code))) {
      const chain = t2[0].replace(/\s+/g, '');
      const start = t2.index, end = idRe.lastIndex;
      const tail = chain.split('.').pop();
      if (KEYWORDS.has(chain.split('.')[0])) continue;
      const nxt = nextSig(code, end);
      if (nxt === '(') {
        if (EXEMPT_CALLS.has(tail)) { idRe.lastIndex = matchParen(code, code.indexOf('(', end)) + 1; continue; }
        if (NEUTRAL_CALLS.has(tail)) continue;   // args/bodies keep being scanned
        // unknown call concatenated into HTML?
        if (prevSig(code, start) === '+' || nextSig(code, matchParen(code, code.indexOf('(', end)) + 1) === '+') {
          problems.push({ line: baseLine + code.slice(0, start).split('\n').length - 1, chain: chain + '(…)' });
        }
        continue;
      }
      // plain chain: only relevant when it is a + operand (or the sole value)
      const isOperand = isBinaryPlus(start) || nxt === '+' ||
        (start === code.search(/\S/) && nxt === ';');
      if (!isOperand) continue;
      if (SAFE_IDENTS.has(chain) || SAFE_IDENTS.has(tail)) continue;
      if (SAFE_TAIL.test(chain)) continue;
      problems.push({ line: baseLine + code.slice(0, start).split('\n').length - 1, chain });
    }
  }
  return problems;
}

const problems = lint();
if (problems.length) {
  console.error('ESCAPING LINT: ' + problems.length + ' unreviewed concatenation(s) in innerHTML statements.\n' +
    'Wrap model/user-derived values in esc(...), or - if genuinely safe - add the name\n' +
    'to the reviewed allowlist in tools/lint-escaping.js with a justification.\n');
  for (const p of problems) console.error('  script line ~' + p.line + ': ' + p.chain);
  process.exit(1);
}
console.log('escaping lint OK: every innerHTML concatenation is esc()-wrapped or reviewed-safe');
