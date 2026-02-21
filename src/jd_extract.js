(function initJDExtract() {
  if (window.__jdExtract) return;

  const GENERIC_SELECTORS = [
    'main',
    'article',
    '[class*="description" i]',
    '[id*="description" i]',
    '[class*="job" i][class*="detail" i]',
    '[id*="job" i][id*="detail" i]',
    '[data-testid*="description" i]',
    '[class*="requirements" i]',
    '[id*="requirements" i]',
    '[class*="qualifications" i]',
    '[id*="qualifications" i]'
  ];

  const JD_HINT_TERMS = [
    'job description',
    'about the role',
    'responsibilities',
    'requirements',
    'qualifications',
    'what you will do',
    'what we are looking for',
    'preferred qualifications',
    'minimum qualifications'
  ];

  const NOISE_PATTERNS = [
    /^show more$/i,
    /^show less$/i,
    /^read more$/i,
    /^apply now$/i,
    /^easy apply$/i,
    /^sign in$/i,
    /^create alert$/i,
    /^report this job$/i,
    /^save$/i,
    /^share$/i,
    /^top job picks for you$/i,
    /^based on your profile/i,
    /^are these results helpful/i,
    /^your feedback helps us improve/i,
    /^page \d+ of \d+$/i,
    /^send feedback$/i,
    /^how your profile and resume fit this job$/i,
    /^reactivate premium/i
  ];

  const LINKEDIN_START_MARKERS = [
    'about the job',
    'job description',
    'about this role',
    'responsibilities',
    'qualifications'
  ];

  const LINKEDIN_END_MARKERS = [
    'about the company',
    'top job picks for you',
    'people also viewed',
    'are these results helpful',
    'page 1 of',
    'show all',
    'jobs you may be interested in',
    'insights about this job',
    'insights about this job’s applicants',
    'insights about this job\u2019s applicants',
    'exclusive job seeker insights',
    'hiring & headcount',
    'the latest hiring trend',
    'applicant seniority level',
    'applicant education level',
    'show more premium insights',
    'powered by bing',
    'competitors'
  ];

  function dedupeWhitespace(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .trim();
  }

  function removeNoisyLines(text) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    return lines
      .filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line)))
      .join('\n');
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
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('nav, footer, aside, script, style, noscript, form, button, svg, img').forEach((el) => el.remove());
    const raw = clone.innerText || clone.textContent || '';
    return dedupeWhitespace(dedupeLines(removeNoisyLines(raw)));
  }

  function extractLinesBetweenMarkers(text, startMarkers, endMarkers) {
    const normalized = dedupeWhitespace(text);
    if (!normalized) return '';

    const lower = normalized.toLowerCase();
    let startIndex = 0;
    let foundStart = false;

    for (const marker of startMarkers) {
      const idx = lower.indexOf(marker);
      if (idx >= 0 && (!foundStart || idx < startIndex)) {
        startIndex = idx;
        foundStart = true;
      }
    }

    let endIndex = lower.length;
    for (const marker of endMarkers) {
      const idx = lower.indexOf(marker, foundStart ? startIndex + 1 : 0);
      if (idx >= 0 && idx < endIndex) {
        endIndex = idx;
      }
    }

    const slice = normalized.slice(startIndex, endIndex).trim();
    if (!slice) return '';

    if (!foundStart) {
      const sliceLower = slice.toLowerCase();
      const hasHints = JD_HINT_TERMS.some((term) => sliceLower.includes(term));
      if (!hasHints) return '';
    }

    return dedupeWhitespace(dedupeLines(removeNoisyLines(slice)));
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickButtonsByText(terms) {
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], span[role="button"]'));
    let clickCount = 0;

    for (const button of buttons) {
      const text = (button.innerText || button.textContent || '').trim().toLowerCase();
      if (!text) continue;
      if (!terms.some((term) => text.includes(term))) continue;
      if (!isVisible(button)) continue;

      try {
        button.click();
        clickCount += 1;
      } catch (_err) {
        // Ignore click errors on protected or detached nodes.
      }
    }

    return clickCount;
  }

  function scoreText(text, source = 'generic') {
    if (!text) return { score: -1, text, source };

    const lower = text.toLowerCase();
    const lineCount = text.split('\n').length;
    const lengthScore = Math.min(Math.log1p(text.length) * 1.7, 14);
    const hintScore = JD_HINT_TERMS.reduce((acc, term) => acc + (lower.includes(term) ? 2.5 : 0), 0);
    const bulletScore = Math.min((text.match(/(^|\n)\s*[\-•*]/g) || []).length * 0.2, 5);
    const sectionScore = ['responsibilities', 'requirements', 'qualifications', 'experience'].reduce(
      (acc, term) => acc + (lower.includes(term) ? 1.5 : 0),
      0
    );

    let noisePenalty = 0;
    const noiseWords = [
      'sign in',
      'cookies',
      'privacy policy',
      'create alert',
      'recruiter',
      'top job picks for you',
      'are these results helpful',
      'page 1 of',
      'send feedback'
    ];
    for (const word of noiseWords) {
      if (lower.includes(word)) noisePenalty += 0.9;
    }

    const shortPenalty = text.length < 250 || lineCount < 6 ? 3 : 0;
    const score = lengthScore + hintScore + bulletScore + sectionScore - noisePenalty - shortPenalty;

    return { score, text, source };
  }

  function scoreCandidate(el, source = 'generic') {
    return scoreText(cleanNodeText(el), source);
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
  }

  function collectBySelectors(selectors) {
    const out = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => out.push(el));
    }
    return uniqueElements(out);
  }

  function selectBest(candidates) {
    let best = { score: -1, text: '', source: 'none' };
    for (const candidate of candidates) {
      if (candidate.score > best.score) {
        best = candidate;
      }
    }
    return best;
  }

  function extractLinkedInStrategy() {
    if (!/linkedin\.com$/i.test(location.hostname) && !/linkedin\.com$/i.test(location.hostname.replace(/^www\./i, ''))) {
      return null;
    }

    clickButtonsByText(['show more', 'see more', 'more']);

    const selectors = [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.show-more-less-html__markup',
      '[class*="jobs-description" i]',
      '.jobs-search__job-details--container',
      '.jobs-details__main-content',
      '#job-details',
      '[data-job-id] .jobs-description-content__text'
    ];

    const nodes = collectBySelectors(selectors);
    if (!nodes.length) return null;

    const focusedCandidates = [];
    for (const node of nodes) {
      const raw = cleanNodeText(node);
      if (!raw) continue;
      const focused = extractLinesBetweenMarkers(raw, LINKEDIN_START_MARKERS, LINKEDIN_END_MARKERS);
      if (!focused) continue;

      const scored = scoreText(focused, 'linkedin-focused');
      if (scored.text) {
        focusedCandidates.push(scored);
      }
    }

    if (focusedCandidates.length) {
      // Strong bias toward focused extraction on LinkedIn job pages.
      for (const item of focusedCandidates) {
        item.score += 8;
      }
      const focusedBest = selectBest(focusedCandidates);
      if (focusedBest.text.length >= 120) return focusedBest;
    }

    const scored = nodes.map((el) => scoreCandidate(el, 'linkedin'));
    const best = selectBest(scored);
    return best.text ? best : null;
  }

  function extractSemanticContainerStrategy() {
    const nodes = collectBySelectors(GENERIC_SELECTORS);
    if (!nodes.length) return null;

    const scored = nodes.map((el) => scoreCandidate(el, 'semantic'));
    const best = selectBest(scored);
    return best.text ? best : null;
  }

  function extractHeadingAnchoredStrategy() {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, strong'));
    const candidates = [];

    for (const heading of headings) {
      const text = (heading.innerText || heading.textContent || '').trim().toLowerCase();
      if (!text) continue;
      if (!JD_HINT_TERMS.some((term) => text.includes(term))) continue;

      const scope =
        heading.closest('section, article, [class*="description" i], [id*="description" i], [class*="content" i]') ||
        heading.parentElement ||
        null;
      if (scope) candidates.push(scope);
    }

    if (!candidates.length) return null;

    const scored = uniqueElements(candidates).map((el) => scoreCandidate(el, 'heading-anchored'));
    const best = selectBest(scored);
    return best.text ? best : null;
  }

  function extractLargestReadableStrategy() {
    const root = document.querySelector('main') || document.body;
    if (!root) return null;

    const blocks = Array.from(root.querySelectorAll('section, article, div'))
      .filter((el) => isVisible(el))
      .filter((el) => (el.innerText || '').length >= 300)
      .slice(0, 250);

    if (!blocks.length) return null;

    const scored = blocks.map((el) => scoreCandidate(el, 'largest-readable'));
    const best = selectBest(scored);
    return best.text ? best : null;
  }

  function extractFromPage() {
    const strategies = [
      extractLinkedInStrategy,
      extractSemanticContainerStrategy,
      extractHeadingAnchoredStrategy,
      extractLargestReadableStrategy
    ];

    const outcomes = [];
    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result?.text) outcomes.push(result);
      } catch (_err) {
        // Strategy failed, continue with next strategy.
      }
    }

    if (!outcomes.length) {
      return { ok: false, error: 'No likely job description containers found' };
    }

    const best = selectBest(outcomes);
    if (!best.text || best.text.length < 120) {
      return { ok: false, error: 'Extracted text too short; use Select JD mode' };
    }

    let finalText = best.text;
    if (/linkedin\.com$/i.test(location.hostname) || /linkedin\.com$/i.test(location.hostname.replace(/^www\./i, ''))) {
      const tightened = extractLinesBetweenMarkers(best.text, LINKEDIN_START_MARKERS, LINKEDIN_END_MARKERS);
      if (tightened && tightened.length >= 120) {
        finalText = tightened;
      }
    }

    return {
      ok: true,
      text: finalText,
      meta: {
        mode: 'auto',
        strategy: best.source,
        triedStrategies: outcomes.map((x) => x.source),
        score: Number(best.score.toFixed(2)),
        chars: finalText.length
      }
    };
  }

  window.__jdExtract = {
    extractFromPage,
    cleanNodeText,
    dedupeWhitespace,
    clickButtonsByText
  };
})();
