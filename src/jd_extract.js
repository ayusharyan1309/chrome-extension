(function initJDExtract() {
  if (window.__jdExtract) return;

  const PRIMARY_SELECTORS = [
    'main',
    'article',
    '[class*="description" i]',
    '[id*="description" i]',
    '[class*="job" i][class*="detail" i]',
    '[id*="job" i][id*="detail" i]',
    '[data-testid*="description" i]'
  ];

  const JD_HINT_TERMS = [
    'job description',
    'about the role',
    'responsibilities',
    'requirements',
    'qualifications',
    'what you will do',
    'what we are looking for'
  ];

  function dedupeWhitespace(text) {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .trim();
  }

  function dedupeLines(text) {
    const seen = new Set();
    const out = [];
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(line);
      }
    }
    return out.join('\n');
  }

  function cleanNodeText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('nav, footer, aside, script, style, noscript, form, button').forEach((el) => el.remove());
    return dedupeWhitespace(dedupeLines(clone.innerText || clone.textContent || ''));
  }

  function scoreCandidate(el) {
    const text = cleanNodeText(el);
    if (!text) return { score: -1, text };

    const lower = text.toLowerCase();
    const lengthScore = Math.min(text.length / 300, 10);
    const headingScore = JD_HINT_TERMS.reduce((acc, term) => acc + (lower.includes(term) ? 2 : 0), 0);
    const bulletScore = (text.match(/(^|\n)[\-•]/g) || []).length * 0.2;
    const total = lengthScore + headingScore + bulletScore;

    return { score: total, text };
  }

  function collectCandidates() {
    const set = new Set();

    for (const selector of PRIMARY_SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => set.add(el));
    }

    document.querySelectorAll('section, div').forEach((el) => {
      const header = (el.querySelector('h1, h2, h3')?.innerText || '').toLowerCase();
      if (JD_HINT_TERMS.some((term) => header.includes(term))) {
        set.add(el);
      }
    });

    return Array.from(set);
  }

  function extractFromPage() {
    const candidates = collectCandidates();
    if (!candidates.length) {
      return { ok: false, error: 'No likely job description containers found' };
    }

    let best = { score: -1, text: '' };
    for (const el of candidates) {
      const current = scoreCandidate(el);
      if (current.score > best.score) {
        best = current;
      }
    }

    if (!best.text || best.text.length < 120) {
      return { ok: false, error: 'Extracted text too short; use Select JD mode' };
    }

    return {
      ok: true,
      text: best.text,
      meta: {
        mode: 'auto',
        candidateCount: candidates.length,
        score: best.score
      }
    };
  }

  window.__jdExtract = { extractFromPage, cleanNodeText, dedupeWhitespace };
})();
