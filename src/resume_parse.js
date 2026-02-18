import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePdf(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const parts = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    parts.push(text);
  }

  return normalizeText(parts.join('\n\n'));
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeText(result.value);
}

async function parseTxt(file) {
  const text = await file.text();
  return normalizeText(text);
}

export async function parseResumeFile(file) {
  if (!file) throw new Error('No file selected');

  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return parsePdf(file);
  }
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return parseDocx(file);
  }
  if (name.endsWith('.txt') || file.type === 'text/plain') {
    return parseTxt(file);
  }

  throw new Error('Unsupported file format. Use PDF, DOCX, or TXT.');
}

export async function saveBaseResume(text) {
  await chrome.storage.local.set({ baseResumeText: text, baseResumeUpdatedAt: Date.now() });
}

export async function loadBaseResume() {
  const data = await chrome.storage.local.get(['baseResumeText', 'baseResumeUpdatedAt']);
  return {
    text: data.baseResumeText || '',
    updatedAt: data.baseResumeUpdatedAt || null
  };
}
