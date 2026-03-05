#!/usr/bin/env node

/**
 * Generate an HTML slideshow from the agentic QA presentation Markdown.
 *
 * Usage:
 *   node scripts/generate-presentation.js
 *   node scripts/generate-presentation.js docs/presentation/agentic-qa-workflow.md
 *
 * Output: docs/presentation/agentic-qa-workflow.html
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const inputPath = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(ROOT, 'docs', 'presentation', 'agentic-qa-workflow.md');

const outputPath = inputPath.replace(/\.md$/, '.html');

const md = readFileSync(inputPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ---------------------------------------------------------------------------
// Markdown-to-HTML helpers (lightweight, no dependencies)
// ---------------------------------------------------------------------------

/** Escape HTML special chars */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert inline markdown: **bold**, `code`, [link](url) */
function inlineMd(text) {
  let out = esc(text);
  // bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  // links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

/** Parse a markdown table block (array of lines) into HTML */
function tableToHtml(lines) {
  const rows = lines
    .map(l => l.trim())
    .filter(l => l.startsWith('|'))
    .map(l =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(c => c.trim()),
    );

  if (rows.length < 2) return '';

  const header = rows[0];
  // rows[1] is the separator line
  const body = rows.slice(2);

  let html = '<table><thead><tr>';
  for (const h of header) html += `<th>${inlineMd(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of body) {
    html += '<tr>';
    for (const cell of row) html += `<td>${inlineMd(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

/** Convert a content block (between speaker notes and slide boundaries) to HTML */
function blockToHtml(block) {
  const lines = block.split('\n');
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().replace(/^```/, '').trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      chunks.push(
        `<pre><code${lang ? ` class="lang-${lang}"` : ''}>${esc(codeLines.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // Table block
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      chunks.push(tableToHtml(tableLines));
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      chunks.push(
        '<ul>' + items.map(it => `<li>${inlineMd(it)}</li>`).join('') + '</ul>',
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      chunks.push(
        '<ol>' + items.map(it => `<li>${inlineMd(it)}</li>`).join('') + '</ol>',
      );
      continue;
    }

    // Paragraph / standalone line
    chunks.push(`<p>${inlineMd(line.trim())}</p>`);
    i++;
  }

  return chunks.join('\n');
}

// ---------------------------------------------------------------------------
// Parse slides
// ---------------------------------------------------------------------------

// Split on horizontal rules: a line that is exactly "---" (with optional spaces)
const parts = md.split(/\n(?=---\s*\n)/);

// Filter to only parts that start with --- (slide separators), then strip the --- prefix
const rawSlides = parts
  .filter(p => /^---\s*\n/.test(p))
  .map(p => p.replace(/^---\s*\n/, ''))
  .filter(p => /^##\s+Slide\s+\d+/m.test(p));

const slides = rawSlides.map((raw, idx) => {
  const lines = raw.trim().split('\n');

  // Extract ## Slide N: Title
  const headerLine = lines.find(l => /^##\s+Slide\s+\d+/i.test(l));
  const slideId = headerLine ? headerLine.replace(/^##\s+/, '').trim() : `Slide ${idx + 1}`;

  // Extract **Title:**
  const titleLine = lines.find(l => /^\*\*Title:\*\*/.test(l.trim()));
  const title = titleLine
    ? titleLine.replace(/^\*\*Title:\*\*\s*/, '').trim()
    : slideId;

  // Extract **Subtitle:**
  const subtitleLine = lines.find(l => /^\*\*Subtitle:\*\*/.test(l.trim()));
  const subtitle = subtitleLine
    ? subtitleLine.replace(/^\*\*Subtitle:\*\*\s*/, '').trim()
    : '';

  // Extract speaker notes
  const notesStart = lines.findIndex(l => /^\*\*Speaker notes:\*\*/.test(l.trim()));
  let notes = '';
  if (notesStart >= 0) {
    const firstLine = lines[notesStart].replace(/^\*\*Speaker notes:\*\*\s*/, '').trim();
    const noteLines = [firstLine];
    for (let j = notesStart + 1; j < lines.length; j++) {
      if (lines[j].trim() === '' && j === lines.length - 1) break;
      noteLines.push(lines[j]);
    }
    notes = noteLines.join(' ').trim();
  }

  // Content = everything between header and speaker notes, excluding Title/Subtitle meta
  const contentStart = headerLine ? lines.indexOf(headerLine) + 1 : 0;
  const contentEnd = notesStart >= 0 ? notesStart : lines.length;
  const contentLines = lines
    .slice(contentStart, contentEnd)
    .filter(l => !/^\*\*(Title|Subtitle):\*\*/.test(l.trim()));

  const content = blockToHtml(contentLines.join('\n'));

  return { slideId, title, subtitle, notes, content, index: idx };
});

// ---------------------------------------------------------------------------
// SVG icon definitions (Anthropic-themed)
// ---------------------------------------------------------------------------

const ICONS = {
  crab: `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
  </svg>`,

  sparkle: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 4 L27 18 L42 16 L30 24 L42 32 L27 30 L24 44 L21 30 L6 32 L18 24 L6 16 L21 18 Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.6"/>
    <circle cx="10" cy="10" r="1.5" fill="currentColor" opacity="0.3"/>
    <circle cx="38" cy="10" r="1.5" fill="currentColor" opacity="0.3"/>
    <circle cx="10" cy="38" r="1.5" fill="currentColor" opacity="0.3"/>
    <circle cx="38" cy="38" r="1.5" fill="currentColor" opacity="0.3"/>
  </svg>`,

  snowflake: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="24" y1="4" x2="24" y2="44" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6.7" y1="14" x2="41.3" y2="34" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6.7" y1="34" x2="41.3" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M24 10 L20 6 M24 10 L28 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M24 38 L20 42 M24 38 L28 42" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M12 18 L8 18 M12 18 L12 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M36 30 L40 30 M36 30 L36 34" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M12 30 L8 30 M12 30 L12 34" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M36 18 L40 18 M36 18 L36 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1"/>
    <circle cx="24" cy="24" r="1.5" fill="currentColor" opacity="0.5"/>
  </svg>`,

  circuit: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="10" cy="12" r="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="38" cy="12" r="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="10" cy="36" r="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="38" cy="36" r="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.2"/>
    <line x1="13" y1="14" x2="21" y2="22" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="35" y1="14" x2="27" y2="22" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="13" y1="34" x2="21" y2="26" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="35" y1="34" x2="27" y2="26" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="24" cy="8" r="2" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1"/>
    <circle cx="24" cy="40" r="2" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1"/>
    <line x1="24" y1="10" x2="24" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 2"/>
    <line x1="24" y1="28" x2="24" y2="38" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 2"/>
    <circle cx="24" cy="24" r="1.5" fill="currentColor"/>
  </svg>`,
};

// Map each slide index to an icon + animation style
const SLIDE_ICONS = [
  { icon: 'crab',      anim: 'spin-slow' },  // 1: Title
  { icon: 'snowflake', anim: 'spin-slow' },  // 2: Agenda
  { icon: 'snowflake', anim: 'spin-slow' },  // 3: The Problem
  { icon: 'snowflake', anim: 'spin-slow' },  // 4: By the Numbers
  { icon: 'snowflake', anim: 'spin-slow' },  // 5: Architecture
  { icon: 'snowflake', anim: 'spin-slow' },  // 6: MCP Servers
  { icon: 'snowflake', anim: 'spin-slow' },  // 7: Agent Teams
  { icon: 'snowflake', anim: 'spin-slow' },  // 8: Four-Layer
  { icon: 'snowflake', anim: 'spin-slow' },  // 9: Browser Isolation
  { icon: 'snowflake', anim: 'spin-slow' },  // 10: Orchestration
  { icon: 'snowflake', anim: 'spin-slow' },  // 11: Regression Pipeline
  { icon: 'snowflake', anim: 'spin-slow' },  // 12: Quality Gates
  { icon: 'snowflake', anim: 'spin-slow' },  // 13: CI/CD
  { icon: 'snowflake', anim: 'spin-slow' },  // 14: Commands & Skills
  { icon: 'snowflake', anim: 'spin-slow' },  // 15: Knowledge
  { icon: 'snowflake', anim: 'spin-slow' },  // 16: Skill Graph
  { icon: 'snowflake', anim: 'spin-slow' },  // 17: Smoke Test
  { icon: 'snowflake', anim: 'spin-slow' },  // 18: Benefits
  { icon: 'snowflake', anim: 'spin-slow' },  // 19: Roadmap
];

function getSlideIcon(index, withLabel = false) {
  const cfg = SLIDE_ICONS[index] || SLIDE_ICONS[0];
  const icon = `<div class="slide-icon slide-icon--${cfg.anim}">${ICONS[cfg.icon]}</div>`;
  if (!withLabel) return icon;
  return `${icon}<span class="spinner-label"></span>`;
}

// ---------------------------------------------------------------------------
// Generate HTML
// ---------------------------------------------------------------------------

const totalSlides = slides.length;

const slidesHtml = slides
  .map(
    (s, i) => `
    <section class="slide${i === 0 ? ' active' : ''}" id="slide-${i}">
      <div class="slide-inner">
        <div class="slide-number">${i + 1} / ${totalSlides}</div>
        ${i === 0 ? getSlideIcon(i) : ''}
        <h1 class="slide-title">${esc(s.title)}</h1>
        ${s.subtitle ? `<p class="slide-subtitle">${esc(s.subtitle)}</p>` : ''}
        <div class="slide-content">${s.content}</div>
        ${i !== 0 ? `<div class="notes-row">${getSlideIcon(i, true)}${s.notes ? `<div class="speaker-notes"><strong>Notes:</strong> ${inlineMd(s.notes)}</div>` : ''}</div>` : s.notes ? `<div class="speaker-notes"><strong>Notes:</strong> ${inlineMd(s.notes)}</div>` : ''}
      </div>
    </section>`,
  )
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agentic QA: LLM-Driven Testing for Virto Commerce</title>
<style>
/* ===== Anthropic-inspired design tokens ===== */
:root {
  --bg-primary: #131314;
  --bg-slide: #1a1a1c;
  --bg-code: #232326;
  --bg-table-header: #1f1f22;
  --bg-table-row: rgba(255,255,255,0.02);
  --bg-table-row-alt: rgba(255,255,255,0.05);
  --text-primary: #faf9f0;
  --text-secondary: #b0afa6;
  --text-muted: #78776e;
  --accent: #d97757;
  --accent-hover: #e08a6d;
  --accent-subtle: rgba(217,119,87,0.15);
  --border: rgba(255,255,255,0.08);
  --border-accent: rgba(217,119,87,0.3);
  --radius: 8px;
  --radius-lg: 12px;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  --shadow: 0 2px 12px rgba(0,0,0,0.4);
}

/* ===== Reset & base ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 18px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

/* ===== Slide container ===== */
.deck { position: relative; width: 100%; height: 100%; }

.slide {
  position: absolute; inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
}
.slide.active {
  opacity: 1;
  pointer-events: auto;
}

.slide-inner {
  width: min(1100px, 90vw);
  max-height: 88vh;
  overflow-y: auto;
  background: var(--bg-slide);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 48px 56px 40px;
  box-shadow: var(--shadow);
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}
.slide-inner::-webkit-scrollbar { width: 6px; }
.slide-inner::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 3px; }

/* ===== Slide number badge ===== */
.slide-number {
  position: absolute;
  top: 18px; right: 24px;
  font-size: 13px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

/* ===== Typography ===== */
.slide-title {
  font-size: clamp(28px, 3vw, 38px);
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.slide-subtitle {
  font-size: 20px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  font-weight: 400;
}

.slide-content h1, .slide-content h2, .slide-content h3 {
  color: var(--accent);
  margin: 20px 0 10px;
}

.slide-content p {
  margin: 10px 0;
  color: var(--text-primary);
}

.slide-content strong {
  color: var(--text-primary);
  font-weight: 600;
}

.slide-content a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid var(--border-accent);
}
.slide-content a:hover { color: var(--accent-hover); }

/* ===== Lists ===== */
.slide-content ul, .slide-content ol {
  margin: 10px 0 10px 24px;
}
.slide-content li {
  margin: 5px 0;
  color: var(--text-primary);
}
.slide-content li::marker {
  color: var(--accent);
}

/* ===== Tables ===== */
.slide-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 15px;
}
.slide-content th {
  background: var(--bg-table-header);
  color: var(--accent);
  font-weight: 600;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 2px solid var(--border-accent);
  white-space: nowrap;
}
.slide-content td {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  vertical-align: top;
}
.slide-content tr:nth-child(even) td { background: var(--bg-table-row-alt); }
.slide-content tr:hover td { background: var(--accent-subtle); }

/* ===== Code blocks ===== */
.slide-content pre {
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 16px 20px;
  margin: 14px 0;
  overflow-x: auto;
  font-size: 14px;
  line-height: 1.5;
}
.slide-content pre code {
  font-family: var(--font-mono);
  color: var(--text-primary);
  white-space: pre;
}
.slide-content code.inline {
  font-family: var(--font-mono);
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.88em;
  color: var(--accent);
}

/* ===== Speaker notes ===== */
.speaker-notes {
  display: none;
  margin-top: 24px;
  padding: 16px 20px;
  background: rgba(217,119,87,0.08);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.55;
}
.speaker-notes strong { color: var(--accent); }
body.show-notes .speaker-notes { display: block; }

/* ===== Notes row (icon + label + speaker notes) ===== */
.notes-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.notes-row .speaker-notes {
  flex-basis: 100%;
  margin-top: 6px;
}

/* ===== Decorative slide icons — persistent CLI-style spinner ===== */
.slide-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--accent);
  opacity: 0.45;
  cursor: pointer;
  transition: opacity 0.4s, filter 0.4s;
  animation: cli-spin 3s linear infinite;
}
.slide-icon:hover {
  opacity: 1;
  filter: drop-shadow(0 0 8px var(--accent)) drop-shadow(0 0 20px rgba(217,119,87,0.4));
  animation: cli-spin 1.2s linear infinite;
}
.slide-icon svg {
  width: 100%;
  height: 100%;
}

/* Title slide: larger centered icon, static */
#slide-0 .slide-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  opacity: 0.5;
  animation: none;
}
#slide-0 .slide-icon:hover {
  opacity: 1;
  animation: none;
}

@keyframes cli-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ===== Spinner label — cycling funny text ===== */
.spinner-label {
  font-family: var(--font-mono);
  font-size: 13px;
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.7;
  letter-spacing: 0.03em;
  white-space: nowrap;
  transition: opacity 0.3s, color 0.3s;
  animation: label-fade 3s ease-in-out infinite;
  user-select: none;
}
.notes-row:hover .spinner-label {
  opacity: 1;
  color: var(--accent);
}
@keyframes label-fade {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 0.85; }
}

/* ===== Progress bar ===== */
.progress-bar {
  position: fixed;
  bottom: 0; left: 0;
  height: 3px;
  background: var(--accent);
  transition: width 0.35s ease;
  z-index: 100;
}

/* ===== Navigation controls ===== */
.nav-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  align-items: center;
  z-index: 50;
  opacity: 0;
  transition: opacity 0.3s;
}
body:hover .nav-controls,
body:focus-within .nav-controls { opacity: 1; }

.nav-btn {
  background: var(--bg-slide);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  padding: 8px 16px;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px;
  transition: all 0.2s;
}
.nav-btn:hover {
  background: var(--accent-subtle);
  color: var(--accent);
  border-color: var(--border-accent);
}

.nav-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== Title slide special ===== */
#slide-0 .slide-title {
  font-size: clamp(36px, 4vw, 52px);
  text-align: center;
  margin-bottom: 16px;
}
#slide-0 .slide-subtitle {
  text-align: center;
  font-size: 22px;
}
#slide-0 .slide-inner {
  text-align: center;
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .slide-inner { padding: 28px 24px 24px; }
  .slide-content table { font-size: 13px; }
  .slide-content pre { font-size: 12px; padding: 12px; }
}

/* ===== Print / export ===== */
@media print {
  .slide { position: relative; opacity: 1; pointer-events: auto; page-break-after: always; }
  .nav-controls, .progress-bar { display: none; }
  .speaker-notes { display: block; }
}
</style>
</head>
<body>

<div class="deck">
${slidesHtml}
</div>

<div class="progress-bar" id="progress"></div>

<div class="nav-controls">
  <button class="nav-btn" onclick="prev()" title="Previous (Left Arrow)">&larr; Prev</button>
  <span class="nav-hint">Arrow keys &bull; S = notes &bull; L = lang</span>
  <button class="nav-btn" onclick="next()" title="Next (Right Arrow)">Next &rarr;</button>
</div>

<script>
(function() {
  const slides = document.querySelectorAll('.slide');
  const progress = document.getElementById('progress');
  const total = slides.length;
  let current = 0;

  function go(n) {
    if (n < 0 || n >= total) return;
    slides[current].classList.remove('active');
    current = n;
    slides[current].classList.add('active');
    progress.style.width = ((current + 1) / total * 100) + '%';
    window.location.hash = '#slide-' + current;
  }

  window.next = function() { go(current + 1); };
  window.prev = function() { go(current - 1); };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(current + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
    else if (e.key === 's' || e.key === 'S') { document.body.classList.toggle('show-notes'); }
    else if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }
  });

  // Touch swipe support
  let touchStartX = 0;
  document.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].screenX; });
  document.addEventListener('touchend', function(e) {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 50) { diff < 0 ? go(current + 1) : go(current - 1); }
  });

  // Handle hash on load
  if (window.location.hash) {
    const m = window.location.hash.match(/slide-(\\d+)/);
    if (m) go(parseInt(m[1], 10));
  }
  progress.style.width = ((current + 1) / total * 100) + '%';

  // ---- CLI-style spinner labels (EN + RU, toggle with L key) ----
  var wordsEN = [
    'whispering...','noodling...','pondering...','brewing...','scheming...',
    'conjuring...','manifesting...','vibing...','cooking...','daydreaming...',
    'rethinking...','hallucinating...','calibrating...','percolating...','spiraling...',
    'untangling...','assembling...','simmering...','overthinking...','doodling...',
  ];
  var wordsRU = [
    'шепчемся...','котелок варит...','обмозговываем...','заваривается...','мутим схему...',
    'колдуем...','визуализируем...','ловим волну...','стряпаем...','витаем в облаках...',
    'переосмысляем...','галлюцинируем...','калибруем...','просачивается...','закручиваем...',
    'распутываем...','собираем по кусочкам...','томится на медленном...','перемудрили...','рисуем каракули...',
  ];
  // mixed = alternating EN, RU, EN, RU...
  var wordsMixed = [];
  for (var wi = 0; wi < wordsEN.length; wi++) { wordsMixed.push(wordsEN[wi], wordsRU[wi]); }

  var langModes = ['mixed', 'en', 'ru'];
  var langNames = { mixed: 'EN + RU', en: 'English', ru: 'Русский' };
  var langIdx = 0;

  function getActiveWords() {
    var m = langModes[langIdx];
    if (m === 'en') return wordsEN;
    if (m === 'ru') return wordsRU;
    return wordsMixed;
  }

  var labels = document.querySelectorAll('.spinner-label');
  var wordIdx = Math.floor(Math.random() * 20);

  function cycleLabels() {
    var words = getActiveWords();
    var idx = wordIdx % words.length;
    labels.forEach(function(el) {
      el.style.opacity = '0';
      setTimeout(function() {
        el.textContent = words[idx];
        el.style.opacity = '';
      }, 300);
    });
    wordIdx++;
  }
  cycleLabels();
  setInterval(cycleLabels, 3000);

  // L key toggles language
  document.addEventListener('keydown', function(e) {
    if (e.key === 'l' || e.key === 'L') {
      langIdx = (langIdx + 1) % langModes.length;
      wordIdx = 0;
      cycleLabels();
      // brief toast
      var toast = document.createElement('div');
      toast.textContent = langNames[langModes[langIdx]];
      toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1a1c;color:#d97757;border:1px solid rgba(217,119,87,0.3);padding:6px 18px;border-radius:8px;font-size:14px;font-family:var(--font-mono);z-index:999;opacity:0;transition:opacity 0.3s;';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.opacity = '1'; });
      setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 1500);
    }
  });
})();
</script>
</body>
</html>`;

writeFileSync(outputPath, html, 'utf-8');
const name = basename(outputPath);
console.log(`Generated: ${name} (${totalSlides} slides)`);
