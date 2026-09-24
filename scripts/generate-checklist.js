import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ACCESS_CHECKLIST } from '../src/checklist.js';
import { STAGES } from '../src/stages.js';

export function renderChecklistMarkdown() {
  const out = [
    '# Ticket Delivery Checklist',
    '',
    '<!-- Generated from src/checklist.js by `npm run checklist`. Edit that file, not this one. -->',
    '',
    'The dashboard shows these same checklists and saves progress per ticket.',
    '',
    '## 1. One-time setup: access',
    '',
  ];
  for (const group of ACCESS_CHECKLIST) {
    out.push(`### ${group.group}`, '', ...group.items.map((i) => `- [ ] ${i.text}`), '');
  }
  out.push('## 2. Per-ticket delivery', '');
  STAGES.forEach((stage, n) => {
    out.push(`### 2.${n + 1} ${stage.label} (${stage.tool})`, '', ...stage.checklist.map((i) => `- [ ] ${i.text}`), '');
  });
  return `${out.join('\n').trimEnd()}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'CHECKLIST.md');
  writeFileSync(file, renderChecklistMarkdown());
  console.log(`Wrote ${file}`);
}
