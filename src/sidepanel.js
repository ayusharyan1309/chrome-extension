import { computeMatch } from './match.js';
import { parseResumeFile, saveBaseResume, loadBaseResume } from './resume_parse.js';
import { generateTailoredResume } from './llm.js';
import { downloadTailoredResumePdf } from './docx_export.js';

const els = {
  extractAutoBtn: document.getElementById('extractAutoBtn'),
  selectJdBtn: document.getElementById('selectJdBtn'),
  jdText: document.getElementById('jdText'),
  resumeFile: document.getElementById('resumeFile'),
  resumeMeta: document.getElementById('resumeMeta'),
  thresholdInput: document.getElementById('thresholdInput'),
  computeBtn: document.getElementById('computeBtn'),
  scoreText: document.getElementById('scoreText'),
  missingKeywords: document.getElementById('missingKeywords'),
  endpointInput: document.getElementById('endpointInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  modelInput: document.getElementById('modelInput'),
  tailorBtn: document.getElementById('tailorBtn'),
  tailoredText: document.getElementById('tailoredText'),
  downloadPdfBtn: document.getElementById('downloadPdfBtn'),
  latexCompilerInput: document.getElementById('latexCompilerInput'),
  statusBox: document.getElementById('statusBox')
};

const state = {
  baseResumeText: '',
  latestScore: null
};

function setStatus(message, isError = false) {
  els.statusBox.textContent = message;
  els.statusBox.classList.toggle('warn', isError);
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

async function saveSettings() {
  await chrome.storage.local.set({
    threshold: Number(els.thresholdInput.value || 70),
    llmEndpoint: els.endpointInput.value.trim(),
    llmApiKey: els.apiKeyInput.value,
    llmModel: els.modelInput.value.trim(),
    latexCompilerUrl: els.latexCompilerInput.value.trim()
  });
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'threshold',
    'llmEndpoint',
    'llmApiKey',
    'llmModel',
    'latexCompilerUrl'
  ]);

  if (typeof data.threshold === 'number') els.thresholdInput.value = String(data.threshold);
  if (data.llmEndpoint) els.endpointInput.value = data.llmEndpoint;
  if (data.llmApiKey) els.apiKeyInput.value = data.llmApiKey;
  if (data.llmModel) els.modelInput.value = data.llmModel;
  if (data.latexCompilerUrl) els.latexCompilerInput.value = data.latexCompilerUrl;
}

async function sendToServiceWorker(type) {
  return chrome.runtime.sendMessage({ type });
}

async function handleExtract(type) {
  setStatus(type === 'EXTRACT_JD_AUTO' ? 'Extracting JD from active tab...' : 'Select mode enabled. Click target content on page.');

  const response = await sendToServiceWorker(type);
  if (!response?.ok) {
    throw new Error(response?.error || 'Extraction failed');
  }

  els.jdText.value = response.text || '';
  setStatus(`JD captured (${response.meta?.mode || 'unknown'} mode).`);
}

function runMatch() {
  const jdText = els.jdText.value.trim();
  if (!jdText) throw new Error('JD text is empty');
  if (!state.baseResumeText) throw new Error('Base resume text is missing. Upload and parse resume first.');

  const result = computeMatch(jdText, state.baseResumeText);
  state.latestScore = result.score;

  els.scoreText.textContent = `Score: ${result.score}/100 | Overlap terms: ${result.stats.overlapTerms}`;
  renderMissingKeywords(result.missingTopKeywords);

  return result;
}

async function maybeTailorResume() {
  const threshold = Number(els.thresholdInput.value || 70);
  const endpoint = els.endpointInput.value.trim();
  const apiKey = els.apiKeyInput.value;
  const model = els.modelInput.value.trim();
  const jdText = els.jdText.value.trim();

  if (!endpoint || !model) throw new Error('LLM endpoint and model are required');
  if (!jdText) throw new Error('JD text is empty');
  if (!state.baseResumeText) throw new Error('Base resume is not available');

  const matchResult = runMatch();
  if (matchResult.score >= threshold) {
    setStatus(`Score ${matchResult.score} >= threshold ${threshold}. Tailoring optional; generating anyway.`);
  } else {
    setStatus(`Score ${matchResult.score} < threshold ${threshold}. Generating tailored resume...`);
  }

  await saveSettings();

  const text = await generateTailoredResume({
    endpoint,
    apiKey,
    model,
    jdText,
    baseResumeText: state.baseResumeText,
    temperature: 0.2
  });

  els.tailoredText.value = text;
  await chrome.storage.local.set({ tailoredResumeText: text, tailoredResumeUpdatedAt: Date.now() });
  setStatus('Tailored resume generated.');
}

async function init() {
  await loadSettings();

  const resume = await loadBaseResume();
  if (resume.text) {
    state.baseResumeText = resume.text;
    const updated = resume.updatedAt ? new Date(resume.updatedAt).toLocaleString() : 'unknown';
    els.resumeMeta.textContent = `Base resume loaded from storage (${resume.text.length} chars). Updated: ${updated}`;
  }

  const storedTailored = await chrome.storage.local.get(['tailoredResumeText']);
  if (storedTailored.tailoredResumeText) {
    els.tailoredText.value = storedTailored.tailoredResumeText;
  }

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

els.resumeFile.addEventListener('change', async (event) => {
  try {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus(`Parsing ${file.name}...`);
    const parsed = await parseResumeFile(file);
    if (!parsed) throw new Error('Parsed resume text is empty');

    state.baseResumeText = parsed;
    await saveBaseResume(parsed);
    els.resumeMeta.textContent = `Parsed and stored (${parsed.length} chars) from ${file.name}`;
    setStatus('Base resume parsed and saved to chrome.storage.local');
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.computeBtn.addEventListener('click', async () => {
  try {
    await saveSettings();
    const result = runMatch();
    setStatus(`Match computed: ${result.score}/100`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.tailorBtn.addEventListener('click', async () => {
  try {
    await maybeTailorResume();
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

els.downloadPdfBtn.addEventListener('click', async () => {
  try {
    const text = els.tailoredText.value.trim();
    if (!text) throw new Error('No tailored resume text to export');

    const compilerUrl = els.latexCompilerInput.value.trim() || 'https://latexonline.cc/compile';
    await saveSettings();
    setStatus('Compiling LaTeX to PDF...');

    await downloadTailoredResumePdf(text, 'tailored_resume.pdf', compilerUrl);
    setStatus('PDF download started.');
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
});

for (const input of [els.thresholdInput, els.endpointInput, els.apiKeyInput, els.modelInput, els.latexCompilerInput]) {
  input.addEventListener('change', () => {
    saveSettings().catch((err) => setStatus(err.message || String(err), true));
  });
}

init().catch((err) => setStatus(err.message || String(err), true));
