import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Button, ToggleButton, ToggleButtonGroup, Chip, Alert, CircularProgress, Link,
  Menu, MenuItem, Card, Divider,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { ticketDeliveryApi } from '../services/api';
import { useStore } from '../store/useStore';

interface Ticket {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string;
  assignee: string;
  story_points: number | null;
  sprint: string;
  url: string | null;
}
interface SavedList { synced_at: string; jql: string; tickets: Ticket[] }
interface StageOption { id: string; label: string }
type Sprint = 'current' | 'next';

// Tickets are kept in this browser for reference - syncing again replaces them.
const STORAGE_KEY = 'ticketDelivery.jiraTickets.v1';

// Sub-tasks (e.g. the "Development" sub-task under each story) are never listed - this also
// cleans lists saved before the Jira search excluded them.
const isSubtask = (t: Ticket) => /sub-?task/i.test(t.type || '');

const loadSaved = (): Partial<Record<Sprint, SavedList>> => {
  try {
    const all: Partial<Record<Sprint, SavedList>> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    for (const list of Object.values(all)) {
      if (list?.tickets) list.tickets = list.tickets.filter((t) => !isSubtask(t));
    }
    return all;
  } catch {
    return {};
  }
};

const save = (all: Partial<Record<Sprint, SavedList>>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked - the list still shows for this visit */
  }
};

export const MyTickets: React.FC = () => {
  const { addNotification } = useStore();
  const [sprint, setSprint] = useState<Sprint>('current');
  const [saved, setSaved] = useState(() => {
    const all = loadSaved();
    save(all); // persist the cleaned list
    return all;
  });
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; key: string } | null>(null);

  useEffect(() => {
    ticketDeliveryApi.getConfig().then((c) => setStages(c.stages || [])).catch(() => undefined);
  }, []);

  const list = saved[sprint];

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await ticketDeliveryApi.getMcpTickets(sprint);
      const tickets = (res.tickets as Ticket[]).filter((t) => !isSubtask(t));
      const next = { ...saved, [sprint]: { synced_at: new Date().toISOString(), jql: res.jql, tickets } };
      setSaved(next);
      save(next);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const openStage = async (key: string, stage: StageOption) => {
    setMenu(null);
    try {
      await ticketDeliveryApi.startStage(key, stage.id, 'launch');
      addNotification('Claude Code opened', `${key} · ${stage.label}`, 'success');
    } catch {
      /* the api interceptor already shows the error */
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 1000 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>My Jira Tickets</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Loaded by Claude Code through its Atlassian MCP and saved in this browser.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={sprint} onChange={(_, v) => v && setSprint(v)}>
          <ToggleButton value="current">Current sprint</ToggleButton>
          <ToggleButton value="next">Next sprint</ToggleButton>
        </ToggleButtonGroup>
        <Button variant="contained" onClick={sync} disabled={syncing}
          startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="RefreshCw" size={16} />}>
          {syncing ? 'Asking Claude Code…' : 'Sync from Jira'}
        </Button>
        {list && !syncing && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Last synced {new Date(list.synced_at).toLocaleString()}
          </Typography>
        )}
        {syncing && <Typography variant="caption" sx={{ color: 'text.secondary' }}>This usually takes 20–60 seconds.</Typography>}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {!list && !syncing && (
        <Alert severity="info">No tickets saved for the {sprint} sprint yet. Click <strong>Sync from Jira</strong>.</Alert>
      )}
      {list && list.tickets.length === 0 && (
        <Alert severity="info">
          Jira returned no tickets for: <Box component="code" sx={{ fontSize: 12 }}>{list.jql}</Box>
        </Alert>
      )}

      {list && list.tickets.length > 0 && (
        <Card variant="outlined">
          {list.tickets.map((t, i) => (
            <React.Fragment key={t.key}>
              {i > 0 && <Divider />}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', px: 2, py: 1.5 }}>
                <Box component={RouterLink} to={`/tickets/${t.key}`}
                  sx={{ flex: '1 1 320px', minWidth: 0, color: 'inherit', textDecoration: 'none', borderRadius: 1, '&:hover .ticket-key': { textDecoration: 'underline' } }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    <Typography className="ticket-key" sx={{ fontWeight: 700, color: 'primary.main' }}>{t.key}</Typography>
                    {t.status && <Chip size="small" label={t.status} />}
                    {t.priority && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t.priority}</Typography>}
                    {t.story_points !== null && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t.story_points} pts</Typography>}
                  </Box>
                  <Typography variant="body2" sx={{ mt: 0.25 }}>{t.summary}</Typography>
                </Box>
                <Button size="small" variant="outlined" disabled={!stages.length}
                  endIcon={<LucideIcon name="ChevronDown" size={14} />}
                  onClick={(e) => setMenu({ anchor: e.currentTarget, key: t.key })}>
                  Open in Claude Code
                </Button>
              </Box>
            </React.Fragment>
          ))}
        </Card>
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {stages.map((s) => <MenuItem key={s.id} onClick={() => menu && openStage(menu.key, s)}>{s.label}</MenuItem>)}
      </Menu>

      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Checklists, PRs, tags and Push to QA: <Link component={RouterLink} to="/jira/ticket-delivery">Ticket Delivery</Link>
        {' · '}Everything else: <Link component={RouterLink} to="/dashboard">All services</Link>
      </Typography>
    </Box>
  );
};

export default MyTickets;
