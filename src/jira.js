export const TICKET_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export function buildJql({ projectKeys, sprintClause, onlyMine }) {
  const parts = [];
  if (projectKeys.length) parts.push(`project in (${projectKeys.map((k) => `"${k}"`).join(', ')})`);
  parts.push(sprintClause);
  if (onlyMine) parts.push('assignee = currentUser()');
  return `${parts.join(' AND ')} ORDER BY rank ASC`;
}

// Atlassian Document Format -> plain text, enough for a prompt brief.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content || []).map(adfToText).join('');
  if (node.type === 'listItem') return `- ${inner.trim()}\n`;
  if (['paragraph', 'heading', 'codeBlock', 'blockquote'].includes(node.type)) return `${inner}\n`;
  return inner;
}

export function createJiraClient(jira, fetchImpl = fetch) {
  const auth = `Basic ${Buffer.from(`${jira.email}:${jira.token}`).toString('base64')}`;

  async function get(path, params = {}) {
    const url = new URL(jira.baseUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jira ${res.status} on ${path}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  function mapIssue(issue) {
    const f = issue.fields || {};
    const sprints = f[jira.sprintField] || [];
    const sprint = sprints.find((s) => s.state === 'active') || sprints.find((s) => s.state === 'future') || sprints[0];
    return {
      key: issue.key,
      summary: f.summary || '',
      status: f.status?.name || '',
      statusCategory: f.status?.statusCategory?.key || '',
      type: f.issuetype?.name || '',
      priority: f.priority?.name || '',
      assignee: f.assignee?.displayName || 'Unassigned',
      storyPoints: f[jira.storyPointsField] ?? null,
      sprint: sprint?.name || '',
      url: `${jira.baseUrl}/browse/${issue.key}`,
    };
  }

  // With a board id we can pin the exact active / next sprint; without one,
  // fall back to Jira's openSprints() / futureSprints() functions.
  async function sprintClause(which) {
    if (!jira.boardId) return which === 'next' ? 'sprint in futureSprints()' : 'sprint in openSprints()';
    const state = which === 'next' ? 'future' : 'active';
    const data = await get(`/rest/agile/1.0/board/${encodeURIComponent(jira.boardId)}/sprint`, { state });
    const sprints = data.values || [];
    if (!sprints.length) return null;
    return which === 'next' ? `sprint = ${Number(sprints[0].id)}` : `sprint in (${sprints.map((s) => Number(s.id)).join(', ')})`;
  }

  return {
    async myself() {
      return get('/rest/api/3/myself');
    },

    async sprintTickets(which) {
      const clause = await sprintClause(which);
      if (!clause) return { jql: null, tickets: [] };
      const jql = buildJql({ projectKeys: jira.projectKeys, sprintClause: clause, onlyMine: jira.onlyMine });
      const fields = ['summary', 'status', 'issuetype', 'priority', 'assignee', jira.sprintField, jira.storyPointsField].join(',');
      const tickets = [];
      let nextPageToken;
      do {
        const page = await get('/rest/api/3/search/jql', { jql, fields, maxResults: 100, nextPageToken });
        tickets.push(...(page.issues || []).map(mapIssue));
        nextPageToken = page.isLast === false ? page.nextPageToken : undefined;
      } while (nextPageToken);
      return { jql, tickets };
    },

    async ticket(key) {
      if (!TICKET_KEY.test(key)) throw new Error(`Invalid ticket key: ${key}`);
      const issue = await get(`/rest/api/3/issue/${key}`, {
        fields: ['summary', 'status', 'issuetype', 'priority', 'assignee', 'description', jira.sprintField, jira.storyPointsField].join(','),
      });
      return { ...mapIssue(issue), description: adfToText(issue.fields?.description).trim() };
    },
  };
}
