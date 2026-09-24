const TOKEN = document.querySelector('meta[name="tda-token"]').content;
const state = { sprint: 'current', config: null, store: { tickets: {}, access: {} }, tickets: [], open: {} };

// ---------- helpers ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'X-TDA-Token': TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = bad ? 'toast bad' : 'toast';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), bad ? 7000 : 3500);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function portalLink(page, label) {
  return h('a', { class: 'btn', href: state.config.portal.url + state.config.portal.pages[page], target: '_blank', rel: 'noopener' }, label, ' ↗');
}

function checksFor(key, stageId) {
  return state.store.tickets[key]?.checks?.[stageId] || {};
}

// ---------- tickets ----------
async function loadTickets() {
  const list = document.getElementById('tickets');
  const summary = document.getElementById('summary');
  list.replaceChildren(h('div', { class: 'empty' }, 'Loading tickets from Jira…'));
  summary.textContent = '';
  try {
    const [{ jql, tickets }, store] = await Promise.all([api(`/tickets?sprint=${state.sprint}`), api('/state')]);
    state.tickets = tickets;
    state.store = store;
    summary.replaceChildren(
      `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} in the ${state.sprint} sprint`,
      jql ? h('span', {}, ' · ', h('code', {}, jql)) : ' · no sprint found on the board',
    );
    renderTickets();
  } catch (err) {
    list.replaceChildren(h('div', { class: 'error' }, `Could not load tickets: ${err.message}`, h('br'), 'Open “Setup checklist” to check access.'));
  }
}

function renderTickets() {
  const list = document.getElementById('tickets');
  if (!state.tickets.length) return list.replaceChildren(h('div', { class: 'empty' }, 'No tickets in this sprint.'));
  list.replaceChildren(...state.tickets.map(renderCard));
}

function renderCard(t) {
  const openStage = state.open[t.key];
  const card = h('article', { class: 'card', id: `card-${t.key}` },
    h('div', { class: 'card-head' },
      h('div', {},
        h('div', { class: 'meta' },
          h('a', { class: 'key', href: t.url, target: '_blank', rel: 'noopener' }, t.key),
          h('span', { class: 'chip' }, t.type),
          t.priority && h('span', { class: 'chip' }, t.priority),
          t.storyPoints !== null && h('span', { class: 'chip' }, `${t.storyPoints} pts`),
        ),
        h('h3', { class: 'title' }, t.summary),
      ),
      h('div', { class: 'meta' },
        h('span', { class: `chip status-${t.statusCategory}` }, t.status),
        h('span', {}, t.assignee),
      ),
    ),
    h('div', { class: 'pipeline' }, ...state.config.stages.map((s) => {
      const done = Object.keys(checksFor(t.key, s.id)).length;
      const total = s.checklist.length;
      const cls = ['stage', openStage === s.id && 'active', done === total && 'complete'].filter(Boolean).join(' ');
      return h('button', {
        class: cls,
        'aria-expanded': String(openStage === s.id),
        onclick: () => {
          state.open[t.key] = openStage === s.id ? null : s.id;
          rerenderCard(t.key);
        },
      },
      h('span', { class: 'name' }, s.label),
      h('span', { class: 'count' }, done === total ? 'Done' : `${done}/${total}`),
      h('span', { class: 'bar', style: `width:${(done / total) * 100}%` }));
    })),
  );
  if (openStage) card.append(renderPanel(t, state.config.stages.find((s) => s.id === openStage)));
  return card;
}

function rerenderCard(key) {
  const t = state.tickets.find((x) => x.key === key);
  document.getElementById(`card-${key}`).replaceWith(renderCard(t));
}

// ---------- stage panel ----------
function renderPanel(t, stage) {
  const output = h('div');
  const run = (mode) => async (e) => busy(e.currentTarget, async () => {
    const r = await api(`/tickets/${t.key}/stages/${stage.id}`, { method: 'POST', body: { mode } });
    if (mode === 'prompt') {
      await navigator.clipboard.writeText(r.command).catch(() => {});
      output.replaceChildren(h('p', { class: 'hint' }, 'Command copied. Run it in a terminal:'), h('pre', { class: 'cmd' }, r.command));
      toast('Command copied to clipboard');
    } else if (mode === 'launch') {
      toast(`Claude Code opened in a terminal for ${t.key} · ${stage.label}`);
    } else {
      toast('Headless analysis started…');
      pollOutput(t.key, stage.id, output);
    }
  });

  const actions = h('div', { class: 'actions' },
    h('button', { class: 'btn primary', onclick: run('launch') }, 'Open in Claude Code'),
    stage.headless && h('button', { class: 'btn', onclick: run('run') }, 'Run in background'),
    stage.headless && h('button', { class: 'btn', onclick: () => pollOutput(t.key, stage.id, output, true) }, 'Show last result'),
    h('button', { class: 'btn', onclick: run('prompt') }, 'Copy command'),
    stage.id === 'design' && h('a', { class: 'btn', href: state.config.designUrl, target: '_blank', rel: 'noopener' }, 'Open Claude Design ↗'),
  );

  return h('section', { class: 'panel' },
    h('div', {},
      h('h4', {}, stage.label),
      h('p', { class: 'tool' }, `Tool: ${stage.tool} · runs the ${state.config.skill} skill for this phase with the Jira brief and the checklist below`),
    ),
    actions,
    output,
    stage.portal && renderDelivery(t, stage),
    h('div', {}, h('h4', {}, 'Checklist'), renderChecklist(t.key, stage)),
  );
}

async function pollOutput(key, stageId, el, once = false) {
  for (let i = 0; i < (once ? 1 : 360); i++) {
    const { output } = await api(`/tickets/${key}/stages/${stageId}/output`).catch(() => ({ output: null }));
    if (output !== null || once) {
      el.replaceChildren(h('pre', { class: 'cmd' }, output ?? 'No result yet.'));
      if (once || /\n---\nExited with code|\n---\nFailed to start/.test(output)) return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

function renderChecklist(key, stage) {
  const checks = checksFor(key, stage.id);
  return h('ul', { class: 'checklist' }, ...stage.checklist.map((item) => {
    const done = !!checks[item.id];
    return h('li', { class: done ? 'done' : '' },
      h('label', {},
        h('input', {
          type: 'checkbox',
          checked: done,
          onchange: async (e) => {
            try {
              const ticket = await api(`/tickets/${key}/checks`, { method: 'PUT', body: { stage: stage.id, item: item.id, done: e.target.checked } });
              state.store.tickets[key] = ticket;
              rerenderCard(key);
            } catch (err) {
              e.target.checked = !e.target.checked;
              toast(err.message, true);
            }
          },
        }),
        h('span', {}, item.text),
      ));
  }));
}

// ---------- delivery (Dev Automation Portal) ----------
function renderDelivery(t, stage) {
  const env = stage.portal; // 'sit' | 'main'
  const prBox = h('div', { class: 'box' }, h('h4', {}, 'Pull requests'), h('p', { class: 'hint' }, 'Loading open PRs for this ticket…'));
  loadPrs(t, prBox);

  const tagInput = h('input', { placeholder: 'Tag name', 'aria-label': 'Tag name' });
  const basis = h('p', { class: 'hint' }, '');
  const tagBox = h('div', { class: 'box' },
    h('h4', {}, env === 'sit' ? 'SIT tag' : 'Production tag'),
    h('div', { class: 'row' },
      tagInput,
      h('button', {
        class: 'btn',
        onclick: (e) => busy(e.currentTarget, async () => {
          const s = await api(`/tickets/${t.key}/tag/suggest?env=${env}`);
          tagInput.value = s.suggested_tag;
          basis.textContent = `${s.basis} · from branch ${s.sourceBranch}`;
        }),
      }, 'Suggest'),
    ),
    basis,
    h('div', { class: 'row' },
      h('button', {
        class: 'btn primary',
        onclick: (e) => busy(e.currentTarget, async () => {
          const tag = tagInput.value.trim();
          if (!tag) throw new Error('Enter or suggest a tag name first');
          if (!confirm(`Create and push tag "${tag}" for ${t.key}? This cannot be undone from here.`)) return;
          await api(`/tickets/${t.key}/tag`, { method: 'POST', body: { env, tagName: tag } });
          toast(`Tag ${tag} created`);
        }),
      }, 'Create tag'),
      portalLink('createTag', 'Portal'),
      env === 'main' && portalLink('compareTags', 'Compare tags'),
    ),
  );

  const qaSelect = h('select', { 'aria-label': 'QA environment' },
    ...state.config.portal.qaEnvironments.map((q) => h('option', { value: q, selected: (env === 'sit' ? 'SIT' : 'PROD') === q }, q)));
  const qaBox = h('div', { class: 'box' },
    h('h4', {}, env === 'sit' ? 'Push to QA' : 'Release'),
    h('p', { class: 'hint' }, 'Portal moves the ticket, comments, reassigns to QA and notifies on Cliq.'),
    h('div', { class: 'row' },
      qaSelect,
      h('button', {
        class: 'btn primary',
        onclick: (e) => busy(e.currentTarget, async () => {
          if (!confirm(`Push ${t.key} to QA (${qaSelect.value})?`)) return;
          await api(`/tickets/${t.key}/push-to-qa`, { method: 'POST', body: { environment: qaSelect.value } });
          toast(`${t.key} pushed to QA (${qaSelect.value})`);
        }),
      }, 'Push to QA'),
    ),
    env === 'main' && h('div', { class: 'row' }, portalLink('releaseTicket', 'Release ticket'), portalLink('tagPromotion', 'Tag promotion')),
  );

  return h('div', { class: 'delivery' }, prBox, tagBox, qaBox);
}

async function loadPrs(t, box) {
  const head = h('h4', {}, 'Pull requests');
  try {
    const prs = await api(`/tickets/${t.key}/prs`);
    const rows = prs.map((pr) => {
      const act = (path, label) => h('button', {
        class: 'btn',
        onclick: (e) => busy(e.currentTarget, async () => {
          await api(`/tickets/${t.key}/prs/${path}`, { method: 'POST', body: { prUrl: pr.url } });
          toast(`${label}: #${pr.number}`);
        }),
      }, label);
      return h('div', { class: 'pr' },
        h('a', { href: pr.url, target: '_blank', rel: 'noopener' }, `#${pr.number} ${pr.title}`),
        h('span', { class: 'hint' }, `${pr.branch} → ${pr.base} · approvals: ${pr.approvers.length ? pr.approvers.join(', ') : 'none yet'}`),
        h('div', { class: 'row' }, act('request-approval', 'Request approval'), act('notify-reviewer', 'Notify reviewer')),
      );
    });
    box.replaceChildren(head, ...(rows.length ? rows : [h('p', { class: 'hint' }, `No open PR mentions ${t.key} yet.`)]),
      h('div', { class: 'row' }, portalLink('openPrs', 'Open PR dashboard'), portalLink('reviewPr', 'Review a PR')));
  } catch (err) {
    box.replaceChildren(head, h('p', { class: 'hint' }, `Portal unavailable: ${err.message}`), h('div', { class: 'row' }, portalLink('openPrs', 'Open PR dashboard')));
  }
}

// ---------- setup drawer ----------
async function openAccess() {
  const drawer = document.getElementById('access');
  drawer.hidden = false;
  const healthEl = document.getElementById('health');
  healthEl.replaceChildren(h('li', {}, '…', 'checking', ''));
  renderAccessList();
  try {
    const health = await api('/health');
    healthEl.replaceChildren(...Object.entries(health).map(([name, r]) =>
      h('li', {}, h('span', { class: r.ok ? 'ok' : 'bad' }, r.ok ? '✓' : '✕'), h('strong', {}, name), h('span', { class: 'detail' }, r.detail))));
  } catch (err) {
    healthEl.replaceChildren(h('li', {}, h('span', { class: 'bad' }, '✕'), h('strong', {}, 'server'), h('span', { class: 'detail' }, err.message)));
  }
}

function renderAccessList() {
  const el = document.getElementById('access-list');
  el.replaceChildren(...state.config.access.map((group) => h('div', {},
    h('h3', {}, group.group),
    h('ul', { class: 'checklist' }, ...group.items.map((item) => {
      const done = !!state.store.access[item.id];
      return h('li', { class: done ? 'done' : '' }, h('label', {},
        h('input', {
          type: 'checkbox',
          checked: done,
          onchange: async (e) => {
            try {
              state.store.access = await api(`/access/${item.id}`, { method: 'PUT', body: { done: e.target.checked } });
              renderAccessList();
            } catch (err) {
              toast(err.message, true);
            }
          },
        }),
        h('span', {}, item.text)));
    })),
  )));
}

// ---------- boot ----------
document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
  state.sprint = btn.dataset.sprint;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  loadTickets();
}));
document.getElementById('refresh').addEventListener('click', loadTickets);
document.getElementById('open-access').addEventListener('click', openAccess);
document.getElementById('close-access').addEventListener('click', () => (document.getElementById('access').hidden = true));

state.config = await api('/config');
state.store = await api('/state');
loadTickets();
