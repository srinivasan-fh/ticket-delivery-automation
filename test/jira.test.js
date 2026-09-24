import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adfToText, buildJql, createJiraClient, TICKET_KEY } from '../src/jira.js';

const jiraCfg = (over = {}) => ({
  baseUrl: 'https://x.atlassian.net', email: 'a@b.c', token: 't', projectKeys: ['RNMS'], boardId: '',
  onlyMine: true, sprintField: 'customfield_10020', storyPointsField: 'customfield_10016', ...over,
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((p) => url.pathname === p);
    if (!key) return { ok: false, status: 404, text: async () => 'nope' };
    const body = typeof routes[key] === 'function' ? routes[key](url) : routes[key];
    return { ok: true, json: async () => body };
  };
  return { impl, calls };
}

const issue = (key, extra = {}) => ({
  key,
  fields: {
    summary: `Summary ${key}`, status: { name: 'To Do', statusCategory: { key: 'new' } }, issuetype: { name: 'Story' },
    priority: { name: 'High' }, assignee: { displayName: 'Dev' }, customfield_10016: 3,
    customfield_10020: [{ name: 'Old', state: 'closed' }, { name: 'Sprint 9', state: 'active' }], ...extra,
  },
});

test('buildJql combines project, sprint and assignee', () => {
  assert.equal(
    buildJql({ projectKeys: ['A', 'B'], sprintClause: 'sprint in openSprints()', onlyMine: true }),
    'project in ("A", "B") AND sprint in openSprints() AND assignee = currentUser() ORDER BY rank ASC',
  );
  assert.equal(buildJql({ projectKeys: [], sprintClause: 'sprint = 1', onlyMine: false }), 'sprint = 1 ORDER BY rank ASC');
});

test('adfToText flattens paragraphs, lists and breaks', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'AC' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
  ] };
  assert.equal(adfToText(doc), 'AC\n- one\na\nb\n');
  assert.equal(adfToText(null), '');
  assert.equal(adfToText('plain'), 'plain');
});

test('TICKET_KEY accepts keys and rejects injection', () => {
  assert.ok(TICKET_KEY.test('RNMS-123'));
  assert.ok(!TICKET_KEY.test('RNMS-1; rm -rf'));
  assert.ok(!TICKET_KEY.test('../etc'));
});

test('sprintTickets without board uses sprint functions and paginates', async () => {
  const pages = [{ issues: [issue('RNMS-1')], isLast: false, nextPageToken: 'p2' }, { issues: [issue('RNMS-2')], isLast: true }];
  const { impl, calls } = fakeFetch({ '/rest/api/3/search/jql': (url) => (url.searchParams.get('nextPageToken') ? pages[1] : pages[0]) });
  const client = createJiraClient(jiraCfg(), impl);
  const { jql, tickets } = await client.sprintTickets('next');
  assert.match(jql, /sprint in futureSprints\(\)/);
  assert.deepEqual(tickets.map((t) => t.key), ['RNMS-1', 'RNMS-2']);
  assert.equal(tickets[0].sprint, 'Sprint 9');
  assert.equal(tickets[0].storyPoints, 3);
  assert.equal(tickets[0].url, 'https://x.atlassian.net/browse/RNMS-1');
  assert.equal(calls.length, 2);
});

test('sprintTickets with board pins the active / next sprint ids', async () => {
  const { impl, calls } = fakeFetch({
    '/rest/agile/1.0/board/7/sprint': (url) => ({ values: url.searchParams.get('state') === 'active' ? [{ id: 11 }, { id: 12 }] : [{ id: 20 }, { id: 21 }] }),
    '/rest/api/3/search/jql': { issues: [], isLast: true },
  });
  const client = createJiraClient(jiraCfg({ boardId: '7' }), impl);
  assert.match((await client.sprintTickets('current')).jql, /sprint in \(11, 12\)/);
  assert.match((await client.sprintTickets('next')).jql, /sprint = 20 /);
  assert.equal(calls.length, 4);
});

test('sprintTickets returns empty when the board has no such sprint', async () => {
  const { impl } = fakeFetch({ '/rest/agile/1.0/board/7/sprint': { values: [] } });
  assert.deepEqual(await createJiraClient(jiraCfg({ boardId: '7' }), impl).sprintTickets('next'), { jql: null, tickets: [] });
});

test('ticket maps description and defaults missing fields', async () => {
  const { impl } = fakeFetch({
    '/rest/api/3/issue/RNMS-5': { key: 'RNMS-5', fields: { summary: 'S', description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] } } },
  });
  const t = await createJiraClient(jiraCfg(), impl).ticket('RNMS-5');
  assert.equal(t.description, 'Body');
  assert.equal(t.assignee, 'Unassigned');
  assert.equal(t.storyPoints, null);
  assert.equal(t.sprint, '');
  await assert.rejects(createJiraClient(jiraCfg(), impl).ticket('bad'), /Invalid ticket key/);
});

test('errors carry status and path; auth header is basic', async () => {
  let seen;
  const client = createJiraClient(jiraCfg(), async (url, opts) => {
    seen = opts.headers.Authorization;
    return { ok: false, status: 401, text: async () => 'Unauthorized' };
  });
  await assert.rejects(client.myself(), /Jira 401 on \/rest\/api\/3\/myself: Unauthorized/);
  assert.equal(seen, `Basic ${Buffer.from('a@b.c:t').toString('base64')}`);
});
