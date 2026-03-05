#!/usr/bin/env node

/**
 * Skill Usage Report Generator
 *
 * Reads reports/skill-usage-metrics.jsonl and outputs aggregated statistics.
 *
 * Usage:
 *   node scripts/skill-usage-report.js            # All time
 *   node scripts/skill-usage-report.js --days 7   # Last 7 days
 *   node scripts/skill-usage-report.js --days 30  # Last 30 days
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logFile = join(__dirname, '..', 'reports', 'skill-usage-metrics.jsonl');

if (!existsSync(logFile)) {
  console.log('No skill usage data found. Run some skills first!');
  process.exit(0);
}

// Parse args
const daysArg = process.argv.indexOf('--days');
const daysFilter = daysArg !== -1 ? parseInt(process.argv[daysArg + 1]) : null;
const cutoff = daysFilter ? new Date(Date.now() - daysFilter * 86400000) : null;

const lines = readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
const entries = lines.map(line => {
  try { return JSON.parse(line); } catch { return null; }
}).filter(e => e && (!cutoff || new Date(e.timestamp) >= cutoff));

if (entries.length === 0) {
  console.log('No skill usage data in the selected period.');
  process.exit(0);
}

// Aggregate by skill
const bySkill = {};
const byAgent = {};
const byAgentSkill = {};
const byDate = {};

for (const e of entries) {
  const skill = e.skillName || 'unknown';
  const agent = e.agentName || 'main';
  const date = e.timestamp.slice(0, 10);

  bySkill[skill] = (bySkill[skill] || 0) + 1;
  byAgent[agent] = (byAgent[agent] || 0) + 1;
  byDate[date] = (byDate[date] || 0) + 1;

  const key = `${agent} -> ${skill}`;
  byAgentSkill[key] = (byAgentSkill[key] || 0) + 1;
}

const sortDesc = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);

const period = daysFilter ? `Last ${daysFilter} days` : 'All time';
console.log(`\n=== Skill Usage Report (${period}) ===\n`);
console.log(`Total invocations: ${entries.length}`);
console.log(`Period: ${entries[0].timestamp.slice(0, 10)} to ${entries[entries.length - 1].timestamp.slice(0, 10)}\n`);

console.log('--- By Skill ---');
for (const [skill, count] of sortDesc(bySkill)) {
  console.log(`  ${String(count).padStart(4)}x  ${skill}`);
}

console.log('\n--- By Agent ---');
for (const [agent, count] of sortDesc(byAgent)) {
  console.log(`  ${String(count).padStart(4)}x  ${agent}`);
}

console.log('\n--- Agent -> Skill (Top 20) ---');
for (const [pair, count] of sortDesc(byAgentSkill).slice(0, 20)) {
  console.log(`  ${String(count).padStart(4)}x  ${pair}`);
}

console.log('\n--- By Date ---');
for (const [date, count] of Object.entries(byDate).sort()) {
  console.log(`  ${date}  ${count} invocations`);
}

console.log('');
