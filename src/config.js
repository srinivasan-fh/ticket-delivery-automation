import path from 'node:path';

const PROJECT_KEY = /^[A-Z][A-Z0-9_]+$/;

function list(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function json(value, name) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const projectKeys = list(env.JIRA_PROJECT_KEYS).map((k) => k.toUpperCase());
  const bad = projectKeys.find((k) => !PROJECT_KEY.test(k));
  if (bad) throw new Error(`Invalid Jira project key in JIRA_PROJECT_KEYS: ${bad}`);

  // { "RNMS": { "path": "/code/app", "github": "owner/repo", "sitBranch": "sit", "mainBranch": "main" } }
  const repoMap = json(env.REPO_MAP, 'REPO_MAP');

  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 4600),
    dataDir: path.resolve(cwd, env.DATA_DIR || '.tda'),
    jira: {
      baseUrl: (env.JIRA_BASE_URL || '').replace(/\/+$/, ''),
      email: env.JIRA_EMAIL || '',
      token: env.JIRA_API_TOKEN || '',
      projectKeys,
      boardId: env.JIRA_BOARD_ID || '',
      onlyMine: env.JIRA_ONLY_MINE !== 'false',
      sprintField: env.JIRA_SPRINT_FIELD || 'customfield_10020',
      storyPointsField: env.JIRA_STORY_POINTS_FIELD || 'customfield_10016',
    },
    claude: {
      bin: env.CLAUDE_BIN || 'claude',
      skill: env.CLAUDE_SKILL || 'rn-ticket-delivery',
      designUrl: env.CLAUDE_DESIGN_URL || 'https://claude.ai',
      terminalCmd: env.TERMINAL_CMD || '',
    },
    portal: {
      url: (env.PORTAL_URL || 'http://localhost:5173').replace(/\/+$/, ''),
      apiUrl: (env.PORTAL_API_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, ''),
    },
    repos: {
      defaultPath: env.REPO_PATH || '',
      defaultGithub: env.GITHUB_REPO || '',
      map: repoMap,
    },
    cliqWebhookUrl: env.ZOHO_CLIQ_WEBHOOK_URL || '',
  };
}

// Resolve the local repo + GitHub repo for a Jira project / ticket key.
export function repoFor(config, ticketKey) {
  return repoForProject(config, ticketKey.split('-')[0]);
}

export function repoForProject(config, project) {
  const entry = config.repos.map[project] || {};
  return {
    path: entry.path || config.repos.defaultPath,
    github: entry.github || config.repos.defaultGithub,
    sitBranch: entry.sitBranch || 'sit',
    mainBranch: entry.mainBranch || 'main',
  };
}
