import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { ACCESS_CHECKLIST } from './checklist.js';
import { repoFor, repoForProject } from './config.js';
import { TICKET_KEY } from './jira.js';
import { STAGES, getStage, buildPrompt } from './stages.js';
import { PORTAL_PAGES, QA_ENVIRONMENTS, TAG_ENVIRONMENTS } from './portal.js';
import { buildShellCommand, terminalInvocation } from './launcher.js';
import { postToCliq } from './cliq.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const STATIC = { '/app.js': 'text/javascript', '/styles.css': 'text/css' };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new HttpError(413, 'Body too large');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

async function settle(fn) {
  try {
    return { ok: true, detail: await fn() };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

/**
 * deps: { config, jira, portal, store, platform, exec(file,args), launch({file,args}), runHeadless(opts) }
 */
export function createApp(deps) {
  const { config, jira, portal, store } = deps;
  const token = deps.token || randomBytes(24).toString('hex');
  const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);

  function requireKey(key) {
    if (!TICKET_KEY.test(key)) throw new HttpError(400, 'Invalid ticket key');
    return key;
  }

  function requireStage(id) {
    const stage = getStage(id);
    if (!stage) throw new HttpError(404, 'Unknown stage');
    return stage;
  }

  function requirePrUrl(key, prUrl) {
    const { github } = repoFor(config, key);
    if (typeof prUrl !== 'string' || !prUrl.startsWith(`https://github.com/${github}/pull/`)) {
      throw new HttpError(400, 'PR URL does not belong to this ticket repo');
    }
    return { prUrl, github };
  }

  async function health() {
    const [jiraCheck, portalCheck, claudeCheck] = await Promise.all([
      settle(async () => {
        if (!config.jira.baseUrl || !config.jira.token) throw new Error('JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN not set');
        const me = await jira.myself();
        return `Signed in as ${me.displayName}`;
      }),
      settle(async () => {
        const s = await portal.health();
        const live = ['is_jira_configured', 'is_github_configured'].filter((k) => !s[k]);
        if (live.length) throw new Error(`Portal reachable but in simulated mode for: ${live.join(', ')}`);
        return `Live at ${config.portal.apiUrl}`;
      }),
      settle(async () => (await deps.exec(config.claude.bin, ['--version'])).trim().split('\n')[0]),
    ]);
    return {
      jira: jiraCheck,
      portal: portalCheck,
      claude: claudeCheck,
      ...Object.fromEntries((config.jira.projectKeys.length ? config.jira.projectKeys : ['default']).map((project) => {
        const repo = repoForProject(config, project);
        const problems = [];
        if (!repo.path || !existsSync(path.join(repo.path, '.git'))) problems.push('local path is not a git repo');
        if (!repo.github) problems.push('GitHub repo not set');
        return [`repo ${project}`, problems.length
          ? { ok: false, detail: `${problems.join('; ')} (REPO_PATH / GITHUB_REPO / REPO_MAP)` }
          : { ok: true, detail: `${repo.path} → ${repo.github}` }];
      })),
      cliq: config.cliqWebhookUrl
        ? { ok: true, detail: 'Webhook configured' }
        : { ok: false, detail: 'Optional: ZOHO_CLIQ_WEBHOOK_URL not set' },
    };
  }

  async function startStage(key, stage, mode) {
    const repo = repoFor(config, key);
    if (!repo.path) throw new HttpError(400, 'No local repo configured for this ticket (REPO_PATH / REPO_MAP)');
    const ticket = await jira.ticket(key);
    const prompt = buildPrompt(stage, ticket, config.claude.skill);

    const dir = path.join(config.dataDir, 'prompts');
    await mkdir(dir, { recursive: true });
    const promptFile = path.join(dir, `${key}-${stage.id}.md`);
    await writeFile(promptFile, prompt);

    const command = buildShellCommand({ repoPath: repo.path, bin: config.claude.bin, args: stage.args, promptFile });
    const result = { command, promptFile, launched: false };

    if (mode === 'launch') {
      const inv = terminalInvocation(deps.platform, command, config.claude.terminalCmd);
      if (!inv) throw new HttpError(400, 'No terminal launcher for this OS; set TERMINAL_CMD or copy the command');
      await deps.launch(inv);
      result.launched = true;
    } else if (mode === 'run') {
      if (!stage.headless) throw new HttpError(400, 'This stage is interactive; launch it in a terminal');
      const runDir = path.join(config.dataDir, 'runs');
      await mkdir(runDir, { recursive: true });
      result.outputFile = path.join(runDir, `${key}-${stage.id}.md`);
      deps.runHeadless({ bin: config.claude.bin, args: stage.args, prompt, cwd: repo.path, outFile: result.outputFile });
      result.launched = true;
    }
    return result;
  }

  async function route(req, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const m = req.method;

    if (m === 'GET' && parts[0] === 'config' && parts.length === 1) {
      return {
        stages: STAGES.map(({ id, label, tool, headless, portal: env, checklist }) => ({ id, label, tool, headless: !!headless, portal: env || null, checklist })),
        access: ACCESS_CHECKLIST,
        portal: { url: config.portal.url, pages: PORTAL_PAGES, qaEnvironments: QA_ENVIRONMENTS, tagEnvironments: TAG_ENVIRONMENTS },
        designUrl: config.claude.designUrl,
        skill: config.claude.skill,
        projectKeys: config.jira.projectKeys,
      };
    }
    if (m === 'GET' && parts[0] === 'health') return health();
    if (m === 'GET' && parts[0] === 'state') return store.all();
    if (m === 'GET' && parts[0] === 'tickets' && parts.length === 1) {
      const sprint = url.searchParams.get('sprint') === 'next' ? 'next' : 'current';
      return jira.sprintTickets(sprint);
    }
    if (m === 'PUT' && parts[0] === 'access' && parts.length === 2) {
      const { done } = await readJson(req);
      if (!ACCESS_CHECKLIST.some((g) => g.items.some((i) => i.id === parts[1]))) throw new HttpError(404, 'Unknown item');
      return store.setAccess(parts[1], !!done);
    }

    if (parts[0] !== 'tickets' || parts.length < 3) throw new HttpError(404, 'Not found');
    const key = requireKey(parts[1]);
    const action = parts.slice(2).join('/');

    if (m === 'PUT' && action === 'checks') {
      const { stage: stageId, item, done } = await readJson(req);
      const stage = requireStage(stageId);
      if (!stage.checklist.some((c) => c.id === item)) throw new HttpError(404, 'Unknown checklist item');
      const ticket = await store.setCheck(key, stage.id, item, !!done);
      const doneCount = Object.keys(ticket.checks[stage.id] || {}).length;
      if (done && doneCount === stage.checklist.length) {
        postToCliq(config.cliqWebhookUrl, `✅ ${key}: ${stage.label} checklist complete`);
      }
      return ticket;
    }
    if (m === 'POST' && parts[2] === 'stages' && parts.length === 4) {
      const { mode } = await readJson(req);
      if (!['launch', 'run', 'prompt'].includes(mode)) throw new HttpError(400, 'mode must be launch, run or prompt');
      return startStage(key, requireStage(parts[3]), mode);
    }
    if (m === 'GET' && parts[2] === 'stages' && parts[4] === 'output') {
      const stage = requireStage(parts[3]);
      try {
        return { output: await readFile(path.join(config.dataDir, 'runs', `${key}-${stage.id}.md`), 'utf8') };
      } catch {
        return { output: null };
      }
    }

    // Delivery: everything below goes through the Dev Automation Portal.
    const repo = repoFor(config, key);
    if (m === 'GET' && action === 'prs') return portal.ticketPrs(repo.github, key);
    if (m === 'POST' && action === 'prs/request-approval') {
      const { prUrl, github } = requirePrUrl(key, (await readJson(req)).prUrl);
      return portal.requestApproval(prUrl, github);
    }
    if (m === 'POST' && action === 'prs/notify-reviewer') {
      const { prUrl } = requirePrUrl(key, (await readJson(req)).prUrl);
      return portal.notifyReviewer(prUrl);
    }
    if (m === 'GET' && action === 'tag/suggest') {
      const env = url.searchParams.get('env');
      if (!TAG_ENVIRONMENTS.includes(env)) throw new HttpError(400, 'env must be sit or main');
      const branch = env === 'sit' ? repo.sitBranch : repo.mainBranch;
      return { ...(await portal.suggestTag(repo.github, env, branch)), sourceBranch: branch };
    }
    if (m === 'POST' && action === 'tag') {
      const { env, tagName } = await readJson(req);
      if (!TAG_ENVIRONMENTS.includes(env)) throw new HttpError(400, 'env must be sit or main');
      if (typeof tagName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(tagName) || tagName.includes('..')) {
        throw new HttpError(400, 'Invalid tag name');
      }
      const branch = env === 'sit' ? repo.sitBranch : repo.mainBranch;
      const res = await portal.createTag(repo.github, tagName, branch);
      postToCliq(config.cliqWebhookUrl, `🏷️ ${key}: tag ${tagName} created on ${repo.github}@${branch}`);
      return res;
    }
    if (m === 'POST' && action === 'push-to-qa') {
      const { environment } = await readJson(req);
      if (!QA_ENVIRONMENTS.includes(environment)) throw new HttpError(400, 'Unknown QA environment');
      const ticket = await jira.ticket(key);
      return portal.pushToQa(ticket, environment);
    }
    throw new HttpError(404, 'Not found');
  }

  return createServer(async (req, res) => {
    try {
      // Only answer to localhost names, which blocks DNS-rebinding attacks.
      if (!allowedHosts.has(req.headers.host)) return send(res, 403, { error: 'Forbidden host' });
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/') {
        const html = await readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
        return send(res, 200, html.replace('__TDA_TOKEN__', token), 'text/html');
      }
      if (req.method === 'GET' && STATIC[url.pathname]) {
        return send(res, 200, await readFile(path.join(PUBLIC_DIR, url.pathname), 'utf8'), STATIC[url.pathname]);
      }
      if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      // Every API call needs the per-run token embedded in the page, so other
      // websites open in the browser cannot trigger launches (CSRF).
      if (req.headers['x-tda-token'] !== token) return send(res, 401, { error: 'Missing or invalid token' });

      send(res, 200, await route(req, url));
    } catch (err) {
      send(res, err.status || 502, { error: err.message });
    }
  });
}
