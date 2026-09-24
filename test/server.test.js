import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/server.js';

const TOKEN = 'test-token';
let app, base, port, dataDir, calls, repoDir;

const ticket = { key: 'RNMS-1', summary: 'Login', type: 'Story', status: 'To Do', priority: 'High', storyPoints: 2, url: 'https://j/browse/RNMS-1', description: 'AC' };

async function freePort() {
  const s = netServer().listen(0);
  await new Promise((r) => s.once('listening', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

before(async () => {
  port = await freePort();
  dataDir = mkdtempSync(path.join(tmpdir(), 'tda-srv-'));
  repoDir = path.join(dataDir, 'repo');
  mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  calls = [];
  const rec = (name, value) => async (...args) => { calls.push([name, ...args]); return typeof value === 'function' ? value(...args) : value; };
  const config = loadConfig({
    PORT: String(port), DATA_DIR: dataDir, JIRA_BASE_URL: 'https://j', JIRA_API_TOKEN: 't', JIRA_PROJECT_KEYS: 'RNMS',
    REPO_PATH: repoDir, GITHUB_REPO: 'org/app',
  });
  app = createApp({
    config,
    token: TOKEN,
    platform: 'linux',
    store: createStore(path.join(dataDir, 'state.json')),
    jira: {
      myself: rec('myself', { displayName: 'Dev' }),
      sprintTickets: rec('sprintTickets', { jql: 'j', tickets: [ticket] }),
      ticket: rec('ticket', ticket),
    },
    portal: {
      health: rec('portalHealth', { is_jira_configured: true, is_github_configured: false }),
      ticketPrs: rec('ticketPrs', []),
      requestApproval: rec('requestApproval', { ok: 1 }),
      notifyReviewer: rec('notifyReviewer', { ok: 1 }),
      suggestTag: rec('suggestTag', { suggested_tag: 'sit-2', basis: 'b' }),
      createTag: rec('createTag', { ok: 1 }),
      pushToQa: rec('pushToQa', { ok: 1 }),
    },
    exec: rec('exec', '2.0.0 (Claude Code)\n'),
    launch: rec('launch', undefined),
    runHeadless: (opts) => calls.push(['runHeadless', opts]),
  });
  await new Promise((r) => app.listen(port, '127.0.0.1', r));
  base = `http://127.0.0.1:${port}`;
});
after(() => app.close());

const req = (p, { method = 'GET', body, token = TOKEN, headers = {} } = {}) => fetch(base + p, {
  method,
  headers: { 'X-TDA-Token': token, 'Content-Type': 'application/json', ...headers },
  body: body && JSON.stringify(body),
});
const json = async (p, o) => {
  const r = await req(p, o);
  return { status: r.status, body: await r.json() };
};

test('page embeds the token; static files served; api needs token', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /content="test-token"/);
  assert.equal((await fetch(base + '/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(base + '/nope')).status, 404);
  assert.equal((await json('/api/config', { token: 'wrong' })).status, 401);
});

test('rejects non-localhost Host headers (DNS rebinding)', async () => {
  const http = await import('node:http');
  const status = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/', headers: { Host: 'evil.example' } }, (r) => resolve(r.statusCode));
  });
  assert.equal(status, 403);
});

test('config, tickets and health', async () => {
  const cfg = (await json('/api/config')).body;
  assert.equal(cfg.stages.length, 6);
  assert.equal(cfg.skill, 'rn-ticket-delivery');
  assert.equal(cfg.portal.pages.createTag, '/github/create-tag');
  assert.deepEqual((await json('/api/tickets?sprint=next')).body.tickets.map((t) => t.key), ['RNMS-1']);
  assert.ok(calls.some((c) => c[0] === 'sprintTickets' && c[1] === 'next'));
  const health = (await json('/api/health')).body;
  assert.equal(health.jira.ok, true);
  assert.equal(health.claude.detail, '2.0.0 (Claude Code)');
  assert.equal(health.portal.ok, false);
  assert.match(health.portal.detail, /simulated mode for: is_github_configured/);
  assert.equal(health['repo RNMS'].ok, true);
  assert.equal(health.cliq.ok, false);
});

test('checklist toggles validate stage and item', async () => {
  const r = await json('/api/tickets/RNMS-1/checks', { method: 'PUT', body: { stage: 'develop', item: 'tests', done: true } });
  assert.ok(r.body.checks.develop.tests);
  assert.equal((await json('/api/tickets/RNMS-1/checks', { method: 'PUT', body: { stage: 'develop', item: 'zzz', done: true } })).status, 404);
  assert.equal((await json('/api/tickets/RNMS-1/checks', { method: 'PUT', body: { stage: 'zzz', item: 'x' } })).status, 404);
  assert.equal((await json('/api/tickets/bad-key/checks', { method: 'PUT', body: {} })).status, 400);
  assert.equal((await json('/api/access/cc-skill', { method: 'PUT', body: { done: true } })).status, 200);
  assert.equal((await json('/api/access/zzz', { method: 'PUT', body: { done: true } })).status, 404);
  assert.ok((await json('/api/state')).body.access['cc-skill']);
});

test('stage actions write the prompt and launch / run / copy', async () => {
  const copy = (await json('/api/tickets/RNMS-1/stages/develop', { method: 'POST', body: { mode: 'prompt' } })).body;
  assert.equal(copy.launched, false);
  assert.match(readFileSync(copy.promptFile, 'utf8'), /Stage: Develop \+ Unit Tests/);
  assert.ok(copy.command.startsWith(`cd '${repoDir}' && 'claude'`));

  const launched = (await json('/api/tickets/RNMS-1/stages/test', { method: 'POST', body: { mode: 'launch' } })).body;
  assert.equal(launched.launched, true);
  const launch = calls.find((c) => c[0] === 'launch')[1];
  assert.equal(launch.file, 'x-terminal-emulator');
  assert.match(launch.args[3], /'--chrome'/);

  assert.equal((await json('/api/tickets/RNMS-1/stages/develop', { method: 'POST', body: { mode: 'run' } })).status, 400);
  const run = (await json('/api/tickets/RNMS-1/stages/understand', { method: 'POST', body: { mode: 'run' } })).body;
  assert.ok(run.outputFile.endsWith('RNMS-1-understand.md'));
  assert.deepEqual(calls.find((c) => c[0] === 'runHeadless')[1].args, ['--permission-mode', 'plan']);
  assert.equal((await json('/api/tickets/RNMS-1/stages/understand/output')).body.output, null);

  assert.equal((await json('/api/tickets/RNMS-1/stages/develop', { method: 'POST', body: { mode: 'rm' } })).status, 400);
  assert.equal((await json('/api/tickets/RNMS-1/stages/zzz', { method: 'POST', body: { mode: 'prompt' } })).status, 404);
});

test('delivery goes through the portal with validation', async () => {
  assert.deepEqual((await json('/api/tickets/RNMS-1/prs')).body, []);
  assert.equal((await json('/api/tickets/RNMS-1/prs/request-approval', { method: 'POST', body: { prUrl: 'https://github.com/evil/x/pull/1' } })).status, 400);
  assert.equal((await json('/api/tickets/RNMS-1/prs/request-approval', { method: 'POST', body: { prUrl: 'https://github.com/org/app/pull/9' } })).status, 200);
  assert.equal((await json('/api/tickets/RNMS-1/prs/notify-reviewer', { method: 'POST', body: { prUrl: 'https://github.com/org/app/pull/9' } })).status, 200);

  const s = (await json('/api/tickets/RNMS-1/tag/suggest?env=main')).body;
  assert.equal(s.sourceBranch, 'main');
  assert.equal((await json('/api/tickets/RNMS-1/tag/suggest?env=prod')).status, 400);

  assert.equal((await json('/api/tickets/RNMS-1/tag', { method: 'POST', body: { env: 'sit', tagName: 'bad..tag' } })).status, 400);
  assert.equal((await json('/api/tickets/RNMS-1/tag', { method: 'POST', body: { env: 'sit', tagName: '-x' } })).status, 400);
  assert.equal((await json('/api/tickets/RNMS-1/tag', { method: 'POST', body: { env: 'sit', tagName: 'sit-2' } })).status, 200);
  assert.deepEqual(calls.find((c) => c[0] === 'createTag').slice(1), ['org/app', 'sit-2', 'sit']);

  assert.equal((await json('/api/tickets/RNMS-1/push-to-qa', { method: 'POST', body: { environment: 'UAT' } })).status, 400);
  assert.equal((await json('/api/tickets/RNMS-1/push-to-qa', { method: 'POST', body: { environment: 'SIT' } })).status, 200);
  assert.deepEqual(calls.find((c) => c[0] === 'pushToQa').slice(1), [ticket, 'SIT']);

  assert.equal((await json('/api/tickets/RNMS-1/unknown')).status, 404);
  assert.equal((await json('/api/unknown')).status, 404);
});

test('bad JSON body is a 400', async () => {
  const r = await fetch(base + '/api/tickets/RNMS-1/checks', { method: 'PUT', headers: { 'X-TDA-Token': TOKEN }, body: '{x' });
  assert.equal(r.status, 400);
});
