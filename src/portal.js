// Thin client for the Dev Automation Portal backend
// (https://github.com/anboli-foodhub/dev-automation-portal). The portal owns
// tag conventions, the PR approval/review flow, Push to QA and its Cliq
// notifications; this dashboard only calls it for a given ticket.

export const PORTAL_PAGES = {
  openPrs: '/github/open-pr',
  reviewPr: '/github/pr',
  createTag: '/github/create-tag',
  compareTags: '/github/compare-tags',
  pushToQa: '/service/jira-push-to-qa',
  releaseTicket: '/itsm/release-ticket',
  tagPromotion: '/devops/tag-promotion',
};

export const QA_ENVIRONMENTS = ['SIT', 'Pre-Prod', 'PROD'];
export const TAG_ENVIRONMENTS = ['sit', 'main'];

function splitRepo(github) {
  const [owner, repo] = (github || '').split('/');
  if (!owner || !repo) throw new Error('No GitHub repo configured for this ticket (set GITHUB_REPO or REPO_MAP)');
  return { owner, repo };
}

export function prMatchesTicket(pr, key) {
  const re = new RegExp(`(^|[^A-Z0-9])${key}([^0-9]|$)`, 'i');
  return re.test(pr.title || '') || re.test(pr.branch || '');
}

export function createPortalClient(portal, fetchImpl = fetch) {
  async function call(method, path, body) {
    const res = await fetchImpl(portal.apiUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Portal ${res.status} on ${path}: ${data.detail || JSON.stringify(data).slice(0, 300)}`);
    return data;
  }

  return {
    async health() {
      return call('GET', '/settings');
    },

    async ticketPrs(github, key) {
      const { owner, repo } = splitRepo(github);
      const prs = await call('GET', `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open`);
      return prs.filter((pr) => prMatchesTicket(pr, key));
    },

    async requestApproval(prUrl, github) {
      return call('POST', '/github/pr/request-approval', { pr_url: prUrl, repo: splitRepo(github).repo });
    },

    async notifyReviewer(prUrl) {
      return call('POST', '/github/pr/notify-reviewer', { pr_url: prUrl });
    },

    async suggestTag(github, environment, sourceBranch) {
      if (!TAG_ENVIRONMENTS.includes(environment)) throw new Error(`Unknown tag environment: ${environment}`);
      const { owner, repo } = splitRepo(github);
      const qs = new URLSearchParams({ environment, source_branch: sourceBranch });
      return call('GET', `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags/suggest?${qs}`);
    },

    async createTag(github, tagName, sourceBranch) {
      const { owner, repo } = splitRepo(github);
      return call('POST', '/github/tag', { tag_name: tagName, owner, repo, source_branch: sourceBranch });
    },

    async pushToQa(ticket, environment) {
      if (!QA_ENVIRONMENTS.includes(environment)) throw new Error(`Unknown QA environment: ${environment}`);
      return call('POST', '/jira/push-to-qa', { ticket_key: ticket.key, ticket_url: ticket.url, environment });
    },
  };
}
