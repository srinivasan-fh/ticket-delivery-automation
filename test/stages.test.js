import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, buildPrompt, getStage } from '../src/stages.js';
import { ACCESS_CHECKLIST, STAGE_CHECKLISTS } from '../src/checklist.js';

test('every stage has a non-empty checklist with unique ids', () => {
  assert.deepEqual(STAGES.map((s) => s.id), Object.keys(STAGE_CHECKLISTS));
  for (const s of STAGES) {
    assert.ok(s.checklist.length > 0, s.id);
    assert.equal(new Set(s.checklist.map((c) => c.id)).size, s.checklist.length, s.id);
  }
  const accessIds = ACCESS_CHECKLIST.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(new Set(accessIds).size, accessIds.length);
});

test('only understand runs headless; test stage uses Claude in Chrome', () => {
  assert.deepEqual(STAGES.filter((s) => s.headless).map((s) => s.id), ['understand']);
  assert.ok(getStage('test').args.includes('--chrome'));
  assert.equal(getStage('deliver-sit').portal, 'sit');
  assert.equal(getStage('deliver-production').portal, 'main');
  assert.equal(getStage('nope'), undefined);
});

test('buildPrompt includes skill, stage task, checklist and ticket brief', () => {
  const ticket = { key: 'RNMS-1', summary: 'Login', type: 'Story', status: 'To Do', priority: 'High', storyPoints: null, url: 'u', description: 'AC1' };
  const p = buildPrompt(getStage('develop'), ticket, 'rn-ticket-delivery');
  assert.match(p, /^Use the rn-ticket-delivery skill for Jira ticket RNMS-1\. Stage: Develop \+ Unit Tests\./);
  assert.match(p, /- \[ \] Unit tests written/);
  assert.match(p, /Points: -/);
  assert.match(p, /Description:\nAC1\n$/);
  assert.doesNotMatch(buildPrompt(getStage('design'), { ...ticket, description: '' }, 's'), /Description:/);
});
