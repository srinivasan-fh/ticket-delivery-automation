import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderChecklistMarkdown } from '../scripts/generate-checklist.js';

test('CHECKLIST.md is up to date with src/checklist.js (run `npm run checklist`)', () => {
  assert.equal(readFileSync(new URL('../CHECKLIST.md', import.meta.url), 'utf8'), renderChecklistMarkdown());
});
