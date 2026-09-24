import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, repoFor } from '../src/config.js';

test('defaults and trimming', () => {
  const c = loadConfig({ JIRA_BASE_URL: 'https://x.net/', JIRA_PROJECT_KEYS: 'rnms, man', PORTAL_API_URL: 'http://p/api/' }, '/w');
  assert.equal(c.jira.baseUrl, 'https://x.net');
  assert.deepEqual(c.jira.projectKeys, ['RNMS', 'MAN']);
  assert.equal(c.jira.onlyMine, true);
  assert.equal(c.portal.apiUrl, 'http://p/api');
  assert.equal(c.port, 4600);
  assert.equal(c.dataDir, '/w/.tda');
  assert.equal(c.claude.skill, 'rn-ticket-delivery');
  assert.equal(loadConfig({ JIRA_ONLY_MINE: 'false' }).jira.onlyMine, false);
});

test('rejects bad project keys and bad REPO_MAP', () => {
  assert.throws(() => loadConfig({ JIRA_PROJECT_KEYS: 'A) OR 1=1' }), /Invalid Jira project key/);
  assert.throws(() => loadConfig({ REPO_MAP: '{bad' }), /REPO_MAP must be valid JSON/);
});

test('repoFor uses REPO_MAP then defaults', () => {
  const c = loadConfig({ REPO_PATH: '/d', GITHUB_REPO: 'o/d', REPO_MAP: '{"MAN":{"path":"/m","github":"o/m","sitBranch":"develop"}}' });
  assert.deepEqual(repoFor(c, 'MAN-1'), { path: '/m', github: 'o/m', sitBranch: 'develop', mainBranch: 'main' });
  assert.deepEqual(repoFor(c, 'RNMS-1'), { path: '/d', github: 'o/d', sitBranch: 'sit', mainBranch: 'main' });
});
