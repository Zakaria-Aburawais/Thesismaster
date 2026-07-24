'use strict';
/* DEV ONLY — a stand-in for the Anthropic API that speaks the same wire
   format and returns schema-valid replies for every ThesisMaster engine.

   Purpose: exercise the full request → parse → render path of all eight tabs
   without spending a real API key, so plumbing and rendering bugs surface in
   CI-like conditions. It is NOT a model: replies are canned, but they are
   shaped exactly like the real ones, and quotes are lifted verbatim from the
   submitted document so the fuzzy matcher has real work to do.

   Run:  node tools/mock-engine.js [port]        (default 3960)
   Then start the server with ANTHROPIC_API_URL=http://127.0.0.1:3960
   (3906 is reserved by server/test/api.test.js — don't default to it) */

const http = require('http');

const PORT = +process.argv[2] || 3960;

/* Pull a real, locatable sentence fragment out of the submitted document so
   flags/quotes can actually be found by fuzzyFind. */
function realQuote(prompt, words = 9) {
  const body = prompt.split(/<<<|PASSAGE|DOCUMENT|CHAPTER/).pop() || prompt;
  const sentences = body.split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 60 && s.length < 300 && /^[A-Z؀-ۿ]/.test(s) && !/[{}<>\[\]]/.test(s));
  const pick = sentences[Math.floor(sentences.length / 2)] || sentences[0];
  if (!pick) return 'the present design responds to that literature';
  return pick.split(/\s+/).slice(0, words).join(' ').replace(/[,.;:]$/, '');
}

const DIM_NOTES = [
  [72, 'claims defensible but under-argued'], [64, 'evidence thin in places'],
  [58, 'framing follows the literature'], [78, 'terminology used correctly'],
  [74, 'method described reproducibly'], [70, 'tables readable, units consistent'],
  [82, 'clean grammar throughout'], [76, 'paragraphs mostly well-formed'],
  [73, 'register formal, some drift'], [61, 'several claims uncited'],
  [66, 'reference format inconsistent'],
];

function reply(prompt) {
  const q = realQuote(prompt);
  const p = prompt.toLowerCase();

  // --- AUDIT (11-dimension board) ---
  if (p.includes('"dims"') || p.includes('examiner_summary')) {
    const overall = 71;
    return JSON.stringify({
      grade: 'B', overall,
      summary: '[MOCK — fixed test scores, not a real audit] A competent chapter with a clear method. Sourcing and originality need work before submission.',
      dims: DIM_NOTES,
      flags: [
        { issue: 'claim stated without support', quote: q, suggestion: 'attach a source or soften the claim',
          corrected: q.replace(/\b(is|are|shows?)\b/i, m => m + ' reportedly') },
        { issue: 'hedging absent on a strong claim', quote: q, suggestion: 'hedge the assertion',
          corrected: 'Evidence suggests that ' + q.charAt(0).toLowerCase() + q.slice(1) },
      ],
      recurring: [{ find: 'proves', replace: 'suggests' }],
      examiner_summary: 'Attach sources to the uncited passages and sharpen the analytical framing. The method is sound; the argument is not yet defended.',
    });
  }

  // --- REVIEW (supervisor's read) ---
  if (p.includes('model_passage')) {
    return JSON.stringify({
      score: 68,
      verdict: '[MOCK — this fixed 68/100 is test data, not a real judgment] A solid draft with a defensible structure. The argument leans on assertion where it needs evidence, and the register slips into informality.',
      strengths: ['clear methodological sequence', 'consistent terminology', 'readable paragraph structure'],
      issues: [
        { severity: 'high', excerpt: q, comment: 'asserted without evidence an examiner would accept', revision: 'Evidence indicates that ' + q.charAt(0).toLowerCase() + q.slice(1) },
        { severity: 'medium', excerpt: q, comment: 'overstates certainty for the data shown', revision: 'The data suggest ' + q.charAt(0).toLowerCase() + q.slice(1) },
        { severity: 'low', excerpt: q, comment: 'transition missing, paragraph reads as a list', revision: 'Consequently, ' + q.charAt(0).toLowerCase() + q.slice(1) },
      ],
      model_passage: 'The distribution network mediates between transmission and end use, and its governance therefore determines how reform is experienced locally. This chapter examines that mediation directly.',
    });
  }

  // --- REFERENCE VERIFICATION (search-enabled) ---
  // must key results by the ACTUAL [num] values in the prompt's reference list
  if (p.includes('reference authenticity verifier')) {
    const refSec = prompt.slice(prompt.indexOf('REFERENCES:'));
    const nums = [...refSec.matchAll(/\n\[(\d+)\]/g)].map(m => +m[1]);
    return JSON.stringify({
      results: nums.map((num, idx) => idx === 1
        ? { num, status: 'suspect', evidence: 'year: cited 2017, found 2015', note: 'year mismatch in the found record', url: 'https://example.org/s' }
        : { num, status: 'verified', evidence: '', note: 'found with matching author and title', url: 'https://example.org/v' + num }),
    });
  }

  // --- PLAGIARISM SPOT-CHECK ---
  if (p.includes('match') && p.includes('clear') && p.includes('sentence')) {
    return JSON.stringify({
      risk: 'LOW',
      results: [
        { i: 1, status: 'CLEAR', source: '', url: '' },
        { i: 2, status: 'SIMILAR', source: 'Fictional Networks Quarterly', url: 'https://example.org/c' },
        { i: 3, status: 'CLEAR', source: '', url: '' },
      ],
      verdict: 'No verbatim matches found in the sampled sentences. One passage is thematically similar to published work.',
    });
  }

  // --- GAP ASSIST: citation matching ---
  if (p.includes('marker') && p.includes('uncited')) {
    return JSON.stringify({ suggestions: [{ id: 0, marker: '[2]', reason: 'this source covers the decision-rights claim made here' }] });
  }

  // --- GAP ASSIST: originality angles ---
  if (p.includes('angles') && p.includes('framing_paragraph')) {
    return JSON.stringify({
      angles: [
        { title: 'Governance as a measurable variable', description: 'treat decision rights as data rather than context' },
        { title: 'Divergence as the finding', description: 'foreground where self-report and logs disagree' },
      ],
      framing_paragraph: 'This chapter departs from accounts that treat governance as background. By coding decision rights from statute and comparing them with dispatch behaviour, it makes the gap between formal authority and operational practice the object of analysis rather than an aside. The divergences that follow are therefore findings, not noise.',
    });
  }

  // --- REAL-SOURCE FINDER (write tab) ---
  if (p.includes('research librarian') && p.includes('"suggestions"')) {
    return JSON.stringify({
      suggestions: [
        { i: 1, authors: 'Mockman, M. and Testov, T.', title: '[MOCK] A Placeholder Study of Nothing Real', container: 'Journal of Mock Results', year: '2020', url: 'https://example.org/mock', why: '[MOCK] test data — not a real source' },
      ],
    });
  }

  // --- LIBRARY: structured reference extraction ---
  if (p.includes('"authors"') && p.includes('"container"')) {
    return JSON.stringify({
      items: [{ type: 'article', authors: ['Almasi, J.', 'Verren, K.'], title: 'Sequencing Mixed Designs in Infrastructure Research',
        container: 'Journal of Fictional Methods', year: '2019', volume: '12', issue: '3', pages: '45-67', doi: '', url: '' }],
    });
  }

  // --- MANUSCRIPT / REFINER: chunk correction ---
  if (p.includes('"corrected"') || p.includes('"parts"') || p.includes('rewrite')) {
    return JSON.stringify({
      corrected: 'The distribution network forms the final interface between the power system and the end user, and its governance determines how reform is experienced locally.',
      changes: ['tightened phrasing', 'removed redundant clause'],
    });
  }

  // --- WRITE (and any other plain-prose call) ---
  return '[MOCK ENGINE — placeholder text, NOT written by Claude. Scores and prose from this engine are meaningless test data.] ' +
    'The transition to distributed solar generation reshapes the assumptions on which low-voltage distribution networks were designed. ' +
    'Where the network once carried power in a single direction, from substation to consumer, embedded generation now reverses that flow during periods of high irradiance [Author, Year]. ' +
    'This inversion has consequences that are technical and institutional at once: protection schemes calibrated for unidirectional fault current may mis-operate, and the regulatory settlement that assigns responsibility for voltage quality becomes harder to apply [Author, Year]. ' +
    'The literature has examined each consequence in isolation, but rarely together. ' +
    'This thesis argues that the two are inseparable, and that treating them apart is what has made integration slower than the technology alone would predict. ' +
    'The chapters that follow develop this argument through a mixed-methods study of three metropolitan distribution utilities, combining measured network data with interviews conducted in their control rooms.';
}

http.createServer((req, res) => {
  if (!req.url.startsWith('/v1/messages')) { res.writeHead(404); return res.end('mock: not found'); }
  let raw = '';
  req.on('data', d => { raw += d; });
  req.on('end', () => {
    let prompt = '';
    try {
      const body = JSON.parse(raw || '{}');
      prompt = ((body.messages || []).map(m => (typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join(' '))).join('\n'));
    } catch (e) {}
    const text = reply(prompt);
    console.log('[mock] ' + (text.startsWith('{') ? 'JSON ' + text.slice(0, 60) : 'prose') + '…');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant',
      content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 300 } }));
  });
}).listen(PORT, () => console.log('mock engine on http://127.0.0.1:' + PORT));
