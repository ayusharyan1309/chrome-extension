const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'can', 'our', 'about', 'into', 'their', 'they', 'them', 'but',
  'not', 'all', 'any', 'its', 'per', 'who', 'how', 'what', 'when', 'where', 'why', 'job', 'role',
  'team', 'work', 'works', 'working', 'candidate', 'including', 'using', 'build', 'built',
  'we', 'us', 'i', 'me', 'my', 'mine', 'ours', 'he', 'she', 'it', 'as', 'at', 'by', 'on', 'of',
  'to', 'in', 'is', 'be', 'an', 'a', 'or', 'if', 'then', 'than', 'also', 'should', 'must',
  'responsible', 'responsibilities', 'qualification', 'qualifications', 'experience', 'years'
]);

const REQUIRED_MARKERS = ['required', 'must have', 'minimum qualifications', 'basic qualifications', 'what you bring'];
const PREFERRED_MARKERS = ['preferred', 'nice to have', 'bonus', 'good to have'];

const SKILL_VOCAB = {
  java: ['java'],
  python: ['python'],
  javascript: ['javascript', 'js'],
  typescript: ['typescript', 'ts'],
  sql: ['sql'],
  react: ['react', 'reactjs', 'react.js'],
  nodejs: ['nodejs', 'node.js', 'node'],
  spring_boot: ['spring boot'],
  kafka: ['kafka', 'apache kafka'],
  redis: ['redis'],
  graphql: ['graphql'],
  rest_api: ['rest api', 'rest apis', 'restful api', 'restful apis'],
  microservices: ['microservices', 'microservice'],
  aws: ['aws', 'amazon web services'],
  gcp: ['gcp', 'google cloud'],
  azure: ['azure'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  spark: ['spark', 'spark streaming'],
  flink: ['flink', 'apache flink'],
  bigquery: ['bigquery'],
  snowflake: ['snowflake'],
  redshift: ['redshift', 'aws redshift'],
  clickhouse: ['clickhouse'],
  s3: ['s3', 'amazon s3'],
  sftp: ['sftp'],
  mysql: ['mysql'],
  postgres: ['postgres', 'postgresql'],
  mongodb: ['mongodb', 'mongo'],
  git: ['git']
};

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/\u00a0/g, ' ');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase)}([^a-z0-9]|$)`, 'i');
  return pattern.test(text);
}

function extractSkillSet(text) {
  const lower = normalizeText(text);
  const found = new Set();

  for (const [canonical, aliases] of Object.entries(SKILL_VOCAB)) {
    if (aliases.some((alias) => containsPhrase(lower, alias))) {
      found.add(canonical);
    }
  }

  return found;
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9+#.\-/\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function frequencyMap(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

function splitJdZones(jdText) {
  const lines = (jdText || '').split('\n');
  const requiredLines = [];
  const preferredLines = [];
  const generalLines = [];
  let mode = 'general';

  for (const line of lines) {
    const l = normalizeText(line.trim());
    if (!l) continue;

    if (REQUIRED_MARKERS.some((marker) => l.includes(marker))) {
      mode = 'required';
      continue;
    }
    if (PREFERRED_MARKERS.some((marker) => l.includes(marker))) {
      mode = 'preferred';
      continue;
    }

    if (mode === 'required') requiredLines.push(line);
    else if (mode === 'preferred') preferredLines.push(line);
    else generalLines.push(line);
  }

  return {
    requiredText: requiredLines.join('\n'),
    preferredText: preferredLines.join('\n'),
    generalText: generalLines.join('\n')
  };
}

function weightedCoverage(weightItems, hasItem) {
  let total = 0;
  let hit = 0;
  for (const item of weightItems) {
    total += item.weight;
    if (hasItem(item.key)) hit += item.weight;
  }
  return total > 0 ? (hit / total) * 100 : null;
}

function round0(value) {
  return Math.round(value);
}

export function computeMatch(jdText, resumeText) {
  const zones = splitJdZones(jdText);
  const resumeLower = normalizeText(resumeText);

  const jdAllSkills = extractSkillSet(jdText);
  const jdRequiredSkills = extractSkillSet(zones.requiredText);
  const jdPreferredSkills = extractSkillSet(zones.preferredText);
  const resumeSkills = extractSkillSet(resumeText);

  // Skill-first weighting
  const skillWeightItems = [];
  for (const skill of jdAllSkills) {
    let weight = 2.5;
    if (jdRequiredSkills.has(skill)) weight += 2.2;
    else if (jdPreferredSkills.has(skill)) weight += 0.8;
    skillWeightItems.push({ key: skill, weight });
  }

  const requiredSkillItems = [...jdRequiredSkills].map((s) => ({ key: s, weight: 1 }));
  const skillCoverage = weightedCoverage(skillWeightItems, (s) => resumeSkills.has(s));
  const requiredSkillCoverage = weightedCoverage(requiredSkillItems, (s) => resumeSkills.has(s));

  // Secondary text-overlap signals
  const resumeTokens = tokenize(resumeText);
  const resumeFreq = frequencyMap(resumeTokens);
  const generalTokens = tokenize(zones.generalText || jdText);
  const generalFreq = frequencyMap(generalTokens);

  const overlapItems = [...generalFreq.entries()].map(([term, freq]) => ({
    key: term,
    weight: 1 + Math.log1p(freq)
  }));

  const overlapCoverage = weightedCoverage(overlapItems, (term) => resumeFreq.has(term));

  // Phrase coverage (small weight)
  const phraseCandidates = [];
  for (let i = 0; i < generalTokens.length - 1; i += 1) {
    const phrase = `${generalTokens[i]} ${generalTokens[i + 1]}`;
    if (phrase.length > 40) continue;
    phraseCandidates.push(phrase);
  }
  const uniquePhrases = [...new Set(phraseCandidates)].slice(0, 60);
  const phraseCoverage = uniquePhrases.length
    ? (uniquePhrases.filter((p) => resumeLower.includes(p)).length / uniquePhrases.length) * 100
    : null;

  const sk = skillCoverage ?? 0;
  const reqSk = requiredSkillCoverage ?? sk;
  const ov = overlapCoverage ?? 0;
  const phr = phraseCoverage ?? 0;

  // Enterprise-style: skills dominate score.
  let rawScore = reqSk * 0.48 + sk * 0.27 + ov * 0.2 + phr * 0.05;

  // Gating to avoid inflated scores when required skills are missing.
  if (requiredSkillCoverage !== null) {
    if (requiredSkillCoverage < 30) rawScore *= 0.62;
    else if (requiredSkillCoverage < 50) rawScore *= 0.78;
  }

  const score = Math.max(0, Math.min(100, round0(rawScore)));

  const missingRequiredKeywords = [...jdRequiredSkills]
    .filter((s) => !resumeSkills.has(s))
    .slice(0, 20);

  const matchedSkillKeywords = [...jdAllSkills]
    .filter((s) => resumeSkills.has(s))
    .slice(0, 30);

  const missingSkillKeywords = [...jdAllSkills]
    .filter((s) => !resumeSkills.has(s))
    .slice(0, 25);

  const missingTopKeywords = missingRequiredKeywords.length
    ? missingRequiredKeywords
    : missingSkillKeywords;

  const overlapTerms = [...generalFreq.keys()].filter((term) => resumeFreq.has(term)).length;

  const rubric = {
    requiredCoverage: requiredSkillCoverage === null ? null : round0(requiredSkillCoverage),
    skillCoverage: skillCoverage === null ? null : round0(skillCoverage),
    generalCoverage: overlapCoverage === null ? null : round0(overlapCoverage),
    preferredCoverage: null,
    phraseCoverage: phraseCoverage === null ? null : round0(phraseCoverage)
  };

  const confidence =
    jdAllSkills.size >= 8
      ? 'high'
      : jdAllSkills.size >= 4
        ? 'medium'
        : 'low';

  return {
    score,
    missingTopKeywords,
    missingRequiredKeywords,
    matchedSkillKeywords,
    jdSkillKeywords: [...jdAllSkills].slice(0, 40),
    jdRequiredSkillKeywords: [...jdRequiredSkills].slice(0, 25),
    missingSkillKeywords,
    rubric,
    confidence,
    stats: {
      jdUniqueTerms: generalFreq.size,
      resumeUniqueTerms: resumeFreq.size,
      overlapTerms,
      requiredCoverage: rubric.requiredCoverage
    }
  };
}
