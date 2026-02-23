function parseOpenAICompatibleResponse(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();

  if (Array.isArray(content)) {
    const joined = content
      .map((item) => item?.text || item?.content || '')
      .join('\n')
      .trim();
    if (joined) return joined;
  }

  if (typeof json?.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim();
  }

  throw new Error('LLM response did not include text content');
}

function extractJsonBlock(text) {
  if (!text) return null;
  const direct = text.trim();
  if (direct.startsWith('{') && direct.endsWith('}')) return direct;

  const fenced = direct.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = direct.indexOf('{');
  const end = direct.lastIndexOf('}');
  if (start >= 0 && end > start) return direct.slice(start, end + 1);

  return null;
}

function asString(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function detectIdentityFromHints(baseResumeText, identityHints = []) {
  const seed = [
    ...identityHints,
    ...(baseResumeText || '').split('\n').slice(0, 12)
  ].join('\n');

  const email = (seed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const phone = (seed.match(/\+?\d[\d\s().-]{7,}/) || [])[0] || '';
  const linkedin = (seed.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i) || [])[0] || '';
  const github = (seed.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/i) || [])[0] || '';

  let name = '';
  for (const line of (identityHints || [])) {
    const trimmed = asString(line);
    if (!trimmed) continue;
    if (/[0-9@:/|]/.test(trimmed)) continue;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      name = trimmed;
      break;
    }
  }

  return { name, phone, email, linkedin, github };
}

function normalizeBullets(value) {
  const arr = asArray(value)
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 8);
  return arr.length ? arr : ['Not provided'];
}

function normalizeStructuredResume(raw, fallbackIdentity) {
  const candidate = raw?.resume && typeof raw.resume === 'object' ? raw.resume : raw;

  const skillsObj = candidate?.skills && typeof candidate.skills === 'object' ? candidate.skills : {};
  const skills = {
    Languages: asString(skillsObj.Languages || skillsObj.languages),
    Backend: asString(skillsObj.Backend || skillsObj.backend),
    Mobile: asString(skillsObj.Mobile || skillsObj.mobile),
    'Databases & Infra': asString(skillsObj['Databases & Infra'] || skillsObj.databasesInfra || skillsObj.databases),
    Tools: asString(skillsObj.Tools || skillsObj.tools)
  };

  const experience = asArray(candidate?.experience)
    .map((item) => ({
      company: asString(item?.company),
      location: asString(item?.location),
      title: asString(item?.title),
      dates: asString(item?.dates),
      bullets: normalizeBullets(item?.bullets)
    }))
    .filter((item) => item.company || item.title)
    .slice(0, 8);

  const projects = asArray(candidate?.projects)
    .map((item) => ({
      name: asString(item?.name),
      label: asString(item?.label || 'Link'),
      url: asString(item?.url),
      bullets: normalizeBullets(item?.bullets)
    }))
    .filter((item) => item.name)
    .slice(0, 8);

  const education = asArray(candidate?.education)
    .map((item) => ({
      institution: asString(item?.institution),
      location: asString(item?.location),
      degree: asString(item?.degree),
      dates: asString(item?.dates)
    }))
    .filter((item) => item.institution || item.degree)
    .slice(0, 5);

  return {
    name: asString(candidate?.name) || fallbackIdentity.name,
    phone: asString(candidate?.phone) || fallbackIdentity.phone,
    email: asString(candidate?.email) || fallbackIdentity.email,
    linkedin: asString(candidate?.linkedin) || fallbackIdentity.linkedin,
    github: asString(candidate?.github) || fallbackIdentity.github,
    summary: asString(candidate?.summary) || 'Not provided',
    skills,
    experience,
    projects,
    education
  };
}

export function structuredResumeToPlainText(resume) {
  if (!resume) return '';

  const lines = [];
  const contacts = [resume.phone, resume.email, resume.linkedin, resume.github].filter(Boolean).join(' | ');
  if (resume.name) lines.push(resume.name);
  if (contacts) lines.push(contacts);

  lines.push('');
  lines.push('SUMMARY');
  lines.push(resume.summary || 'Not provided');

  lines.push('');
  lines.push('TECHNICAL SKILLS');
  for (const [k, v] of Object.entries(resume.skills || {})) {
    if (v) lines.push(`${k}: ${v}`);
  }

  lines.push('');
  lines.push('WORK EXPERIENCE');
  for (const exp of resume.experience || []) {
    lines.push(`${exp.company} | ${exp.location}`.replace(/\s+\|\s+$/, ''));
    lines.push(`${exp.title} | ${exp.dates}`.replace(/\s+\|\s+$/, ''));
    for (const bullet of exp.bullets || []) lines.push(`- ${bullet}`);
    lines.push('');
  }

  lines.push('PROJECTS');
  for (const p of resume.projects || []) {
    lines.push(`${p.name} | ${p.label} | ${p.url}`.replace(/\s+\|\s+$/, ''));
    for (const bullet of p.bullets || []) lines.push(`- ${bullet}`);
    lines.push('');
  }

  lines.push('EDUCATION');
  for (const ed of resume.education || []) {
    lines.push(`${ed.institution} | ${ed.location}`.replace(/\s+\|\s+$/, ''));
    lines.push(`${ed.degree} | ${ed.dates}`.replace(/\s+\|\s+$/, ''));
    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function generateTailoredResumeStructured({
  endpoint,
  apiKey,
  model,
  jdText,
  baseResumeText,
  matchInsights = null,
  keywordGuidance = null,
  identityHints = [],
  temperature = 0.2
}) {
  if (!endpoint || !model) {
    throw new Error('LLM endpoint and model are required');
  }

  const insights = matchInsights
    ? [
        `Current score: ${matchInsights.score ?? 'n/a'}`,
        `Missing required keywords: ${(matchInsights.missingRequiredKeywords || []).join(', ') || 'none'}`,
        `Missing top keywords: ${(matchInsights.missingTopKeywords || []).join(', ') || 'none'}`
      ].join('\n')
    : 'No match insights available';

  const keywordGuidanceText = keywordGuidance
    ? [
        'Keyword Placement Guidance (use only if factual in base resume):',
        `- Skills section priority: ${(keywordGuidance.skillsSectionKeywords || []).join(', ') || 'none'}`,
        `- Experience bullet focus: ${(keywordGuidance.experienceKeywords || []).join(', ') || 'none'}`,
        `- Project bullet focus: ${(keywordGuidance.projectKeywords || []).join(', ') || 'none'}`,
        `- Required JD keywords still missing: ${(keywordGuidance.missingRequiredKeywords || []).join(', ') || 'none'}`,
        '- Rule: If a missing required keyword is not supported by base resume facts, do NOT add it.'
      ].join('\n')
    : 'Keyword Placement Guidance: not available';

  const identityHintText = identityHints.filter(Boolean).join(' | ') || 'Not detected';

  const systemPrompt = [
    'You are an ATS resume tailoring assistant.',
    'Hard constraints:',
    '- Do NOT invent jobs, companies, dates, degrees, certifications, technologies, achievements, or metrics.',
    '- Use ONLY facts present in the base resume text.',
    '- Preserve candidate identity/contact: name, phone, email, linkedin, github.',
    '- Prioritize required JD keywords only if they are already present in base resume facts.',
    '- Output ONLY valid JSON (no markdown).',
    'JSON schema:',
    '{',
    '  "name": "",',
    '  "phone": "",',
    '  "email": "",',
    '  "linkedin": "",',
    '  "github": "",',
    '  "summary": "",',
    '  "skills": {',
    '    "Languages": "",',
    '    "Backend": "",',
    '    "Mobile": "",',
    '    "Databases & Infra": "",',
    '    "Tools": ""',
    '  },',
    '  "experience": [',
    '    {"company":"","location":"","title":"","dates":"","bullets":[""]}',
    '  ],',
    '  "projects": [',
    '    {"name":"","label":"","url":"","bullets":[""]}',
    '  ],',
    '  "education": [',
    '    {"institution":"","location":"","degree":"","dates":""}',
    '  ]',
    '}'
  ].join('\n');

  const userPrompt = [
    'Target Job Description:',
    jdText,
    '',
    'Base Resume Text:',
    baseResumeText,
    '',
    'Identity hints from resume:',
    identityHintText,
    '',
    keywordGuidanceText,
    '',
    'Match Insights:',
    insights,
    '',
    'Return only JSON object.'
  ].join('\n');

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 350)}`);
  }

  const json = await response.json();
  const content = parseOpenAICompatibleResponse(json);
  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) {
    throw new Error('LLM did not return JSON content');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON: ${err.message}`);
  }

  const fallbackIdentity = detectIdentityFromHints(baseResumeText, identityHints);
  return normalizeStructuredResume(parsed, fallbackIdentity);
}
