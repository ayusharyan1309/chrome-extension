function escapeLatex(text) {
  return (text || '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\n/g, '\\\\');
}

export function resumeTextToLatex(resumeText) {
  const safeBody = escapeLatex(resumeText);
  return [
    '\\documentclass[11pt]{article}',
    '\\usepackage[margin=0.7in]{geometry}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{enumitem}',
    '\\setlength{\\parindent}{0pt}',
    '\\begin{document}',
    safeBody,
    '\\end{document}'
  ].join('\n');
}

export async function compileLatexToPdf(latexSource, compilerUrl = 'https://latexonline.cc/compile') {
  const url = `${compilerUrl}?text=${encodeURIComponent(latexSource)}`;
  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LaTeX compile failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  return response.blob();
}

export async function downloadTailoredResumePdf(resumeText, filename = 'tailored_resume.pdf', compilerUrl) {
  const latex = resumeTextToLatex(resumeText);
  const pdfBlob = await compileLatexToPdf(latex, compilerUrl);
  const url = URL.createObjectURL(pdfBlob);

  try {
    if (chrome?.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true
      });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
