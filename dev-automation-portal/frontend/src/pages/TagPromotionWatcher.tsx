import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, ToggleButtonGroup, ToggleButton,
  FormControl, InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, Divider, Grid,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { tagPromotionApi } from '../services/api';
import { useStore } from '../store/useStore';

type Repo = 'MS' | 'MSWEB';
type IntervalSeconds = 30 | 60 | 120 | 300;

interface TagPromotion {
  id: number;
  repo: string;
  tag_name: string;
  interval_seconds: number;
  sit_beta_environment_name?: string | null;
  preprod_environment_name?: string | null;
  status: string;
  release_version?: string | null;
  is_simulated: boolean;
  error_message?: string | null;
  poll_count: number;
  created_at: string;
  last_checked_at?: string | null;
  sit_beta_completed_at?: string | null;
  resolved_at?: string | null;
}

const ACTIVE_WATCHER_STORAGE_KEY = 'tagPromotionActiveId';
const STATUS_POLL_INTERVAL_MS = 12000;
const MAX_STATUS_POLLS = 200;

const NON_TERMINAL = ['running', 'found', 'deploying_sit_beta', 'waiting_sit_beta', 'promoting_preprod'];

const INTERVAL_OPTIONS: { value: IntervalSeconds; label: string }[] = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
];

const statusColor = (status: string): 'default' | 'success' | 'error' | 'warning' | 'info' => {
  if (status === 'deployed') return 'success';
  if (status === 'sit_beta_failed' || status === 'preprod_failed' || status === 'timed_out') return 'error';
  if (status === 'stopped') return 'default';
  if (NON_TERMINAL.includes(status) && status !== 'running') return 'warning';
  return 'info';
};

const formatRelativeTime = (iso: string): string => {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
};

const statusLabel: Record<string, string> = {
  running: 'checking octopus',
  found: 'tag found',
  deploying_sit_beta: 'deploying to SIT-β',
  waiting_sit_beta: 'waiting on SIT-β',
  promoting_preprod: 'promoting to preprod',
  deployed: 'deployed',
  sit_beta_failed: 'SIT-β failed',
  preprod_failed: 'preprod failed',
  stopped: 'stopped',
  timed_out: 'timed out',
};

export const TagPromotionWatcher: React.FC = () => {
  const { addNotification } = useStore();

  const [repo, setRepo] = useState<Repo>('MS');
  const [tagName, setTagName] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState<IntervalSeconds>(60);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [activeWatcher, setActiveWatcher] = useState<TagPromotion | null>(null);
  const [recentWatches, setRecentWatches] = useState<TagPromotion[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const pollCountRef = useRef(0);
  const notifiedRef = useRef<number | null>(null);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  };

  const loadRecent = () => {
    tagPromotionApi.list({ limit: 5 }).then(setRecentWatches).catch(() => {});
  };

  useEffect(() => {
    loadRecent();
    const storedId = localStorage.getItem(ACTIVE_WATCHER_STORAGE_KEY);
    if (!storedId) return;
    tagPromotionApi.get(Number(storedId))
      .then((w: TagPromotion) => {
        if (NON_TERMINAL.includes(w.status)) {
          setActiveWatcher(w);
        } else {
          localStorage.removeItem(ACTIVE_WATCHER_STORAGE_KEY);
        }
      })
      .catch(() => localStorage.removeItem(ACTIVE_WATCHER_STORAGE_KEY));
  }, []);

  const notifyTerminal = (w: TagPromotion) => {
    if (notifiedRef.current === w.id) return;
    notifiedRef.current = w.id;

    const title = w.status === 'deployed' ? 'Tag promoted to Pre-Prod'
      : w.status === 'sit_beta_failed' ? 'SIT-β deployment failed'
      : w.status === 'preprod_failed' ? 'Pre-Prod deployment failed'
      : w.status === 'timed_out' ? 'Tag Promotion timed out'
      : 'Tag Promotion stopped';
    const body = w.status === 'deployed'
      ? `${w.tag_name} deployed to ${w.sit_beta_environment_name || 'SIT-β'} then promoted to ${w.preprod_environment_name || 'Pre-Prod'} for ${w.repo}.`
      : w.error_message || `${w.tag_name} (${w.repo})`;

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    addNotification(title, body, w.status === 'deployed' ? 'success' : (w.status === 'stopped' ? 'info' : 'error'));
    loadRecent();
  };

  useEffect(() => {
    if (!activeWatcher || !NON_TERMINAL.includes(activeWatcher.status)) {
      pollCountRef.current = 0;
      return;
    }
    if (pollCountRef.current >= MAX_STATUS_POLLS) return;

    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      tagPromotionApi.get(activeWatcher.id)
        .then((w: TagPromotion) => {
          setActiveWatcher(w);
          if (!NON_TERMINAL.includes(w.status)) {
            localStorage.removeItem(ACTIVE_WATCHER_STORAGE_KEY);
            notifyTerminal(w);
          }
        })
        .catch(() => {});
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWatcher]);

  const handleStart = async () => {
    if (!tagName.trim()) {
      setStartError('Enter the tag name you just created.');
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await requestNotificationPermission();
      }
      const watcher = await tagPromotionApi.start({ repo, tag_name: tagName.trim(), interval_seconds: intervalSeconds });
      notifiedRef.current = null;
      pollCountRef.current = 0;
      setActiveWatcher(watcher);
      localStorage.setItem(ACTIVE_WATCHER_STORAGE_KEY, String(watcher.id));
      loadRecent();
    } catch (err: any) {
      setStartError(err.response?.data?.detail || err.message || 'Failed to start watcher');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!activeWatcher) return;
    const watcher = await tagPromotionApi.stop(activeWatcher.id);
    setActiveWatcher(watcher);
    localStorage.removeItem(ACTIVE_WATCHER_STORAGE_KEY);
    notifyTerminal(watcher);
  };

  const isActive = !!activeWatcher && NON_TERMINAL.includes(activeWatcher.status);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Tag Promotion Watcher
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Enter a release tag (not a SIT/STG tag) - this checks Octopus until it appears as a Release, deploys it to
          SIT-β, and once that succeeds automatically promotes the same release to Pre-Prod.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
          {notificationPermission === 'granted' && (
            <Chip size="small" color="success" variant="outlined" icon={<LucideIcon name="BellRing" size={14} />} label="Desktop notifications enabled" />
          )}
          {notificationPermission === 'denied' && (
            <Chip size="small" color="error" variant="outlined" icon={<LucideIcon name="BellOff" size={14} />} label="Desktop notifications blocked - allow them for this site in your browser settings" />
          )}
          {notificationPermission === 'default' && (
            <Button size="small" variant="text" startIcon={<LucideIcon name="Bell" size={14} />} onClick={requestNotificationPermission}>
              Enable desktop notifications
            </Button>
          )}
        </Box>
      </Box>

      <Grid container spacing={3.5}>
        {/* Form - left column */}
        <Grid item xs={12} md={7}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>1. Repository</Typography>
              <ToggleButtonGroup
                exclusive
                value={repo}
                onChange={(_, v) => v && setRepo(v)}
                disabled={isActive}
              >
                <ToggleButton value="MS">MS</ToggleButton>
                <ToggleButton value="MSWEB">MSWEB</ToggleButton>
              </ToggleButtonGroup>

              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>2. Tag Name</Typography>
              <TextField
                fullWidth
                placeholder="e.g. 0.0.1234 (must not contain SIT or STG)"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                disabled={isActive}
              />

              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>3. Check Interval</Typography>
              <FormControl sx={{ maxWidth: 240 }} disabled={isActive}>
                <InputLabel>Interval</InputLabel>
                <Select
                  label="Interval"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.target.value as IntervalSeconds)}
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {startError && <Alert severity="error">{startError}</Alert>}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                {isActive ? (
                  <Button variant="outlined" color="error" onClick={handleStop} startIcon={<LucideIcon name="Square" />}>
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleStart}
                    disabled={starting}
                    startIcon={starting ? <CircularProgress size={16} /> : <LucideIcon name="Play" />}
                    sx={{ px: 4, fontWeight: 700 }}
                  >
                    {starting ? 'Starting...' : 'Start Watching'}
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Live status + history - right column, sticky so it stays in view while the form scrolls */}
        <Grid item xs={12} md={5}>
          <Box sx={{ position: { md: 'sticky' }, top: { md: 88 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {activeWatcher ? (
              <Card className="glass-panel" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {activeWatcher.repo} — {activeWatcher.tag_name}
                    </Typography>
                    <Chip label={statusLabel[activeWatcher.status] || activeWatcher.status} color={statusColor(activeWatcher.status)} size="small" />
                  </Box>
                  <Divider />

                  {/* Pipeline stage indicator */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label="Found"
                      variant={['found', 'deploying_sit_beta', 'waiting_sit_beta', 'promoting_preprod', 'deployed'].includes(activeWatcher.status) ? 'filled' : 'outlined'}
                      color={['found', 'deploying_sit_beta', 'waiting_sit_beta', 'promoting_preprod', 'deployed'].includes(activeWatcher.status) ? 'success' : 'default'}
                    />
                    <LucideIcon name="ArrowRight" size={14} />
                    <Chip
                      size="small"
                      label="SIT-β"
                      variant={['waiting_sit_beta', 'promoting_preprod', 'deployed'].includes(activeWatcher.status) ? 'filled' : 'outlined'}
                      color={activeWatcher.status === 'sit_beta_failed' ? 'error' : (['waiting_sit_beta', 'promoting_preprod', 'deployed'].includes(activeWatcher.status) ? 'success' : 'default')}
                    />
                    <LucideIcon name="ArrowRight" size={14} />
                    <Chip
                      size="small"
                      label="Pre-Prod"
                      variant={activeWatcher.status === 'deployed' ? 'filled' : 'outlined'}
                      color={activeWatcher.status === 'preprod_failed' ? 'error' : (activeWatcher.status === 'deployed' ? 'success' : 'default')}
                    />
                  </Box>

                  {NON_TERMINAL.includes(activeWatcher.status) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Checked {activeWatcher.poll_count} time{activeWatcher.poll_count === 1 ? '' : 's'}
                      </Typography>
                      {activeWatcher.last_checked_at && (
                        <Chip
                          label={`last run ${formatRelativeTime(activeWatcher.last_checked_at)}`}
                          size="small"
                          variant="outlined"
                          color="info"
                        />
                      )}
                    </Box>
                  )}
                  {activeWatcher.status === 'deployed' && (
                    <Alert severity="success">
                      {activeWatcher.release_version} deployed to {activeWatcher.sit_beta_environment_name || 'SIT-β'}, then promoted to {activeWatcher.preprod_environment_name || 'Pre-Prod'}.
                    </Alert>
                  )}
                  {activeWatcher.status === 'sit_beta_failed' && (
                    <Alert severity="error">{activeWatcher.error_message || 'SIT-β deployment failed.'}</Alert>
                  )}
                  {activeWatcher.status === 'preprod_failed' && (
                    <Alert severity="error">{activeWatcher.error_message || 'Pre-Prod deployment failed after SIT-β succeeded.'}</Alert>
                  )}
                  {activeWatcher.status === 'timed_out' && (
                    <Alert severity="warning">Gave up after 30 minutes without completing the pipeline.</Alert>
                  )}
                  {activeWatcher.is_simulated && (
                    <Alert severity="info">Simulated mode - Octopus isn't configured, so this is a fake demo run.</Alert>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-panel" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No watch running yet - fill in the form and click Start Watching.
                  </Typography>
                </CardContent>
              </Card>
            )}

            {recentWatches.length > 0 && (
              <Card className="glass-panel" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Recent Watches
                  </Typography>
                  {recentWatches.map((w) => (
                    <Box
                      key={w.id}
                      sx={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pr: 1 }}>
                        {w.repo} — {w.tag_name}
                      </Typography>
                      <Chip label={statusLabel[w.status] || w.status} color={statusColor(w.status)} size="small" sx={{ flexShrink: 0 }} />
                    </Box>
                  ))}
                </CardContent>
              </Card>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TagPromotionWatcher;
