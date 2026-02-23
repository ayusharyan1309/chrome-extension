import { computeMatch } from './match.js';
import { generateTailoredResumeStructured, structuredResumeToPlainText } from './llm.js';
import { downloadTailoredResumePdf, downloadTailoredResumeTex } from './docx_export.js';

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o']
  },
  gemini: {
    label: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
  },
  perplexity: {
    label: 'Perplexity',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning']
  }
};

const els = {
  extractAutoBtn: document.getElementById('extractAutoBtn'),
  selectJdBtn: document.getElementById('selectJdBtn'),
  jdText: document.getElementById('jdText'),

  resumeSourceMode: document.getElementById('resumeSourceMode'),
  latexUploadWrap: document.getElementById('latexUploadWrap'),
  latexPasteWrap: document.getElementById('latexPasteWrap'),
  simpleTextWrap: document.getElementById('simpleTextWrap'),
  resumeLatexFile: document.getElementById('resumeLatexFile'),
  resumeLatexText: document.getElementById('resumeLatexText'),
  resumeSimpleText: document.getElementById('resumeSimpleText'),
  prepareResumeBtn: document.getElementById('prepareResumeBtn'),
  resumeMeta: document.getElementById('resumeMeta'),

  thresholdInput: document.getElementById('thresholdInput'),
  targetScoreInput: document.getElementById('targetScoreInput'),
  computeBtn: document.getElementById('computeBtn'),
  rebuildToTargetBtn: document.getElementById('rebuildToTargetBtn'),
  scoreText: document.getElementById('scoreText'),
  baseScoreText: document.getElementById('baseScoreText'),
  tailoredScoreText: document.getElementById('tailoredScoreText'),
  improvementText: document.getElementById('improvementText'),
  missingKeywords: document.getElementById('missingKeywords'),

  providerSelect: document.getElementById('providerSelect'),
  modelSelect: document.getElementById('modelSelect'),
  customModelInput: document.getElementById('customModelInput'),
  endpointInput: document.getElementById('endpointInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  tailorBtn: document.getElementById('tailorBtn'),

  tailoredText: document.getElementById('tailoredText'),
  attemptSelect: document.getElementById('attemptSelect'),
  viewAttemptBtn: document.getElementById('viewAttemptBtn'),
  attemptStats: document.getElementById('attemptStats'),
  showWhyBtn: document.getElementById('showWhyBtn'),
  whyText: document.getElementById('whyText'),
  latexTemplateFile: document.getElementById('latexTemplateFile'),
  latexTemplateText: document.getElementById('latexTemplateText'),
  latexCompilerInput: document.getElementById('latexCompilerInput'),
  downloadPdfBtn: document.getElementById('downloadPdfBtn'),
  downloadTexBtn: document.getElementById('downloadTexBtn'),
  statusBox: document.getElementById('statusBox')
};

function defaultProfiles() {
  return {
    openai: {
      endpoint: PROVIDERS.openai.endpoint,
      apiKey: '',
      model: PROVIDERS.openai.models[0],
      customModel: ''
    },
    gemini: {
      endpoint: PROVIDERS.gemini.endpoint,
      apiKey: '',
      model: PROVIDERS.gemini.models[0],
      customModel: ''
    },
    perplexity: {
      endpoint: PROVIDERS.perplexity.endpoint,
      apiKey: '',
      model: PROVIDERS.perplexity.models[0],
      customModel: ''
    }
  };
}

const state = {
  selectedProvider: 'openai',
  llmProfiles: defaultProfiles(),
  baseResumeText: '',
  identityHints: [],
  generatedStructuredResume: null,
  latestScore: null,
  latestBaseMatch: null,
  latestTailoredMatch: null,
  generationAttempts: [],
  bestAttemptIndex: -1,
  lastJdText: ''
};

function setStatus(message, isError = false) {
  els.statusBox.textContent = message;
  els.statusBox.classList.toggle('warn', isError);
}

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function latexToPlainText(latex) {
  let text = latex || '';
  text = text.replace(/%.*$/gm, '');
  text = text.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '$2 $1');
  text = text.replace(/\\resumeItem\{([^}]*)\}/g, '\n- $1');
  text = text.replace(/\\textbf\{([^}]*)\}/g, '$1');
  text = text.replace(/\\textit\{([^}]*)\}/g, '$1');
  text = text.replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, '$1');
  text = text.replace(/\\resumeSubheading\s*\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g, '\n$1 | $2\n$3 | $4\n');
  text = text.replace(/\\resumeProjectHeading\s*\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g, '\n$1 | $2 | $3\n');
  text = text.replace(/\\[a-zA-Z*]+(\[[^\]]*\])?/g, ' ');
  text = text.replace(/[{}]/g, ' ');
  text = text.replace(/\\\\/g, '\n');
  return normalizeText(text);
}

function extractIdentityHints(text) {
  const lines = normalizeText(text).split('\n').filter(Boolean).slice(0, 15);
  const hints = [];

  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const phone = (text.match(/\+?\d[\d\s().-]{7,}/) || [])[0] || '';
  const linkedin = (text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i) || [])[0] || '';
  const github = (text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/i) || [])[0] || '';

  for (const line of lines) {
    hints.push(line);
  }
  for (const value of [email, phone, linkedin, github]) {
    if (value) hints.push(value);
  }

  return [...new Set(hints.filter(Boolean))].slice(0, 20);
}

function buildKeywordGuidance(jdText, baseResumeText, matchResult) {
  const jdLower = normalizeText(jdText);
  const resumeLower = normalizeText(baseResumeText);

  const phraseCandidates = [
    'data ingestion',
    'distributed systems',
    'real-time',
    'streaming',
    'fault tolerance',
    'scalability',
    'query optimization',
    'data validation',
    'error handling',
    'self-healing',
    'api integration',
    'monitoring',
    'alerting',
    'cloud platforms',
    'microservices',
    'event-driven',
    'batch processing'
  ];

  const phraseHits = phraseCandidates.filter((p) => jdLower.includes(p)).slice(0, 12);
  const resumeBackedPhrases = phraseHits.filter((p) => resumeLower.includes(p));

  const skillsSectionKeywords = (matchResult.matchedSkillKeywords || []).slice(0, 14);
  const experienceKeywords = [...new Set([
    ...(matchResult.jdRequiredSkillKeywords || []).slice(0, 8),
    ...resumeBackedPhrases.slice(0, 6)
  ])];
  const projectKeywords = [...new Set([
    ...(matchResult.matchedSkillKeywords || []).slice(0, 8),
    ...resumeBackedPhrases.slice(0, 5)
  ])];

  return {
    skillsSectionKeywords,
    experienceKeywords,
    projectKeywords,
    missingRequiredKeywords: (matchResult.missingRequiredKeywords || []).slice(0, 12)
  };
}

function renderMissingKeywords(items) {
  els.missingKeywords.innerHTML = '';
  if (!items?.length) return;

  for (const keyword of items) {
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = keyword;
    els.missingKeywords.appendChild(span);
  }
}

function extractYearsFromText(text) {
  const matches = [...(text || '').matchAll(/(\d+)\s*(?:\+|plus)?\s*years?/gi)];
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => Number(m[1]) || 0));
}

function buildEnhancementReasons({ jdText, baseMatch, bestMatch, baseResumeText }) {
  const reasons = [];
  const target = 85;

  if (!bestMatch) {
    reasons.push('- No tailored resume match result available.');
    return reasons.join('\n');
  }

  if (bestMatch.score >= target) {
    reasons.push(`- Best score is ${bestMatch.score}%, already >= ${target}%.`);
    return reasons.join('\n');
  }

  reasons.push(`- Best score after 5 attempts is ${bestMatch.score}% (< ${target}%).`);

  if (typeof bestMatch?.rubric?.requiredCoverage === 'number' && bestMatch.rubric.requiredCoverage < 70) {
    reasons.push(`- Required JD skill coverage is low (${bestMatch.rubric.requiredCoverage}%).`);
  }
  if (typeof bestMatch?.rubric?.skillCoverage === 'number' && bestMatch.rubric.skillCoverage < 75) {
    reasons.push(`- Overall skill coverage is low (${bestMatch.rubric.skillCoverage}%).`);
  }
  if ((bestMatch.missingRequiredKeywords || []).length) {
    reasons.push(`- Missing required skill keywords: ${(bestMatch.missingRequiredKeywords || []).slice(0, 10).join(', ')}.`);
  }

  const jdYears = extractYearsFromText(jdText);
  const resumeYears = extractYearsFromText(baseResumeText);
  if (jdYears && resumeYears && resumeYears < jdYears) {
    reasons.push(`- Possible experience gap: JD asks ~${jdYears}+ years, resume indicates ~${resumeYears}+ years.`);
  } else if (jdYears && !resumeYears) {
    reasons.push(`- JD mentions ~${jdYears}+ years but resume does not clearly state years of experience.`);
  }

  if (bestMatch.confidence === 'low') {
    reasons.push('- JD parsing confidence is low; JD may be noisy or mixed with non-JD text.');
  }

  if (baseMatch && bestMatch.score - baseMatch.score <= 0) {
    reasons.push('- Tailoring did not improve score over base resume; current resume facts may not support missing JD skills.');
  }

  reasons.push('- Improvement options: add verified projects/bullets that contain missing required skills, quantify relevant outcomes, and ensure years/role alignment is explicit.');
  return reasons.join('\n');
}

function renderAttemptOptions() {
  if (!els.attemptSelect) return;
  els.attemptSelect.innerHTML = '';

  if (!state.generationAttempts.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No attempts yet';
    els.attemptSelect.appendChild(opt);
    if (els.attemptStats) els.attemptStats.textContent = 'Attempts: N/A';
    return;
  }

  state.generationAttempts.forEach((attempt, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    const marker = idx === state.bestAttemptIndex ? ' (Best)' : '';
    opt.textContent = `Attempt ${attempt.attempt}: ${attempt.score}/100${marker}`;
    els.attemptSelect.appendChild(opt);
  });

  if (state.bestAttemptIndex >= 0) {
    els.attemptSelect.value = String(state.bestAttemptIndex);
  }

  const best = state.generationAttempts[state.bestAttemptIndex];
  if (els.attemptStats && best) {
    els.attemptStats.textContent = `Attempts: ${state.generationAttempts.length}/5 | Best: Attempt ${best.attempt} (${best.score}/100)`;
  }
}

function showAttempt(index) {
  const attempt = state.generationAttempts[index];
  if (!attempt) return;
  els.tailoredText.value = attempt.text;
  if (state.latestBaseMatch) {
    renderMatchSummary(state.latestBaseMatch, attempt.match);
  }
}

function updateResumeSourceVisibility() {
  const mode = els.resumeSourceMode.value;
  els.latexUploadWrap.classList.toggle('hidden', mode !== 'latex_upload');
  els.latexPasteWrap.classList.toggle('hidden', mode === 'simple_text');
  els.simpleTextWrap.classList.toggle('hidden', mode !== 'simple_text');
}

function getPreparedResumeText() {
  const mode = els.resumeSourceMode.value;
  if (mode === 'simple_text') {
    const text = normalizeText(els.resumeSimpleText.value);
    if (!text) throw new Error('Enter simple resume text first');
    return text;
  }

  const latex = (els.resumeLatexText.value || '').trim();
  if (!latex) throw new Error('Provide LaTeX resume code first');
  const parsed = latexToPlainText(latex);
  if (!parsed) throw new Error('Unable to parse text from LaTeX source');
  return parsed;
}

async function getPersistent(keys) {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(keys),
    chrome.storage.sync.get(keys).catch(() => ({}))
  ]);
  const merged = { ...local };
  for (const key of keys) {
    if (typeof merged[key] === 'undefined' && typeof sync[key] !== 'undefined') {
      merged[key] = sync[key];
    }
  }
  return merged;
}

async function setPersistent(items) {
  await chrome.storage.local.set(items);
  try {
    await chrome.storage.sync.set(items);
  } catch (_err) {
    // Ignore sync failures; local write is enough.
  }
}

function normalizeProfiles(rawProfiles) {
  const base = defaultProfiles();
  if (!rawProfiles || typeof rawProfiles !== 'object') return base;

  for (const providerId of Object.keys(PROVIDERS)) {
    const raw = rawProfiles[providerId] || {};
    const model = typeof raw.model === 'string' && raw.model
      ? raw.model
      : base[providerId].model;

    base[providerId] = {
      endpoint: typeof raw.endpoint === 'string' && raw.endpoint.trim()
        ? raw.endpoint.trim()
        : base[providerId].endpoint,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      model: PROVIDERS[providerId].models.includes(model) ? model : base[providerId].model,
      customModel: typeof raw.customModel === 'string' ? raw.customModel.trim() : ''
    };
  }

  return base;
}

function renderProviderControls(providerId) {
  const profile = state.llmProfiles[providerId];
  const provider = PROVIDERS[providerId];

  els.providerSelect.value = providerId;
  els.modelSelect.innerHTML = '';

  for (const model of provider.models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    els.modelSelect.appendChild(option);
  }

  els.modelSelect.value = provider.models.includes(profile.model)
    ? profile.model
    : provider.models[0];
  els.customModelInput.value = profile.customModel || '';
  els.endpointInput.value = profile.endpoint || provider.endpoint;
  els.apiKeyInput.value = profile.apiKey || '';
}

function updateProfileFromInputs(providerId = els.providerSelect.value) {
  const profile = state.llmProfiles[providerId];
  if (!profile) return;

  profile.endpoint = els.endpointInput.value.trim() || PROVIDERS[providerId].endpoint;
  profile.apiKey = els.apiKeyInput.value;
  profile.model = els.modelSelect.value || PROVIDERS[providerId].models[0];
  profile.customModel = els.customModelInput.value.trim();
}

function getActiveLlmConfig() {
  const providerId = els.providerSelect.value;
  const profile = state.llmProfiles[providerId];
  const model = els.customModelInput.value.trim() || els.modelSelect.value || profile.model;
  return {
    providerId,
    endpoint: els.endpointInput.value.trim() || profile.endpoint,
    apiKey: els.apiKeyInput.value,
    model
  };
}

async function saveSettings() {
  updateProfileFromInputs(els.providerSelect.value);
  state.selectedProvider = els.providerSelect.value;

  await setPersistent({
    threshold: Number(els.thresholdInput.value || 70),
    targetScore: Number(els.targetScoreInput.value || 90),
    selectedProvider: els.providerSelect.value,
    llmProfiles: state.llmProfiles,
    resumeSourceMode: els.resumeSourceMode.value,
    resumeLatexText: els.resumeLatexText.value,
    resumeSimpleText: els.resumeSimpleText.value,
    preparedResumeText: state.baseResumeText,
    identityHints: state.identityHints,
    latexTemplateText: els.latexTemplateText.value,
    latexCompilerUrl: els.latexCompilerInput.value.trim(),
    tailoredResumeText: els.tailoredText.value,
    tailoredStructuredResume: state.generatedStructuredResume
  });
}

async function loadSettings() {
  const data = await getPersistent([
    'threshold',
    'targetScore',
    'selectedProvider',
    'llmProfiles',
    'resumeSourceMode',
    'resumeLatexText',
    'resumeSimpleText',
    'preparedResumeText',
    'identityHints',
    'latexTemplateText',
    'latexCompilerUrl',
    'tailoredResumeText',
    'tailoredStructuredResume'
  ]);

  if (typeof data.threshold === 'number') els.thresholdInput.value = String(data.threshold);
  if (typeof data.targetScore === 'number') els.targetScoreInput.value = String(data.targetScore);
  if (data.resumeSourceMode) els.resumeSourceMode.value = data.resumeSourceMode;
  if (data.resumeLatexText) els.resumeLatexText.value = data.resumeLatexText;
  if (data.resumeSimpleText) els.resumeSimpleText.value = data.resumeSimpleText;
  if (data.latexTemplateText) els.latexTemplateText.value = data.latexTemplateText;
  if (data.latexCompilerUrl) els.latexCompilerInput.value = data.latexCompilerUrl;
  if (data.tailoredResumeText) els.tailoredText.value = data.tailoredResumeText;

  state.baseResumeText = data.preparedResumeText || '';
  state.identityHints = Array.isArray(data.identityHints) ? data.identityHints : [];
  state.generatedStructuredResume = data.tailoredStructuredResume || null;

  state.llmProfiles = normalizeProfiles(data.llmProfiles);
  state.selectedProvider = PROVIDERS[data.selectedProvider] ? data.selectedProvider : 'openai';
  renderProviderControls(state.selectedProvider);
  updateResumeSourceVisibility();

  if (state.baseResumeText) {
    els.resumeMeta.textContent = `Prepared resume loaded (${state.baseResumeText.length} chars).`;
  }
}

async function sendToServiceWorker(type) {
  return chrome.runtime.sendMessage({ type });
}

async function handleExtract(type) {
  setStatus(type === 'EXTRACT_JD_AUTO' ? 'Extracting JD from active tab...' : 'Select mode enabled. Click target JD content in page.');
  const response = await sendToServiceWorker(type);
  if (!response?.ok) throw new Error(response?.error || 'JD extraction failed');

  els.jdText.value = response.text || '';
  state.latestBaseMatch = null;
  state.latestTailoredMatch = null;
  setStatus(`JD captured (${response.meta?.strategy || response.meta?.mode || 'auto'}).`);
}

function runMatchForResume(resumeText) {
  const jdText = normalizeText(els.jdText.value);
  if (!jdText) throw new Error('JD text is empty');
  if (!resumeText) throw new Error('Resume text is empty');

  return computeMatch(jdText, resumeText);
}

function renderMatchSummary(baseResult, tailoredResult = null) {
  const requiredCoverage = typeof baseResult?.rubric?.requiredCoverage === 'number'
    ? ` | Req: ${baseResult.rubric.requiredCoverage}%`
    : '';
  const skillCoverage = typeof baseResult?.rubric?.skillCoverage === 'number'
    ? ` | Skills: ${baseResult.rubric.skillCoverage}%`
    : '';
  const confidence = baseResult?.confidence ? ` | Confidence: ${baseResult.confidence}` : '';

  if (!tailoredResult) {
    els.scoreText.textContent =
      `Base Score: ${baseResult.score}/100 | Overlap: ${baseResult.stats.overlapTerms}${requiredCoverage}${skillCoverage}${confidence}`;
    if (els.baseScoreText) els.baseScoreText.textContent = `Base score: ${baseResult.score}/100`;
    if (els.tailoredScoreText) els.tailoredScoreText.textContent = 'Latest tailored score: N/A';
    if (els.improvementText) els.improvementText.textContent = 'Improvement: N/A';
    renderMissingKeywords(
      baseResult.missingRequiredKeywords?.length
        ? baseResult.missingRequiredKeywords
        : (baseResult.missingSkillKeywords?.length ? baseResult.missingSkillKeywords : baseResult.missingTopKeywords)
    );
    return;
  }

  const lift = tailoredResult.score - baseResult.score;
  const liftSign = lift >= 0 ? '+' : '';
  const tailoredReq = typeof tailoredResult?.rubric?.requiredCoverage === 'number'
    ? ` | Tailored Req: ${tailoredResult.rubric.requiredCoverage}%`
    : '';
  els.scoreText.textContent =
    `Base: ${baseResult.score}/100 | Tailored: ${tailoredResult.score}/100 | Lift: ${liftSign}${lift}${tailoredReq}`;
  if (els.baseScoreText) els.baseScoreText.textContent = `Base score: ${baseResult.score}/100`;
  if (els.tailoredScoreText) els.tailoredScoreText.textContent = `Latest tailored score: ${tailoredResult.score}/100`;
  if (els.improvementText) els.improvementText.textContent = `Improvement: ${liftSign}${lift}`;
  renderMissingKeywords(
    tailoredResult.missingRequiredKeywords?.length
      ? tailoredResult.missingRequiredKeywords
      : (tailoredResult.missingSkillKeywords?.length ? tailoredResult.missingSkillKeywords : tailoredResult.missingTopKeywords)
  );
}

function runMatch() {
  if (!state.baseResumeText) throw new Error('Prepare resume source first');
  const baseResult = runMatchForResume(state.baseResumeText);
  state.latestScore = baseResult.score;
  state.latestBaseMatch = baseResult;
  renderMatchSummary(baseResult, state.latestTailoredMatch);
  return baseResult;
}

async function prepareResumeSource() {
  const preparedText = getPreparedResumeText();
  state.baseResumeText = preparedText;
  state.identityHints = extractIdentityHints(preparedText);
  state.latestBaseMatch = null;
  state.latestTailoredMatch = null;
  els.resumeMeta.textContent = `Prepared resume source (${preparedText.length} chars).`;
  await saveSettings();
  setStatus('Resume source prepared for matching and tailoring.');
}

async function generateTailoredResume() {
  const jdText = normalizeText(els.jdText.value);
  if (!jdText) throw new Error('JD text is empty');
  if (!state.baseResumeText) throw new Error('Prepare resume source first');

  const { providerId, endpoint, apiKey, model } = getActiveLlmConfig();
  if (!endpoint || !model) throw new Error('LLM endpoint and model are required');
  if (!apiKey) throw new Error(`API key is required for ${PROVIDERS[providerId].label}`);

  const matchResult = runMatch();
  const targetScore = Number(els.targetScoreInput.value || 90);
  const maxAttempts = 5;
  const keywordGuidance = buildKeywordGuidance(jdText, state.baseResumeText, matchResult);
  await saveSettings();
  setStatus(`Generating tailored resume with ${PROVIDERS[providerId].label}...`);

  state.lastJdText = jdText;
  state.generationAttempts = [];
  let bestStructured = null;
  let bestMatch = null;
  let bestText = '';
  let bestIndex = -1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const guidanceSource = bestMatch || matchResult;
    const attemptGuidance = attempt === 1
      ? keywordGuidance
      : buildKeywordGuidance(jdText, state.baseResumeText, guidanceSource);

    setStatus(`Generating attempt ${attempt}/${maxAttempts}... target ${targetScore}%`);

    const structured = await generateTailoredResumeStructured({
      endpoint,
      apiKey,
      model,
      jdText,
      baseResumeText: state.baseResumeText,
      matchInsights: {
        score: guidanceSource.score,
        missingTopKeywords: guidanceSource.missingTopKeywords,
        missingRequiredKeywords: guidanceSource.missingRequiredKeywords
      },
      keywordGuidance: attemptGuidance,
      identityHints: state.identityHints,
      temperature: attempt === 1 ? 0.2 : 0.12
    });

    const attemptText = structuredResumeToPlainText(structured);
    const attemptMatch = runMatchForResume(attemptText);
    const attemptItem = {
      attempt,
      structured,
      text: attemptText,
      match: attemptMatch,
      score: attemptMatch.score
    };
    state.generationAttempts.push(attemptItem);

    if (!bestMatch || attemptMatch.score > bestMatch.score) {
      bestStructured = structured;
      bestMatch = attemptMatch;
      bestText = attemptText;
      bestIndex = state.generationAttempts.length - 1;
    }

    renderAttemptOptions();

    if (attemptMatch.score >= targetScore && attempt >= 2) {
      // still complete all 5 attempts as requested; keep generating for best pick
    }
  }

  state.generatedStructuredResume = bestStructured;
  state.latestTailoredMatch = bestMatch;
  state.bestAttemptIndex = bestIndex;
  els.tailoredText.value = bestText;
  renderMatchSummary(state.latestBaseMatch || matchResult, state.latestTailoredMatch);
  renderAttemptOptions();

  const why = buildEnhancementReasons({
    jdText: state.lastJdText,
    baseMatch: state.latestBaseMatch,
    bestMatch: state.latestTailoredMatch,
    baseResumeText: state.baseResumeText
  });
  if (els.whyText) {
    els.whyText.value = why;
    els.whyText.classList.toggle('hidden', state.latestTailoredMatch.score >= 85);
  }

  await saveSettings();
  const lift = (state.latestTailoredMatch?.score || 0) - matchResult.score;
  const reached = (state.latestTailoredMatch?.score || 0) >= targetScore;
  setStatus(
    reached
      ? `Tailored resume generated. Target reached (${state.latestTailoredMatch.score}%). Lift: ${lift >= 0 ? '+' : ''}${lift}.`
      : `Best tailored resume generated (${state.latestTailoredMatch.score}%). Lift: ${lift >= 0 ? '+' : ''}${lift}.`
  );
}

async function downloadPdf() {
  if (!state.generatedStructuredResume) {
    throw new Error('Generate tailored resume first');
  }

  await saveSettings();
  setStatus('Compiling LaTeX to PDF...');
  await downloadTailoredResumePdf({
    structuredResume: state.generatedStructuredResume,
    filename: 'tailored_resume.pdf',
    compilerUrl: els.latexCompilerInput.value.trim() || 'https://latexonline.cc/compile',
    customTemplate: els.latexTemplateText.value.trim()
  });
  setStatus('PDF download started.');
}

async function downloadTex() {
  if (!state.generatedStructuredResume) {
    throw new Error('Generate tailored resume first');
  }

  await saveSettings();
  await downloadTailoredResumeTex({
    structuredResume: state.generatedStructuredResume,
    filename: 'tailored_resume.tex',
    customTemplate: els.latexTemplateText.value.trim()
  });
  setStatus('.tex download started.');
}

async function init() {
  await loadSettings();
  renderAttemptOptions();
  setStatus('Ready.');
}

els.extractAutoBtn.addEventListener('click', async () => {
  try {
    await handleExtract('EXTRACT_JD_AUTO');
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.selectJdBtn.addEventListener('click', async () => {
  try {
    await handleExtract('START_JD_SELECT');
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.resumeSourceMode.addEventListener('change', () => {
  updateResumeSourceVisibility();
  saveSettings().catch((err) => setStatus(err.message || String(err), true));
});

els.resumeLatexFile.addEventListener('change', async (event) => {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    els.resumeLatexText.value = text;
    if (els.resumeSourceMode.value !== 'latex_upload') {
      els.resumeSourceMode.value = 'latex_upload';
      updateResumeSourceVisibility();
    }
    await saveSettings();
    setStatus(`Loaded LaTeX resume file: ${file.name}`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.prepareResumeBtn.addEventListener('click', async () => {
  try {
    await prepareResumeSource();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.computeBtn.addEventListener('click', async () => {
  try {
    const result = runMatch();
    await saveSettings();
    setStatus(`Match computed: ${result.score}/100`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.providerSelect.addEventListener('change', async () => {
  try {
    updateProfileFromInputs(state.selectedProvider);
    state.selectedProvider = els.providerSelect.value;
    renderProviderControls(state.selectedProvider);
    await saveSettings();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

for (const input of [
  els.modelSelect,
  els.customModelInput,
  els.endpointInput,
  els.apiKeyInput,
  els.thresholdInput,
  els.targetScoreInput,
  els.resumeLatexText,
  els.resumeSimpleText,
  els.latexCompilerInput,
  els.latexTemplateText
]) {
  input.addEventListener('change', () => {
    saveSettings().catch((err) => setStatus(err.message || String(err), true));
  });
}

els.rebuildToTargetBtn?.addEventListener('click', async () => {
  try {
    await generateTailoredResume();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.viewAttemptBtn?.addEventListener('click', () => {
  const idx = Number(els.attemptSelect?.value);
  if (Number.isNaN(idx)) return;
  showAttempt(idx);
});

els.attemptSelect?.addEventListener('change', () => {
  const idx = Number(els.attemptSelect?.value);
  if (Number.isNaN(idx)) return;
  showAttempt(idx);
});

els.showWhyBtn?.addEventListener('click', () => {
  if (!els.whyText) return;
  els.whyText.classList.toggle('hidden');
});

els.tailorBtn.addEventListener('click', async () => {
  try {
    await generateTailoredResume();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.downloadPdfBtn.addEventListener('click', async () => {
  try {
    await downloadPdf();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.downloadTexBtn.addEventListener('click', async () => {
  try {
    await downloadTex();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.latexTemplateFile.addEventListener('change', async (event) => {
  try {
    const file = event.target.files?.[0];
    if (!file) return;
    els.latexTemplateText.value = await file.text();
    await saveSettings();
    setStatus(`Loaded custom template: ${file.name}`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

init().catch((err) => setStatus(err.message || String(err), true));
