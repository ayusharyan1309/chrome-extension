const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'can', 'our', 'about', 'into', 'their', 'they', 'them', 'but',
  'not', 'all', 'any', 'its', 'per', 'who', 'how', 'what', 'when', 'where', 'why', 'job', 'role'
]);

const SKILL_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'go', 'react', 'angular', 'vue', 'node', 'nodejs',
  'sql', 'postgres', 'mysql', 'mongodb', 'redis', 'aws', 'gcp', 'azure', 'docker', 'kubernetes',
  'terraform', 'graphql', 'rest', 'microservices', 'ci', 'cd', 'git', 'linux', 'security',
  'testing', 'pytest', 'jest', 'cypress', 'playwright', 'html', 'css', 'sass', 'webpack', 'vite'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
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

export function computeMatch(jdText, resumeText) {
  const jdTokens = tokenize(jdText);
  const resumeTokens = tokenize(resumeText);
  const jdFreq = frequencyMap(jdTokens);
  const resumeFreq = frequencyMap(resumeTokens);

  let totalWeight = 0;
  let matchedWeight = 0;
  const missing = [];

  for (const [term, freq] of jdFreq.entries()) {
    let weight = 1 + Math.log1p(freq);
    if (SKILL_KEYWORDS.has(term)) weight += 1.75;
    if (freq > 2) weight += 0.5;

    totalWeight += weight;

    if (resumeFreq.has(term)) {
      const resumeBoost = Math.min(Math.log1p(resumeFreq.get(term)), 1);
      matchedWeight += weight + resumeBoost;
    } else {
      missing.push({ term, weight, freq });
    }
  }

  const rawScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  missing.sort((a, b) => b.weight - a.weight || b.freq - a.freq);

  return {
    score,
    missingTopKeywords: missing.slice(0, 12).map((x) => x.term),
    stats: {
      jdUniqueTerms: jdFreq.size,
      resumeUniqueTerms: resumeFreq.size,
      overlapTerms: [...jdFreq.keys()].filter((t) => resumeFreq.has(t)).length
    }
  };
}
