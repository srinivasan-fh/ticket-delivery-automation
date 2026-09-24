import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Tabs, Tab, Chip, Button, ButtonBase, CircularProgress, Alert,
  Checkbox, FormControlLabel, LinearProgress, Drawer, IconButton, TextField, MenuItem, Divider, Link,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { githubApi, jiraApi, ticketDeliveryApi, DeliveryMode } from '../services/api';
import { useStore } from '../store/useStore';

interface ChecklistItem { id: string; text: string }
interface Stage {
  id: string;
  label: string;
  tool: string;
  headless: boolean;
  portal: 'sit' | 'main' | null;
  checklist: ChecklistItem[];
}
interface AccessGroup { group: string; items: ChecklistItem[] }
interface DeliveryConfig { stages: Stage[]; access: AccessGroup[]; skill: string; design_url: string }
interface Ticket {
  key: string;
  summary: string;
  status: string;
  status_category: string;
  issue_type: string | null;
  priority: string | null;
  assignee: string;
  story_points: number | null;
  sprint: string | null;
  url: string | null;
}
interface Checks { tickets: Record<string, Record<string, Record<string, string>>>; access: Record<string, string> }
interface RepoInfo { path: string | null; owner: string | null; repo: string | null; sit_branch: string; main_branch: string }
interface PRItem { number: number; title: string; branch: string; base: string; url: string | null; approvers: string[] }
interface QaContact { name: string; email: string }

type Sprint = 'current' | 'next';
const QA_ENVIRONMENTS = ['SIT', 'Pre-Prod', 'PROD'] as const;
type QaEnvironment = typeof QA_ENVIRONMENTS[number];

const errorText = (err: any) => err?.response?.data?.detail || err?.message || 'Request failed';

const statusColor = (category: string): 'success' | 'warning' | 'default' =>
  category === 'done' ? 'success' : category === 'indeterminate' ? 'warning' : 'default';

// PRs are matched to a ticket by its key in the title or branch (e.g. feature/RNMS-101-login).
const prMatchesTicket = (pr: PRItem, key: string) => {
  const re = new RegExp(`(^|[^A-Z0-9])${key}([^0-9]|$)`, 'i');
  return re.test(pr.title || '') || re.test(pr.branch || '');
};

export const TicketDelivery: React.FC = () => {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [sprint, setSprint] = useState<Sprint>('current');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meta, setMeta] = useState<{ source: string; jql: string | null } | null>(null);
  const [checks, setChecks] = useState<Checks>({ tickets: {}, access: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<Record<string, string | null>>({});
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    ticketDeliveryApi.getConfig().then(setConfig).catch((err) => setError(errorText(err)));
  }, []);

  const loadTickets = useCallback(() => {
    setLoading(true);
    setError(null);
    ticketDeliveryApi.getTickets(sprint)
      .then(async (res) => {
        setTickets(res.tickets || []);
        setMeta({ source: res.source, jql: res.jql });
        setChecks(await ticketDeliveryApi.getChecks((res.tickets || []).map((t: Ticket) => t.key)));
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [sprint]);

  useEffect(loadTickets, [loadTickets]);

  const updateStageChecks = (key: string, stage: string, stageChecks: Record<string, string>) =>
    setChecks((prev) => ({ ...prev, tickets: { ...prev.tickets, [key]: { ...(prev.tickets[key] || {}), [stage]: stageChecks } } }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>Ticket Delivery</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Sprint tickets → Claude for each stage → PRs, tags and Push to QA, with a checklist per stage.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<LucideIcon name="RefreshCw" size={16} />} onClick={loadTickets} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outlined" startIcon={<LucideIcon name="ListChecks" size={16} />} onClick={() => setSetupOpen(true)} disabled={!config}>
            Setup checklist
          </Button>
        </Box>
      </Box>

      <Tabs value={sprint} onChange={(_, v) => setSprint(v)}>
        <Tab value="current" label="Current sprint" />
        <Tab value="next" label="Next sprint" />
      </Tabs>

      {meta && !loading && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', color: 'text.secondary' }}>
          <Chip size="small" label={meta.source === 'live' ? 'Live' : 'Simulated'} color={meta.source === 'live' ? 'success' : 'default'} />
          <Typography variant="body2">{tickets.length} ticket{tickets.length === 1 ? '' : 's'}</Typography>
          {meta.jql && <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-word', minWidth: 0 }}>{meta.jql}</Typography>}
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {!loading && !error && tickets.length === 0 && (
        <Alert severity="info">No tickets in the {sprint} sprint{meta?.jql ? '' : ' (no sprint found on the board)'}.</Alert>
      )}

      {!loading && config && tickets.map((t) => (
        <TicketCard
          key={t.key}
          ticket={t}
          config={config}
          checks={checks.tickets[t.key] || {}}
          openStage={openStage[t.key] || null}
          onToggleStage={(id) => setOpenStage((prev) => ({ ...prev, [t.key]: prev[t.key] === id ? null : id }))}
          onChecksChange={(stage, c) => updateStageChecks(t.key, stage, c)}
        />
      ))}

      {config && (
        <SetupDrawer
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          groups={config.access}
          access={checks.access}
          onAccessChange={(access) => setChecks((prev) => ({ ...prev, access }))}
        />
      )}
    </Box>
  );
};

// ---------- ticket card ----------
const TicketCard: React.FC<{
  ticket: Ticket;
  config: DeliveryConfig;
  checks: Record<string, Record<string, string>>;
  openStage: string | null;
  onToggleStage: (id: string) => void;
  onChecksChange: (stage: string, checks: Record<string, string>) => void;
}> = ({ ticket, config, checks, openStage, onToggleStage, onChecksChange }) => {
  const stage = config.stages.find((s) => s.id === openStage);
  return (
    <Card variant="outlined" sx={{ minWidth: 0 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {ticket.url
                ? <Link href={ticket.url} target="_blank" rel="noopener" sx={{ fontWeight: 700 }}>{ticket.key}</Link>
                : <Typography sx={{ fontWeight: 700 }}>{ticket.key}</Typography>}
              {ticket.issue_type && <Chip size="small" variant="outlined" label={ticket.issue_type} />}
              {ticket.priority && <Chip size="small" variant="outlined" label={ticket.priority} />}
              {ticket.story_points !== null && <Chip size="small" variant="outlined" label={`${ticket.story_points} pts`} />}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mt: 0.5 }}>{ticket.summary}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip size="small" label={ticket.status} color={statusColor(ticket.status_category)} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{ticket.assignee}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' } }}>
          {config.stages.map((s) => {
            const done = Object.keys(checks[s.id] || {}).length;
            const total = s.checklist.length;
            const active = openStage === s.id;
            return (
              <ButtonBase
                key={s.id}
                onClick={() => onToggleStage(s.id)}
                aria-expanded={active}
                sx={{
                  display: 'block', textAlign: 'left', p: 1.25, borderRadius: 2, border: 1,
                  borderColor: active ? 'primary.main' : 'divider', bgcolor: active ? 'action.selected' : 'transparent',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.label}</Typography>
                <Typography variant="caption" sx={{ color: done === total ? 'success.main' : 'text.secondary', fontWeight: done === total ? 700 : 400 }}>
                  {done === total ? 'Done' : `${done}/${total}`}
                </Typography>
                <LinearProgress variant="determinate" value={(done / total) * 100} color={done === total ? 'success' : 'primary'} sx={{ mt: 0.75, borderRadius: 1 }} />
              </ButtonBase>
            );
          })}
        </Box>

        {stage && (
          <>
            <Divider />
            <StagePanel key={stage.id} ticket={ticket} stage={stage} config={config} checks={checks[stage.id] || {}} onChecksChange={(c) => onChecksChange(stage.id, c)} />
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ---------- stage panel ----------
const StagePanel: React.FC<{
  ticket: Ticket;
  stage: Stage;
  config: DeliveryConfig;
  checks: Record<string, string>;
  onChecksChange: (checks: Record<string, string>) => void;
}> = ({ ticket, stage, config, checks, onChecksChange }) => {
  const { addNotification } = useStore();
  const [busy, setBusy] = useState<DeliveryMode | 'output' | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const pollOutput = useCallback(async (once: boolean) => {
    for (let i = 0; i < (once ? 1 : 360); i++) {
      const res = await ticketDeliveryApi.getStageOutput(ticket.key, stage.id).catch(() => ({ output: null }));
      if (res.output !== null || once) {
        setOutput(res.output ?? 'No result yet.');
        if (once || /\n---\n(Exited with code|Failed to start)/.test(res.output || '')) return;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }, [ticket.key, stage.id]);

  const start = async (mode: DeliveryMode) => {
    setBusy(mode);
    try {
      const res = await ticketDeliveryApi.startStage(ticket.key, stage.id, mode);
      if (mode === 'prompt') {
        setCommand(res.command);
        await navigator.clipboard?.writeText(res.command).catch(() => undefined);
        addNotification('Command copied', `Run it in a terminal to start ${stage.label} for ${ticket.key}.`, 'info');
      } else if (mode === 'run') {
        setOutput('Running in the background…');
        pollOutput(false);
      }
    } finally {
      setBusy(null);
    }
  };

  // Optimistic: tick immediately, then keep the server's view (or roll back on failure).
  const toggle = (itemId: string, done: boolean) => {
    const previous = checks;
    const next = { ...checks };
    if (done) next[itemId] = new Date().toISOString();
    else delete next[itemId];
    onChecksChange(next);
    ticketDeliveryApi.setCheck({ ticket_key: ticket.key, stage: stage.id, item_id: itemId, done })
      .then((res) => onChecksChange(res.checks))
      .catch(() => onChecksChange(previous));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{stage.label}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {stage.tool} · runs the <code>{config.skill}</code> skill for this phase with the Jira brief and the checklist below.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button variant="contained" onClick={() => start('launch')} disabled={!!busy}
          startIcon={busy === 'launch' ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Terminal" size={16} />}>
          Open in Claude Code
        </Button>
        {stage.headless && (
          <>
            <Button variant="outlined" onClick={() => start('run')} disabled={!!busy} startIcon={<LucideIcon name="Play" size={16} />}>
              Run in background
            </Button>
            <Button variant="outlined" onClick={() => pollOutput(true)} disabled={!!busy}>Show last result</Button>
          </>
        )}
        <Button variant="outlined" onClick={() => start('prompt')} disabled={!!busy} startIcon={<LucideIcon name="Copy" size={16} />}>
          Copy command
        </Button>
        {stage.id === 'design' && (
          <Button variant="outlined" href={config.design_url} target="_blank" rel="noopener" endIcon={<LucideIcon name="ExternalLink" size={14} />}>
            Open Claude Design
          </Button>
        )}
      </Box>

      {(command || output) && (
        <Box component="pre" sx={{
          m: 0, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 320, overflow: 'auto',
        }}>
          {output ?? command}
        </Box>
      )}

      {stage.portal && <DeliveryActions ticket={ticket} env={stage.portal} />}

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Checklist</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {stage.checklist.map((item) => (
            <FormControlLabel
              key={item.id}
              control={<Checkbox size="small" checked={!!checks[item.id]} onChange={(e) => toggle(item.id, e.target.checked)} />}
              label={<Typography variant="body2" sx={checks[item.id] ? { color: 'text.secondary', textDecoration: 'line-through' } : undefined}>{item.text}</Typography>}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
};

// ---------- delivery actions (existing portal features) ----------
const DeliveryActions: React.FC<{ ticket: Ticket; env: 'sit' | 'main' }> = ({ ticket, env }) => {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [prs, setPrs] = useState<PRItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagBasis, setTagBasis] = useState('');
  const [qaEnv, setQaEnv] = useState<QaEnvironment>(env === 'sit' ? 'SIT' : 'PROD');
  const [qaContacts, setQaContacts] = useState<QaContact[]>([]);
  const [qaEmail, setQaEmail] = useState('');

  const branch = repo ? (env === 'sit' ? repo.sit_branch : repo.main_branch) : '';
  const hasGithub = !!(repo?.owner && repo?.repo);

  useEffect(() => {
    ticketDeliveryApi.getRepo(ticket.key).then(setRepo).catch((err) => setRepoError(errorText(err)));
    jiraApi.getQaAssignees().then((list: QaContact[]) => {
      setQaContacts(list || []);
      if (list?.length) setQaEmail(list[0].email);
    }).catch(() => undefined);
  }, [ticket.key]);

  useEffect(() => {
    if (!repo?.owner || !repo?.repo) return;
    githubApi.listPullRequests(repo.owner, repo.repo, 'open')
      .then((list: PRItem[]) => setPrs((list || []).filter((pr) => prMatchesTicket(pr, ticket.key))))
      .catch((err) => setRepoError(errorText(err)));
  }, [repo, ticket.key]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); } catch { /* the api interceptor already shows the error */ } finally { setBusy(null); }
  };

  const suggestTag = () => run('suggest', async () => {
    const s = await githubApi.suggestNextTag(repo!.owner!, repo!.repo!, env, branch);
    setTagName(s.suggested_tag);
    setTagBasis(`${s.basis} · from ${branch}`);
  });

  const createTag = () => {
    const tag = tagName.trim();
    if (!tag || !window.confirm(`Create tag "${tag}" on ${repo!.owner}/${repo!.repo} from ${branch} for ${ticket.key}? This cannot be undone from here.`)) return;
    run('tag', () => githubApi.createTag({ tag_name: tag, owner: repo!.owner!, repo: repo!.repo!, source_branch: branch }));
  };

  const pushToQa = () => {
    if (!window.confirm(`Push ${ticket.key} to QA (${qaEnv})? This moves the ticket, comments, reassigns it and notifies Cliq.`)) return;
    run('qa', () => jiraApi.pushToQa({ ticket_key: ticket.key, ticket_url: ticket.url || ticket.key, environment: qaEnv, assignee_email: qaEmail || undefined }));
  };

  const box = { p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1 } as const;

  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' } }}>
      {repoError && <Alert severity="warning" sx={{ gridColumn: '1 / -1' }}>{repoError}</Alert>}

      <Box sx={box}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Pull requests</Typography>
        {!hasGithub && repo && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Set GITHUB_OWNER / GITHUB_REPO or DELIVERY_REPO_MAP.</Typography>}
        {hasGithub && prs === null && <CircularProgress size={18} />}
        {prs?.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>No open PR mentions {ticket.key} yet.</Typography>}
        {prs?.map((pr) => (
          <Box key={pr.number} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {pr.url ? <Link href={pr.url} target="_blank" rel="noopener" variant="body2">#{pr.number} {pr.title}</Link> : <Typography variant="body2">#{pr.number} {pr.title}</Typography>}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {pr.branch} → {pr.base} · approvals: {pr.approvers.length ? pr.approvers.join(', ') : 'none yet'}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button size="small" variant="outlined" disabled={!pr.url || !!busy} onClick={() => run(`a${pr.number}`, () => githubApi.requestApproval(pr.url!, repo!.repo!))}>Request approval</Button>
              <Button size="small" variant="outlined" disabled={!pr.url || !!busy} onClick={() => run(`r${pr.number}`, () => githubApi.notifyReviewer(pr.url!))}>Notify reviewer</Button>
            </Box>
          </Box>
        ))}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 'auto' }}>
          <Button size="small" component={RouterLink} to="/github/open-pr">Open PR Dashboard</Button>
          <Button size="small" component={RouterLink} to="/github/pr">Review a PR</Button>
        </Box>
      </Box>

      <Box sx={box}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{env === 'sit' ? 'SIT tag' : 'Production tag'}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" fullWidth label="Tag name" value={tagName} onChange={(e) => setTagName(e.target.value)} />
          <Button variant="outlined" onClick={suggestTag} disabled={!hasGithub || !!busy}>Suggest</Button>
        </Box>
        {tagBasis && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tagBasis}</Typography>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" onClick={createTag} disabled={!hasGithub || !tagName.trim() || !!busy}
            startIcon={busy === 'tag' ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Tag" size={16} />}>
            Create tag
          </Button>
          <Button size="small" component={RouterLink} to="/github/create-tag">Create Release Tag</Button>
          {env === 'main' && <Button size="small" component={RouterLink} to="/github/compare-tags">Compare Tags</Button>}
        </Box>
      </Box>

      <Box sx={box}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{env === 'sit' ? 'Push to QA' : 'Release'}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField select size="small" label="Environment" value={qaEnv} onChange={(e) => setQaEnv(e.target.value as QaEnvironment)} sx={{ minWidth: 120 }}>
            {QA_ENVIRONMENTS.map((q) => <MenuItem key={q} value={q}>{q}</MenuItem>)}
          </TextField>
          {qaContacts.length > 0 && (
            <TextField select size="small" fullWidth label="QA assignee" value={qaEmail} onChange={(e) => setQaEmail(e.target.value)}>
              {qaContacts.map((c) => <MenuItem key={c.email} value={c.email}>{c.name}</MenuItem>)}
            </TextField>
          )}
        </Box>
        <Button variant="contained" onClick={pushToQa} disabled={!!busy}
          startIcon={busy === 'qa' ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Rocket" size={16} />}>
          Push to QA
        </Button>
        {env === 'main' && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" component={RouterLink} to="/itsm/release-ticket">Release Ticket</Button>
            <Button size="small" component={RouterLink} to="/devops/tag-promotion">Tag Promotion</Button>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ---------- setup drawer ----------
const SetupDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  groups: AccessGroup[];
  access: Record<string, string>;
  onAccessChange: (access: Record<string, string>) => void;
}> = ({ open, onClose, groups, access, onAccessChange }) => {
  const [health, setHealth] = useState<Record<string, { ok: boolean; detail: string }> | null>(null);

  useEffect(() => {
    if (!open) return;
    setHealth(null);
    ticketDeliveryApi.getHealth().then(setHealth).catch(() => setHealth({}));
  }, [open]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const toggleAccess = (itemId: string, done: boolean) => {
    const previous = access;
    const next = { ...access };
    if (done) next[itemId] = new Date().toISOString();
    else delete next[itemId];
    onAccessChange(next);
    ticketDeliveryApi.setAccess({ item_id: itemId, done }).then(onAccessChange).catch(() => onAccessChange(previous));
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 2.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Setup checklist</Typography>
        <IconButton onClick={onClose} aria-label="Close"><LucideIcon name="X" size={18} /></IconButton>
      </Box>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Live access checks</Typography>
      {!health && <CircularProgress size={18} />}
      {health && Object.entries(health).map(([name, r]) => (
        <Box key={name} sx={{ display: 'grid', gridTemplateColumns: '20px 110px 1fr', gap: 1, mb: 0.75, alignItems: 'start' }}>
          <Box sx={{ color: r.ok ? 'success.main' : 'error.main', pt: '2px' }}><LucideIcon name={r.ok ? 'CheckCircle2' : 'XCircle'} size={16} /></Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>{r.detail}</Typography>
        </Box>
      ))}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>One-time access ({Object.keys(access).length}/{total})</Typography>
      {groups.map((g) => (
        <Box key={g.group} sx={{ mt: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>{g.group}</Typography>
          {g.items.map((item) => (
            <FormControlLabel
              key={item.id}
              sx={{ display: 'flex', alignItems: 'flex-start', mt: 0.5 }}
              control={<Checkbox size="small" sx={{ pt: 0.25 }} checked={!!access[item.id]}
                onChange={(e) => toggleAccess(item.id, e.target.checked)} />}
              label={<Typography variant="body2">{item.text}</Typography>}
            />
          ))}
        </Box>
      ))}
    </Drawer>
  );
};

export default TicketDelivery;
