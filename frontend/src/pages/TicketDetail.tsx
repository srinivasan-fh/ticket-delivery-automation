import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Box, Typography, Chip, Card, CardContent, Button, IconButton, TextField, Link, Alert, Divider, Menu, MenuItem, Tooltip,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { ticketDeliveryApi } from '../services/api';
import { useStore } from '../store/useStore';
import {
  DELIVERY_REPOS, RepoBranches, ReleaseBranch, loadBranches, saveRepoBranches, loadTicketRepos, saveTicketRepos,
} from '../utils/repoBranches';

interface SavedTicket { key: string; summary: string; status: string; type: string; priority: string; url: string | null }
interface StageOption { id: string; label: string }

// Ticket details come from the list My Tickets saved in this browser.
const findSavedTicket = (key: string): SavedTicket | null => {
  try {
    const all = JSON.parse(localStorage.getItem('ticketDelivery.jiraTickets.v1') || '{}') || {};
    for (const list of Object.values(all) as { tickets?: SavedTicket[] }[]) {
      const hit = list?.tickets?.find((t) => t.key === key);
      if (hit) return hit;
    }
  } catch {
    /* fall through */
  }
  return null;
};

export const TicketDetail: React.FC = () => {
  const { key = '' } = useParams();
  const { addNotification } = useStore();
  const ticket = findSavedTicket(key);
  const [branches, setBranches] = useState(loadBranches);
  const [selected, setSelected] = useState<string[]>(() => loadTicketRepos(key));
  const [stages, setStages] = useState<StageOption[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    ticketDeliveryApi.getConfig().then((c) => setStages(c.stages || [])).catch(() => undefined);
  }, []);

  const toggleRepo = (repo: string) => {
    const next = selected.includes(repo) ? selected.filter((r) => r !== repo) : [...selected, repo];
    setSelected(next);
    saveTicketRepos(key, next);
  };

  const updateBranches = (repo: string, value: RepoBranches) => {
    setBranches((prev) => ({ ...prev, [repo]: value }));
    saveRepoBranches(repo, value);
  };

  const openStage = async (stage: StageOption) => {
    setMenuAnchor(null);
    try {
      await ticketDeliveryApi.startStage(key, stage.id, 'launch');
      addNotification('Claude Code opened', `${key} · ${stage.label}`, 'success');
    } catch {
      /* the api interceptor already shows the error */
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 1000 }}>
      <Link component={RouterLink} to="/" underline="hover" variant="body2">← My Tickets</Link>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{key}</Typography>
            {ticket?.status && <Chip size="small" label={ticket.status} />}
            {ticket?.type && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{ticket.type}</Typography>}
            {ticket?.url && (
              <Link href={ticket.url} target="_blank" rel="noopener" variant="body2">Open in Jira ↗</Link>
            )}
          </Box>
          {ticket && <Typography variant="body1" sx={{ mt: 0.5 }}>{ticket.summary}</Typography>}
        </Box>
        <Button variant="contained" disabled={!stages.length} endIcon={<LucideIcon name="ChevronDown" size={14} />}
          onClick={(e) => setMenuAnchor(e.currentTarget)}>
          Open in Claude Code
        </Button>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
          {stages.map((s) => <MenuItem key={s.id} onClick={() => openStage(s)}>{s.label}</MenuItem>)}
        </Menu>
      </Box>

      {!ticket && <Alert severity="info">This ticket isn't in the saved list — sync on My Tickets to see its details.</Alert>}

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Repos for this ticket</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {DELIVERY_REPOS.map((repo) => {
            const on = selected.includes(repo.name);
            return (
              <Chip key={repo.name} label={repo.name} onClick={() => toggleRepo(repo.name)}
                color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                icon={on ? <LucideIcon name="Check" size={14} /> : undefined} />
            );
          })}
        </Box>
        {selected.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            Pick the repos this ticket changes to see their release branches.
          </Typography>
        )}
      </Box>

      {DELIVERY_REPOS.filter((r) => selected.includes(r.name)).map((repo) => (
        <RepoCard key={repo.name} name={repo.name} owner={repo.owner} value={branches[repo.name]}
          onChange={(v) => updateBranches(repo.name, v)} />
      ))}
    </Box>
  );
};

const RepoCard: React.FC<{ name: string; owner: string | null; value: RepoBranches; onChange: (v: RepoBranches) => void }> =
  ({ name, owner, value, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<RepoBranches>(value);

    const startEdit = () => { setDraft(value); setEditing(true); };
    const save = () => {
      const clean = (rows: ReleaseBranch[]) => rows.map((r) => ({ branch: r.branch.trim(), label: r.label.trim() })).filter((r) => r.branch);
      onChange({ prod: clean(draft.prod), sit: clean(draft.sit) });
      setEditing(false);
    };

    return (
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {owner ? <Link href={`https://github.com/${owner}/${name}`} target="_blank" rel="noopener" color="inherit">{name}</Link> : name}
            </Typography>
            {editing
              ? <Box sx={{ display: 'flex', gap: 1 }}><Button size="small" onClick={() => setEditing(false)}>Cancel</Button><Button size="small" variant="contained" onClick={save}>Save</Button></Box>
              : <Button size="small" onClick={startEdit} startIcon={<LucideIcon name="Pencil" size={14} />}>Edit</Button>}
          </Box>
          <Divider />
          {(['prod', 'sit'] as const).map((env) => (
            <Box key={env}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {env === 'prod' ? 'Branch for prod release' : 'Branch for SIT release'}
              </Typography>
              {editing
                ? <BranchEditor rows={draft[env]} onChange={(rows) => setDraft({ ...draft, [env]: rows })} />
                : <BranchList rows={value[env]} />}
            </Box>
          ))}
        </CardContent>
      </Card>
    );
  };

const BranchList: React.FC<{ rows: ReleaseBranch[] }> = ({ rows }) => {
  if (!rows.length) return <Typography variant="body2" sx={{ color: 'text.secondary' }}>Not set — click Edit to add.</Typography>;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {rows.map((r) => (
        <Tooltip key={r.branch} title="Copy branch name">
          <Chip size="small" variant="outlined" onClick={() => navigator.clipboard?.writeText(r.branch).catch(() => undefined)}
            label={<><Box component="span" sx={{ fontFamily: 'monospace' }}>{r.branch}</Box>{r.label && <Box component="span" sx={{ color: 'text.secondary' }}> ({r.label})</Box>}</>} />
        </Tooltip>
      ))}
    </Box>
  );
};

const BranchEditor: React.FC<{ rows: ReleaseBranch[]; onChange: (rows: ReleaseBranch[]) => void }> = ({ rows, onChange }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    {rows.map((r, i) => (
      <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField size="small" label="Branch" value={r.branch} sx={{ flex: 2 }}
          onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, branch: e.target.value } : x)))} />
        <TextField size="small" label="Used for (optional)" value={r.label} sx={{ flex: 1.5 }}
          onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
        <IconButton aria-label="Remove branch" onClick={() => onChange(rows.filter((_, j) => j !== i))}><LucideIcon name="X" size={16} /></IconButton>
      </Box>
    ))}
    <Box><Button size="small" startIcon={<LucideIcon name="Plus" size={14} />} onClick={() => onChange([...rows, { branch: '', label: '' }])}>Add branch</Button></Box>
  </Box>
);

export default TicketDetail;
