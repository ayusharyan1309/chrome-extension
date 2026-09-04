# 🎯 JD Resume Tailor

A Chrome extension that extracts job descriptions from any website, scores your resume match, and uses AI to generate ATS-tailored resumes — all from a side panel.

> **"Stop rewriting resumes manually. Let AI tailor them for each job."**

---

## ✨ Features

- 🔍 **Auto-Extract Job Descriptions** — Works on LinkedIn, Indeed, Glassdoor, and any job site
- 📄 **Parse Any Resume Format** — PDF, DOCX, or plain text
- 📊 **ATS Match Scoring** — See how well your resume matches the JD
- 🤖 **AI-Powered Tailoring** — Generates optimized resumes using OpenAI, Gemini, or Perplexity
- 🎯 **Target Score Mode** — Set a target score and let AI iterate until you hit it
- 📝 **LaTeX Export** — Download tailored resume as professional LaTeX/PDF
- 🔑 **Missing Keywords** — See exactly what skills/keywords you're missing
- 💾 **Attempt History** — Track all AI-generated versions and compare scores
- 🔐 **BYOK (Bring Your Own Key)** — Your API keys never leave your browser

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Chrome Extension                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────┐   │
│  │  Content      │    │  Side Panel    │    │  Service     │   │
│  │  Script       │    │  (React UI)   │    │  Worker      │   │
│  │  - JD Extract│    │  - Upload PDF  │    │  - Storage   │   │
│  │  - Scrape    │    │  - Match Score │    │  - Messaging │   │
│  └──────┬───────┘    │  - AI Tailor   │    └──────────────┘   │
│         │            │  - Export      │                        │
│         │            └───────┬────────┘                        │
│         │                    │                                 │
│         ▼                    ▼                                 │
│  ┌──────────────┐    ┌────────────────┐    ┌──────────────┐   │
│  │  Job Sites    │    │  LLM Providers │    │  Export       │   │
│  │  - LinkedIn   │    │  - OpenAI      │    │  - LaTeX      │   │
│  │  - Indeed     │    │  - Gemini      │    │  - PDF        │   │
│  │  - Glassdoor  │    │  - Perplexity  │    └──────────────┘   │
│  │  - Any URL    │    └────────────────┘                        │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Google Chrome browser
- An API key from OpenAI, Gemini, or Perplexity (optional — for AI tailoring)

### Install from Source

```bash
# Clone the repo
git clone https://github.com/ayusharyan1309/chrome-extension.git
cd chrome-extension

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. Pin the extension to your toolbar

---

## 📦 Project Structure

```
chrome-extension/
├── public/
│   └── manifest.json          # Chrome Extension Manifest V3
├── src/
│   ├── sidepanel.js           # Side panel UI logic
│   ├── sidepanel.html         # Side panel HTML
│   ├── content_script.js      # Content script for messaging
│   ├── jd_extract.js          # JD extraction from any website
│   ├── resume_parse.js        # PDF/DOCX resume parsing
│   ├── match.js               # ATS keyword matching algorithm
│   ├── llm.js                 # LLM integration (OpenAI/Gemini/Perplexity)
│   └── docx_export.js         # LaTeX/PDF export
├── dist/                      # Built extension (load this in Chrome)
├── vite.config.js             # Vite build configuration
├── package.json
└── README.md
```

---

## 🔧 How It Works

### 1. Extract Job Description

Click the extension icon → Side panel opens → Click **Auto-Extract**

The content script intelligently extracts JD text from any job site:
- Detects job description containers using CSS selectors
- Filters out noise (navigation, ads, unrelated content)
- Supports LinkedIn, Indeed, Glassdoor, and custom sites

### 2. Upload Your Resume

Supports multiple formats:
- **PDF** — Parsed with pdf.js
- **DOCX** — Parsed with Mammoth
- **Plain text** — Paste directly

### 3. Score Match

The matching algorithm analyzes:
- **Keyword presence** — Required vs preferred skills
- **Skill vocabulary** — 50+ technical skills mapped
- **Keyword density** — How prominently skills appear
- **Missing gaps** — What you need to add

### 4. AI Tailor

Choose your LLM provider and let AI rewrite your resume:
- Maintains your identity (name, contact, links)
- Rewrites bullet points to match JD keywords
- Optimizes for ATS parsing
- Iterates until target score is reached

### 5. Export

Download your tailored resume as:
- **LaTeX** — Professional formatting
- **PDF** — Ready to submit (via LaTeX compilation)

---

## 🤖 Supported LLM Providers

| Provider | Models | Free Tier |
|----------|--------|-----------|
| OpenAI | GPT-4o-mini, GPT-4.1-mini, GPT-4o | ❌ |
| Google Gemini | Gemini 2.5 Flash, Gemini 2.5 Pro | ✅ |
| Perplexity | Sonar, Sonar Pro, Sonar Reasoning | ❌ |

> **Tip:** Gemini offers a generous free tier — great for testing!

---

## 🔐 Privacy & Security

- ✅ **BYOK (Bring Your Own Key)** — API keys stored in Chrome's local storage only
- ✅ **No backend server** — All processing happens in your browser
- ✅ **No data collection** — Nothing leaves your machine
- ✅ **No tracking** — Zero analytics or telemetry

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Chrome Extension Manifest V3 | Extension architecture |
| Vite | Build tooling |
| JavaScript (ES Modules) | Core logic |
| pdf.js | PDF parsing |
| Mammoth | DOCX parsing |
| OpenAI API | LLM tailoring |
| Google Gemini API | LLM tailoring |
| Perplexity API | LLM tailoring |
| LaTeX | Resume formatting |

---

## 📊 ATS Match Scoring

The matching algorithm scores your resume (0-100) based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Required keywords | 40% | Must-have skills from JD |
| Preferred keywords | 25% | Nice-to-have skills |
| Skill coverage | 20% | Overall skill vocabulary match |
| Keyword density | 15% | How prominently skills appear |

**Score Interpretation:**
- **80-100** — Excellent match, high ATS passing chance
- **60-79** — Good match, consider adding missing keywords
- **40-59** — Moderate match, significant tailoring needed
- **0-39** — Low match, consider if role fits your profile

---

## 📋 API Endpoints Used

| Provider | Endpoint |
|----------|----------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| Perplexity | `https://api.perplexity.ai/chat/completions` |

---

## 🚀 Deployment

### Chrome Web Store

```bash
# Build for production
npm run build

# Zip the dist folder
cd dist && zip -r ../extension.zip . && cd ..

# Upload to Chrome Web Store Developer Dashboard
```

---

## 📄 License

MIT
