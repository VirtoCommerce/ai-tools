#!/usr/bin/env node

/**
 * Skill Usage Tracker — Claude Code Hook Script
 *
 * Fires on PreToolUse for Skill tool invocations.
 * Appends each invocation to reports/skill-usage-metrics.jsonl.
 *
 * Run `node scripts/skill-usage-report.js` to generate aggregated stats.
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const logFile = join(projectRoot, 'reports', 'skill-usage-metrics.jsonl');

try {
  // Read hook input from stdin
  const input = JSON.parse(readFileSync(0, 'utf-8'));

  const entry = {
    timestamp: new Date().toISOString(),
    sessionId: input.sessionId || null,
    toolName: input.toolName || 'Skill',
    skillName: input.toolInput?.skillName || input.toolInput?.name || 'unknown',
    arguments: input.toolInput?.arguments || null,
    agentName: input.agentName || 'main'
  };

  // Ensure reports directory exists
  mkdirSync(join(projectRoot, 'reports'), { recursive: true });

  appendFileSync(logFile, JSON.stringify(entry) + '\n');
} catch (err) {
  // Hooks must not block the user — fail silently
  process.exit(0);
}
