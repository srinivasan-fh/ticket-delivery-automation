import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortalClient, prMatchesTicket } from '../src/portal.js';

function recorder(respond = () => ({ ok: true, body: {} })) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body && JSON.parse(opts.body) });
    const r = respond(url);
    return { ok: r.ok, status: r.status || 200, json: async () => r.body };
  };
  return { impl, calls };
}
const portal = { apiUrl: 'http://p/api' };

test('prMatchesTicket matches title or branch, not longer keys', () => {
  assert.ok(prMatchesTicket({ title: 'RNMS-12: login' }, 'RNMS-12'));
  assert.ok(prMatchesTicket({ title: 'x', branch: 'feature/rnms-12-login' }, 'RNMS-12'));
  assert.ok(!prMatchesTicket({ title: 'RNMS-123 other', branch: 'b' }, 'RNMS-12'));
  assert.ok(!prMatchesTicket({ title: 'XRNMS-12', branch: '' }, 'RNMS-12'));
});

test('ticketPrs filters the portal PR dashboard', async () => {
  const { impl, calls } = recorder(() => ({ ok: true, body: [{ title: 'RNMS-1 a', branch: 'x' }, { title: 'other', branch: 'y' }] }));
  const prs = await createPortalClient(portal, impl).ticketPrs('org/app', 'RNMS-1');
  assert.equal(prs.length, 1);
  assert.equal(calls[0].url, 'http://p/api/github/repos/org/app/pulls?state=open');
});

test('delivery calls send the portal payloads', async () => {
  const { impl, calls } = recorder();
  const c = createPortalClient(portal, impl);
  await c.requestApproval('https://github.com/org/app/pull/5', 'org/app');
  await c.notifyReviewer('https://github.com/org/app/pull/5');
  await c.suggestTag('org/app', 'sit', 'sit');
  await c.createTag('org/app', 'sit-1.2.3', 'sit');
  await c.pushToQa({ key: 'RNMS-1', url: 'u' }, 'SIT');
  assert.deepEqual(calls.map((x) => [x.method, x.url.replace('http://p/api', '')]), [
    ['POST', '/github/pr/request-approval'],
    ['POST', '/github/pr/notify-reviewer'],
    ['GET', '/github/repos/org/app/tags/suggest?environment=sit&source_branch=sit'],
    ['POST', '/github/tag'],
    ['POST', '/jira/push-to-qa'],
  ]);
  assert.deepEqual(calls[0].body, { pr_url: 'https://github.com/org/app/pull/5', repo: 'app' });
  assert.deepEqual(calls[3].body, { tag_name: 'sit-1.2.3', owner: 'org', repo: 'app', source_branch: 'sit' });
  assert.deepEqual(calls[4].body, { ticket_key: 'RNMS-1', ticket_url: 'u', environment: 'SIT' });
});

test('validation and error surfacing', async () => {
  const { impl } = recorder(() => ({ ok: false, status: 400, body: { detail: 'No merged pull requests' } }));
  const c = createPortalClient(portal, impl);
  await assert.rejects(c.suggestTag('org/app', 'sit', 'sit'), /Portal 400 .*No merged pull requests/);
  await assert.rejects(c.suggestTag('org/app', 'prod', 'x'), /Unknown tag environment/);
  await assert.rejects(c.pushToQa({ key: 'A-1' }, 'UAT'), /Unknown QA environment/);
  await assert.rejects(c.createTag('', 't', 'b'), /No GitHub repo configured/);
});
