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

export async function generateTailoredResume({
  endpoint,
  apiKey,
  model,
  jdText,
  baseResumeText,
  temperature = 0.2
}) {
  if (!endpoint || !model) {
    throw new Error('LLM endpoint and model are required');
  }

  const systemPrompt = [
    'You are an ATS resume tailoring assistant.',
    'Hard constraints:',
    '- Do NOT invent jobs, companies, dates, degrees, certifications, technologies, achievements, or metrics.',
    '- Use ONLY facts present in the base resume text.',
    '- You may rephrase, reorder, and emphasize existing content only.',
    '- Skills section may include only skills present in the base resume text.',
    '- Output plain text with these exact section headers in order:',
    'SUMMARY',
    'SKILLS',
    'EXPERIENCE',
    'PROJECTS',
    'EDUCATION',
    '- If a section has no data, keep the header and write "Not provided".'
  ].join('\n');

  const userPrompt = [
    'Target Job Description:',
    jdText,
    '',
    'Base Resume Text:',
    baseResumeText,
    '',
    'Return only the final tailored resume text. No markdown fences.'
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
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  return parseOpenAICompatibleResponse(json);
}
