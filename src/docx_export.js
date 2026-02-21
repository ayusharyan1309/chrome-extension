function escapeLatex(text) {
  return (text || '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function escapeLatexUrl(url) {
  return (url || '').replace(/\\/g, '/').replace(/([%#{} ])/g, (m) => encodeURIComponent(m));
}

function safeText(value, fallback = 'Not provided') {
  const text = (value || '').toString().trim();
  return text || fallback;
}

function renderSkillsBlock(skills = {}) {
  const ordered = [
    ['Languages', skills.Languages],
    ['Backend', skills.Backend],
    ['Mobile', skills.Mobile],
    ['Databases & Infra', skills['Databases & Infra']],
    ['Tools', skills.Tools]
  ];

  const lines = ordered
    .filter(([, value]) => (value || '').trim())
    .map(([name, value]) => `\\textbf{${escapeLatex(name)}:} ${escapeLatex(value)} \\\\`);

  return lines.join('\n') || '\\textbf{Skills:} Not provided';
}

function renderExperienceBlock(experience = []) {
  if (!experience.length) {
    return [
      '\\resumeSubheading',
      '{Not provided}{Not provided}',
      '{Not provided}{Not provided}',
      '\\begin{itemize}',
      '\\resumeItem{Not provided}',
      '\\end{itemize}'
    ].join('\n');
  }

  return experience.map((item) => {
    const bullets = (item.bullets || []).filter(Boolean).slice(0, 6);
    const bulletBlock = bullets.length
      ? bullets.map((b) => `\\resumeItem{${escapeLatex(b)}}`).join('\n')
      : '\\resumeItem{Not provided}';

    return [
      '\\resumeSubheading',
      `{${escapeLatex(safeText(item.company))}}{${escapeLatex(safeText(item.location))}}`,
      `{${escapeLatex(safeText(item.title))}}{${escapeLatex(safeText(item.dates))}}`,
      '\\begin{itemize}',
      bulletBlock,
      '\\end{itemize}'
    ].join('\n');
  }).join('\n\n');
}

function renderProjectsBlock(projects = []) {
  if (!projects.length) {
    return [
      '\\resumeProjectHeading',
      '{Not provided}{Link}{https://example.com}',
      '\\begin{itemize}',
      '\\resumeItem{Not provided}',
      '\\end{itemize}'
    ].join('\n');
  }

  return projects.map((item) => {
    const bullets = (item.bullets || []).filter(Boolean).slice(0, 6);
    const bulletBlock = bullets.length
      ? bullets.map((b) => `\\resumeItem{${escapeLatex(b)}}`).join('\n')
      : '\\resumeItem{Not provided}';

    const link = safeText(item.url, 'https://example.com');
    const label = safeText(item.label, 'Link');

    return [
      '\\resumeProjectHeading',
      `{${escapeLatex(safeText(item.name))}}`,
      `{${escapeLatex(label)}}`,
      `{${escapeLatexUrl(link)}}`,
      '\\begin{itemize}',
      bulletBlock,
      '\\end{itemize}'
    ].join('\n');
  }).join('\n\n');
}

function renderEducationBlock(education = []) {
  if (!education.length) {
    return [
      '\\resumeSubheading',
      '{Not provided}{Not provided}',
      '{Not provided}{Not provided}'
    ].join('\n');
  }

  return education.map((item) => [
    '\\resumeSubheading',
    `{${escapeLatex(safeText(item.institution))}}{${escapeLatex(safeText(item.location))}}`,
    `{${escapeLatex(safeText(item.degree))}}{${escapeLatex(safeText(item.dates))}}`
  ].join('\n')).join('\n\n');
}

const DEFAULT_LAYOUT_TEMPLATE = String.raw`%-------------------------
% Resume in Latex
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{tabularx}
\usepackage{lmodern}
\usepackage{xcolor}

% ---------- COLOR ----------
\definecolor{faangblue}{RGB}{0,70,140}

% ---------- MARGINS ----------
\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\textwidth}{1.19in}
\addtolength{\topmargin}{-.75in}
\addtolength{\textheight}{1.5in}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% ---------- SECTION FORMAT ----------
\titleformat{\section}{
  \vspace{-6pt}\scshape\raggedright\large\bfseries
}{}{0em}{}[\vspace{-4pt}\titlerule]

\titlespacing{\section}{0pt}{8pt}{6pt}

% ---------- LIST SPACING ----------
\setlist[itemize]{itemsep=2pt, topsep=2pt, leftmargin=*}

% ---------- COMMANDS ----------
\newcommand{\resumeItem}[1]{\item\small{#1}}

\newcommand{\resumeSubheading}[4]{
\begin{tabular*}{1.0\textwidth}{l@{\extracolsep{\fill}}r}
\textbf{\textcolor{faangblue}{#1}} & \textbf{#2} \\
\textit{#3} & \textit{#4} \\
\end{tabular*}
}

\newcommand{\resumeProjectHeading}[3]{
\begin{tabular*}{1.0\textwidth}{l@{\extracolsep{\fill}}r}
\textbf{\textcolor{faangblue}{#1}} & \href{#3}{#2} \\
\end{tabular*}
}

\begin{document}

%---------- HEADER ----------
\begin{center}
{\Huge \scshape \textcolor{faangblue}{ {{NAME}} }} \\ \vspace{2pt}
\small
Phone: {{PHONE}} \quad
Email: {{EMAIL}} \quad
LinkedIn: {{LINKEDIN}} \quad
GitHub: {{GITHUB}}
\end{center}

%---------- SUMMARY ----------
\section{Summary}
{{SUMMARY}}

%---------- SKILLS ----------
\section{Technical Skills}
\small
{{SKILLS_BLOCK}}

%---------- EXPERIENCE ----------
\section{Work Experience}
{{EXPERIENCE_BLOCK}}

%---------- PROJECTS ----------
\section{Projects}
{{PROJECTS_BLOCK}}

%---------- EDUCATION ----------
\section{Education}
{{EDUCATION_BLOCK}}

\end{document}
`;

function buildCompatibilityLatex(latexSource) {
  let out = latexSource || '';
  out = out
    .replace(/\\usepackage\{fontawesome5\}\s*/g, '')
    .replace(/\\usepackage\{charter\}\s*/g, '')
    .replace(/\\faPhone\\?/g, 'Phone:')
    .replace(/\\faEnvelope\\?/g, 'Email:')
    .replace(/\\faLinkedin\\?/g, 'LinkedIn:')
    .replace(/\\faGithub\\?/g, 'GitHub:');
  return out;
}

export function buildLatexFromStructuredResume(resume, customTemplate = '') {
  const template = customTemplate && customTemplate.includes('{{')
    ? customTemplate
    : DEFAULT_LAYOUT_TEMPLATE;

  const summary = safeText(resume.summary);
  const replacements = {
    '{{NAME}}': escapeLatex(safeText(resume.name)),
    '{{PHONE}}': escapeLatex(safeText(resume.phone)),
    '{{EMAIL}}': escapeLatex(safeText(resume.email)),
    '{{LINKEDIN}}': escapeLatex(safeText(resume.linkedin)),
    '{{GITHUB}}': escapeLatex(safeText(resume.github)),
    '{{SUMMARY}}': escapeLatex(summary),
    '{{SKILLS_BLOCK}}': renderSkillsBlock(resume.skills),
    '{{EXPERIENCE_BLOCK}}': renderExperienceBlock(resume.experience),
    '{{PROJECTS_BLOCK}}': renderProjectsBlock(resume.projects),
    '{{EDUCATION_BLOCK}}': renderEducationBlock(resume.education)
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}

async function compileLatexToPdf(latexSource, compilerUrl = 'https://latexonline.cc/compile') {
  function buildTarSingleFile(filename, content) {
    const encoder = new TextEncoder();
    const fileNameBytes = encoder.encode(filename.slice(0, 100));
    const contentBytes = encoder.encode(content);

    const header = new Uint8Array(512);
    const writeString = (offset, length, value) => {
      const bytes = encoder.encode(value);
      header.set(bytes.slice(0, length), offset);
    };
    const writeOctal = (offset, length, value) => {
      const octal = value.toString(8);
      const padded = octal.padStart(length - 1, '0');
      writeString(offset, length, `${padded}\0`);
    };

    header.set(fileNameBytes, 0);
    writeOctal(100, 8, 0o644); // mode
    writeOctal(108, 8, 0); // uid
    writeOctal(116, 8, 0); // gid
    writeOctal(124, 12, contentBytes.length); // size
    writeOctal(136, 12, Math.floor(Date.now() / 1000)); // mtime
    for (let i = 148; i < 156; i += 1) header[i] = 0x20; // checksum spaces
    header[156] = '0'.charCodeAt(0); // typeflag
    writeString(257, 6, 'ustar\0');
    writeString(263, 2, '00');

    let checksum = 0;
    for (let i = 0; i < 512; i += 1) checksum += header[i];
    const check = checksum.toString(8).padStart(6, '0');
    writeString(148, 8, `${check}\0 `);

    const contentPad = (512 - (contentBytes.length % 512)) % 512;
    const totalSize = 512 + contentBytes.length + contentPad + 1024; // 2 zero blocks
    const tar = new Uint8Array(totalSize);
    tar.set(header, 0);
    tar.set(contentBytes, 512);
    return tar;
  }

  async function ensurePdfResponse(response, context) {
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LaTeX compile failed (${response.status}) [${context}]: ${errText.slice(0, 250)}`);
    }

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const prefix = new TextDecoder().decode(buffer.slice(0, 5));
    const isPdf = prefix === '%PDF-';
    if (!isPdf) {
      const text = new TextDecoder().decode(buffer.slice(0, 240));
      throw new Error(`LaTeX compile returned non-PDF [${context}]: ${text.slice(0, 200)}`);
    }
    return new Blob([buffer], { type: 'application/pdf' });
  }

  const parsed = new URL(compilerUrl || 'https://latexonline.cc/compile');
  const dataUrl = parsed.pathname.endsWith('/data')
    ? parsed.toString()
    : new URL('/data', parsed.origin).toString();

  async function attemptCompile(source) {
    // Preferred route for large LaTeX sources: upload tarball to /data
    try {
      const tarBytes = buildTarSingleFile('main.tex', source);
      const form = new FormData();
      form.append('file', new Blob([tarBytes], { type: 'application/x-tar' }), 'resume.tar');
      const targetUrl = new URL(dataUrl);
      targetUrl.searchParams.set('target', 'main.tex');
      targetUrl.searchParams.set('command', 'pdflatex');

      const response = await fetch(targetUrl.toString(), {
        method: 'POST',
        body: form
      });
      return await ensurePdfResponse(response, 'POST /data');
    } catch (_dataErr) {
      // Fallback to text endpoint for providers that support POST text.
    }

    try {
      const body = new URLSearchParams({ text: source });
      const response = await fetch(parsed.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body
      });
      return await ensurePdfResponse(response, 'POST text');
    } catch (_postErr) {
      // Last resort for short docs only.
    }

    const encoded = encodeURIComponent(source);
    if (encoded.length > 12000) {
      throw new Error('LaTeX source is too large for GET fallback and POST compile endpoint is unavailable.');
    }

    const getUrl = `${parsed.toString().replace(/\?$/, '')}${parsed.search ? '&' : '?'}text=${encoded}`;
    const getResponse = await fetch(getUrl, { method: 'GET' });
    return ensurePdfResponse(getResponse, 'GET text');
  }

  try {
    return await attemptCompile(latexSource);
  } catch (err) {
    const msg = err?.message || String(err);
    if (!/not found/i.test(msg) && !/fontawesome5|charter/i.test(msg)) {
      throw err;
    }
    const compatible = buildCompatibilityLatex(latexSource);
    return attemptCompile(compatible);
  }
}

async function startDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    if (chrome?.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: true });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export async function downloadTailoredResumePdf({
  structuredResume,
  filename = 'tailored_resume.pdf',
  compilerUrl,
  customTemplate = ''
}) {
  const latex = buildLatexFromStructuredResume(structuredResume, customTemplate);
  const pdfBlob = await compileLatexToPdf(latex, compilerUrl);
  await startDownload(pdfBlob, filename);
}

export async function downloadTailoredResumeTex({
  structuredResume,
  filename = 'tailored_resume.tex',
  customTemplate = ''
}) {
  const latex = buildLatexFromStructuredResume(structuredResume, customTemplate);
  const texBlob = new Blob([latex], { type: 'text/x-tex;charset=utf-8' });
  await startDownload(texBlob, filename);
}
