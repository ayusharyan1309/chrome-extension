const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'can', 'our', 'about', 'into', 'their', 'they', 'them', 'but',
  'not', 'all', 'any', 'its', 'per', 'who', 'how', 'what', 'when', 'where', 'why', 'job', 'role',
  'team', 'work', 'works', 'working', 'candidate', 'including', 'using', 'build', 'built'
]);

const SKILL_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'go', 'react', 'angular', 'vue', 'node', 'nodejs',
  'sql', 'postgres', 'mysql', 'mongodb', 'redis', 'aws', 'gcp', 'azure', 'docker', 'kubernetes',
  'terraform', 'graphql', 'rest', 'microservices', 'ci', 'cd', 'git', 'linux', 'security',
  'testing', 'pytest', 'jest', 'cypress', 'playwright', 'html', 'css', 'sass', 'webpack', 'vite'
]);

const REQUIRED_MARKERS = ['required', 'must have', 'minimum qualifications', 'basic qualifications'];
const PREFERRED_MARKERS = ['preferred', 'nice to have', 'bonus', 'good to have'];

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/\u00a0/g, ' ');
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9+#.\-\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function frequencyMap(tokens) {
  const map = new Map();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
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

function extractPhrases(tokens, minFreq = 2) {
  const phraseFreq = new Map();

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bi = `${tokens[i]} ${tokens[i + 1]}`;
    phraseFreq.set(bi, (phraseFreq.get(bi) || 0) + 1);

    if (i < tokens.length - 2) {
      const tri = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      phraseFreq.set(tri, (phraseFreq.get(tri) || 0) + 1);
    }
  }

  const out = [];
  for (const [phrase, freq] of phraseFreq.entries()) {
    if (freq >= minFreq && phrase.length <= 48) {
      out.push({ phrase, freq });
    }
  }

  out.sort((a, b) => b.freq - a.freq || b.phrase.length - a.phrase.length);
  return out.slice(0, 40);
}

function containsPhrase(text, phrase) {
  return normalizeText(text).includes(phrase);
}

function scoreTokenBucket({ jdFreq, resumeFreq, zoneWeight, zoneName, missing, matched }) {
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const [term, freq] of jdFreq.entries()) {
    let weight = zoneWeight * (1 + Math.log1p(freq));
    if (SKILL_KEYWORDS.has(term)) weight += zoneWeight * 1.6;
    if (freq > 2) weight += zoneWeight * 0.4;

    totalWeight += weight;

    if (resumeFreq.has(term)) {
      const resumeBoost = Math.min(Math.log1p(resumeFreq.get(term)), 1);
      matchedWeight += weight + resumeBoost;
      matched.push({ term, zone: zoneName, weight });
    } else {
      missing.push({ term, zone: zoneName, weight, freq });
    }
  }

  return { totalWeight, matchedWeight };
}

export function computeMatch(jdText, resumeText) {
  const zones = splitJdZones(jdText);

  const resumeTokens = tokenize(resumeText);
  const resumeFreq = frequencyMap(resumeTokens);

  const requiredTokens = tokenize(zones.requiredText);
  const preferredTokens = tokenize(zones.preferredText);
  const generalTokens = tokenize(zones.generalText || jdText);

  const requiredFreq = frequencyMap(requiredTokens);
  const preferredFreq = frequencyMap(preferredTokens);
  const generalFreq = frequencyMap(generalTokens);

  const missing = [];
  const matched = [];

  const requiredScore = scoreTokenBucket({
    jdFreq: requiredFreq,
    resumeFreq,
    zoneWeight: 2.5,
    zoneName: 'required',
    missing,
    matched
  });

  const preferredScore = scoreTokenBucket({
    jdFreq: preferredFreq,
    resumeFreq,
    zoneWeight: 1.4,
    zoneName: 'preferred',
    missing,
    matched
  });

  const generalScore = scoreTokenBucket({
    jdFreq: generalFreq,
    resumeFreq,
    zoneWeight: 1,
    zoneName: 'general',
    missing,
    matched
  });

  const jdPhrases = extractPhrases(tokenize(jdText));
  let phraseTotalWeight = 0;
  let phraseMatchedWeight = 0;

  for (const item of jdPhrases) {
    const phraseWeight = Math.min(1.5 + item.freq * 0.5, 4);
    phraseTotalWeight += phraseWeight;
    if (containsPhrase(resumeText, item.phrase)) {
      phraseMatchedWeight += phraseWeight;
    }
  }

  const totalWeight = requiredScore.totalWeight + preferredScore.totalWeight + generalScore.totalWeight + phraseTotalWeight;
  const matchedWeight = requiredScore.matchedWeight + preferredScore.matchedWeight + generalScore.matchedWeight + phraseMatchedWeight;

  const rawScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  missing.sort((a, b) => b.weight - a.weight || b.freq - a.freq);

  const requiredMissing = missing.filter((x) => x.zone === 'required').slice(0, 12).map((x) => x.term);
  const requiredTotal = requiredFreq.size;
  const requiredMatched = matched.filter((x) => x.zone === 'required').length;

  return {
    score,
    missingTopKeywords: missing.slice(0, 15).map((x) => x.term),
    missingRequiredKeywords: requiredMissing,
    stats: {
      jdUniqueTerms: new Set([...requiredFreq.keys(), ...preferredFreq.keys(), ...generalFreq.keys()]).size,
      resumeUniqueTerms: resumeFreq.size,
      overlapTerms: new Set(matched.map((x) => x.term)).size,
      requiredCoverage: requiredTotal > 0 ? Math.round((requiredMatched / requiredTotal) * 100) : null
    }
  };
}
