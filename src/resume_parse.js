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

function detectBulletStyle(lines) {
  const counts = new Map();
  for (const line of lines) {
    const match = line.match(/^([\-*•])\s+/);
    if (!match) continue;
    const bullet = match[1];
    counts.set(bullet, (counts.get(bullet) || 0) + 1);
  }
  let best = '-';
  let bestCount = 0;
  for (const [bullet, count] of counts.entries()) {
    if (count > bestCount) {
      best = bullet;
      bestCount = count;
    }
  }
  return best;
}

function looksLikeSectionHeader(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;

  const noPunct = trimmed.replace(/[:\-|]/g, '').trim();
  const words = noPunct.split(/\s+/);
  if (words.length > 4) return false;

  const alphaOnly = noPunct.replace(/[^a-zA-Z ]/g, '');
  return alphaOnly && alphaOnly === alphaOnly.toUpperCase();
}

function detectIdentityLines(lines) {
  const top = lines.slice(0, 20);
  const identity = [];

  const likelyName = top.find((line) => {
    if (line.length < 3 || line.length > 60) return false;
    if (/[0-9@:/|]/.test(line)) return false;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    return words.every((w) => /^[A-Za-z.'-]+$/.test(w));
  });

  if (likelyName) {
    identity.push(likelyName);
  }

  const contactOrProfile = top.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes('@') ||
      lower.includes('linkedin') ||
      lower.includes('github') ||
      lower.includes('portfolio') ||
      lower.includes('leetcode') ||
      lower.includes('medium') ||
      lower.includes('x.com') ||
      lower.includes('twitter') ||
      lower.includes('http://') ||
      lower.includes('https://') ||
      /\+?\d[\d\s().-]{7,}/.test(line)
    );
  });

  for (const line of contactOrProfile) {
    if (!identity.includes(line)) {
      identity.push(line);
    }
  }

  return identity.slice(0, 6);
}

export function extractResumeFormatHints(text) {
  const lines = (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionHeaders = [];
  for (const line of lines) {
    if (!looksLikeSectionHeader(line)) continue;
    const normalized = line.replace(/[:\-|]+$/, '').trim();
    if (!sectionHeaders.includes(normalized)) {
      sectionHeaders.push(normalized);
    }
  }

  const previewLines = lines
    .slice(0, 35)
    .map((line) => (line.length > 120 ? `${line.slice(0, 120)}...` : line));

  const identityLines = detectIdentityLines(lines);

  return {
    sectionHeaders,
    bulletStyle: detectBulletStyle(lines),
    hasAllCapsHeaders: sectionHeaders.length > 0,
    preview: previewLines.join('\n'),
    identityLines
  };
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

export async function saveBaseResume(text, formatHints = null) {
  await chrome.storage.local.set({
    baseResumeText: text,
    baseResumeFormatHints: formatHints,
    baseResumeUpdatedAt: Date.now()
  });
}

export async function loadBaseResume() {
  const data = await chrome.storage.local.get([
    'baseResumeText',
    'baseResumeFormatHints',
    'baseResumeUpdatedAt'
  ]);
  return {
    text: data.baseResumeText || '',
    formatHints: data.baseResumeFormatHints || null,
    updatedAt: data.baseResumeUpdatedAt || null
  };
}
