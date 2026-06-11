'use strict';
const fs = require('fs');
const path = 'regression/suites/Backend/graphql/050b4-graphql-xcart-cross-domain.csv';
let raw = fs.readFileSync(path, 'utf8');

// The GQL-MC-012 row has four consecutive double-quotes where it should have two.
// Replace all quadruple-quote sequences with double-quote sequences in the last row.
const rowStart = raw.lastIndexOf('\r\n"GQL-MC-012",');
if (rowStart === -1) {
  console.error('GQL-MC-012 row not found');
  process.exit(1);
}

const rowContent = raw.substring(rowStart);

// Count four-quote sequences before fix
const fourQuotePat = /""/g;
const rawFourCount = (rowContent.match(/""/g) || []).length;
console.log('Double-quote pair sequences in GQL-MC-012 row before fix: ' + rawFourCount);

// The issue: sequences of 4 consecutive double-quotes should be 2
const fixedRow = rowContent.replace(/""""/g, '""');

const afterFourCount = (fixedRow.match(/""""/g) || []).length;
console.log('Four-quote sequences remaining after fix: ' + afterFourCount);

// Write back
const newRaw = raw.substring(0, rowStart) + fixedRow;
fs.writeFileSync(path, newRaw, 'utf8');
console.log('Written. File length: ' + newRaw.length);

// Verify: parse the fixed row to confirm Steps doesn't have syntax-breaking content
// by checking a sample: storeId: "{{STORE_ID}}" should appear as ""{{STORE_ID}}"" in the raw CSV
const verifyIdx = newRaw.lastIndexOf('GQL-MC-012');
const sample = newRaw.substring(verifyIdx, verifyIdx + 500);
const hasFourQuotes = sample.includes('""""');
console.log('Sample (first 500 chars of row): FOUR-QUOTES PRESENT = ' + hasFourQuotes);
if (!hasFourQuotes) {
  console.log('FIX CONFIRMED: no four-quote sequences in first 500 chars of GQL-MC-012');
} else {
  console.log('WARNING: four-quote sequences still present in row');
}
