import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Breadcrumbs, Link, Button, FormControl, Select, MenuItem,
  CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Tooltip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { devopsApi } from '../services/api';
import { useStore } from '../store/useStore';
import { classifyDeploymentState, getDeploymentVisual } from '../utils/octopusStatus';
import { PINNED_OCTOPUS_PROJECTS } from '../utils/octopusFavorites';

interface ResolvedFavorite {
  id: string;
  name: string;
  groupName: string;
  pinned: boolean;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes safety cap, in case a deployment never reaches a terminal state

interface DeploymentCell {
  state?: string | null;
  version?: string | null;
  completed_time?: string | null;
  is_current: boolean;
}

interface ReleaseRow {
  id: string;
  version: string;
  channel_id: string | null;
  assembled: string | null;
  environments: Record<string, DeploymentCell | null>;
}

interface DashboardResponse {
  project_id: string;
  project_name: string;
  environments: { id: string; name: string }[];
  releases: ReleaseRow[];
}

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const OctopusProjectDashboard: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { starredOctopusProjects } = useStore();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [starredFavorites, setStarredFavorites] = useState<ResolvedFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>('all');
  const [deployingKey, setDeployingKey] = useState<string | null>(null);
  const [redeployTarget, setRedeployTarget] = useState<{ version: string; environmentId: string; environmentName: string } | null>(null);
  const pollCountRef = useRef(0);

  const loadDashboard = (silent = false) => {
    if (!projectId) return Promise.resolve();
    if (!silent) setLoading(true);
    setError(null);
    return devopsApi.getOctopusProjectDashboard(projectId)
      .then((res) => setData(res))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load project dashboard'))
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    pollCountRef.current = 0;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Resolve any search-starred favorites (beyond the hardcoded pins) in the background via the
  // lightweight per-id resolver - avoids pulling the full-space overview just for a few names.
  useEffect(() => {
    const idsToResolve = starredOctopusProjects.filter(
      (id) => !PINNED_OCTOPUS_PROJECTS.some((pin) => pin.id === id)
    );
    if (idsToResolve.length === 0) {
      setStarredFavorites([]);
      return;
    }
    let cancelled = false;
    devopsApi.resolveOctopusProjects(idsToResolve)
      .then((items: { id: string; name: string; group_name: string }[]) => {
        if (cancelled) return;
        setStarredFavorites(items.map((i) => ({ id: i.id, name: i.name, groupName: i.group_name, pinned: false })));
      })
      .catch(() => { if (!cancelled) setStarredFavorites([]); });
    return () => { cancelled = true; };
  }, [starredOctopusProjects]);

  const favoriteProjects = useMemo<ResolvedFavorite[]>(() => [
    ...PINNED_OCTOPUS_PROJECTS.map((p) => ({ id: p.id, name: p.name, groupName: p.groupName, pinned: true })),
    ...starredFavorites,
  ], [starredFavorites]);

  // A deploy/redeploy only queues the task - Octopus's real work (running scripts on the
  // target, health checks, etc.) happens after the API call already returned. Keep silently
  // re-polling while anything is still Queued/Executing so the icon updates on its own
  // instead of requiring a manual page refresh.
  const hasInProgressDeployment = useMemo(() => {
    if (!data) return false;
    return data.releases.some((release) =>
      Object.values(release.environments).some((cell) => cell && classifyDeploymentState(cell.state) === 'progress')
    );
  }, [data]);

  useEffect(() => {
    if (!hasInProgressDeployment) {
      pollCountRef.current = 0;
      return;
    }
    if (pollCountRef.current >= MAX_POLLS) return;

    const timer = setTimeout(() => {
      pollCountRef.current += 1;
      loadDashboard(true);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [hasInProgressDeployment, data]);

  const channels = useMemo(() => {
    const ids = new Set<string>();
    (data?.releases || []).forEach((r) => { if (r.channel_id) ids.add(r.channel_id); });
    return Array.from(ids);
  }, [data]);

  const filteredReleases = useMemo(() => {
    if (!data) return [];
    if (channel === 'all') return data.releases;
    return data.releases.filter((r) => r.channel_id === channel);
  }, [data, channel]);

  const handleDeploy = async (releaseVersion: string, environmentId: string) => {
    if (!projectId) return;
    const key = `${releaseVersion}:${environmentId}`;
    setDeployingKey(key);
    try {
      await devopsApi.deployOctopusRelease({
        project_id: projectId,
        environment_id: environmentId,
        release_version: releaseVersion,
      });
      await loadDashboard(true);
    } catch (err) {
      // Notification already surfaced globally by the axios interceptor in api.ts
    } finally {
      setDeployingKey(null);
    }
  };

  const confirmRedeploy = () => {
    if (!redeployTarget) return;
    handleDeploy(redeployTarget.version, redeployTarget.environmentId);
    setRedeployTarget(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {favoriteProjects.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.6 }}>
            Favorites
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
            {favoriteProjects.map((project) => {
              const isCurrent = project.id === projectId;
              return (
                <Paper
                  key={project.id}
                  onClick={isCurrent ? undefined : () => navigate(`/octopus/${project.id}`)}
                  className="glass-panel"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pl: 1.25,
                    pr: 1,
                    height: 34,
                    borderRadius: 2,
                    cursor: isCurrent ? 'default' : 'pointer',
                    opacity: isCurrent ? 0.7 : 1,
                    borderColor: isCurrent ? 'primary.main' : undefined,
                    transition: 'transform 0.12s ease, border-color 0.12s ease',
                    '&:hover': isCurrent ? undefined : { transform: 'translateY(-1px)', borderColor: 'primary.main' },
                  }}
                >
                  <LucideIcon name="Database" size={14} className="text-blue-400" />
                  <Box sx={{ lineHeight: 1.1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{project.name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block', mt: -0.2 }}>
                      {project.groupName}
                    </Typography>
                  </Box>
                  {isCurrent ? (
                    <Box sx={{ px: 0.6, py: 0.1, borderRadius: '4px', bgcolor: 'rgba(59, 130, 246, 0.15)', color: 'primary.main', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Current
                    </Box>
                  ) : (
                    <Tooltip title={project.pinned ? 'Pinned in code' : 'Starred favorite'}>
                      <Box sx={{ display: 'flex', alignItems: 'center', p: 0.4 }}>
                        <LucideIcon name="Star" size={13} fill="#f59e0b" className="text-amber-500" />
                      </Box>
                    </Tooltip>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      )}

      <Box>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
          <Link component={RouterLink} to="/octopus/browse" underline="hover" color="inherit">
            Projects
          </Link>
          <Typography color="text.primary">{data?.project_name || projectId}</Typography>
        </Breadcrumbs>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {data?.project_name || 'Project Dashboard'}
          </Typography>
          <Tooltip title="Release creation isn't supported in this portal yet">
            <span>
              <Button variant="contained" disabled startIcon={<LucideIcon name="Rocket" size={16} />}>
                Create Release
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <MenuItem value="all">All Channels</MenuItem>
            {channels.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {!loading && !error && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {filteredReleases.length} Release{filteredReleases.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {!loading && !error && data && (
        <TableContainer component={Paper} className="glass-panel" sx={{ borderRadius: 3, overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 260 + data.environments.length * 190 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Release</TableCell>
                {data.environments.map((env) => (
                  <TableCell key={env.id} sx={{ fontWeight: 700, minWidth: 180 }}>{env.name}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredReleases.map((release) => (
                <TableRow key={release.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{release.version}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDate(release.assembled)}</Typography>
                  </TableCell>
                  {data.environments.map((env) => {
                    const cell = release.environments[env.id];
                    const key = `${release.version}:${env.id}`;
                    const isDeploying = deployingKey === key;

                    if (!cell) {
                      return (
                        <TableCell key={env.id}>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={isDeploying}
                            onClick={() => handleDeploy(release.version, env.id)}
                            startIcon={isDeploying ? <CircularProgress size={12} /> : <LucideIcon name="ArrowRightCircle" size={14} />}
                          >
                            {isDeploying ? 'Deploying...' : 'Deploy...'}
                          </Button>
                        </TableCell>
                      );
                    }

                    const visual = getDeploymentVisual(cell.state, cell.is_current);

                    return (
                      <TableCell key={env.id}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: visual.bg, border: visual.border, color: visual.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.2 }}>
                            {visual.kind === 'progress' ? (
                              <CircularProgress size={12} sx={{ color: 'inherit' }} />
                            ) : (
                              <LucideIcon name={visual.icon} size={14} />
                            )}
                          </Box>
                          <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: visual.kind === 'success' && !cell.is_current ? 'text.secondary' : 'text.primary' }}>
                                {cell.version}
                              </Typography>
                              {visual.kind === 'success' && cell.is_current && (
                                <Box sx={{ px: 0.6, py: 0.1, borderRadius: '4px', bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                  Current
                                </Box>
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{formatDate(cell.completed_time)}</Typography>
                          </Box>
                          <Tooltip title={`Redeploy ${cell.version} to ${env.name}`}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={isDeploying}
                                onClick={() => setRedeployTarget({ version: cell.version || release.version, environmentId: env.id, environmentName: env.name })}
                              >
                                {isDeploying ? <CircularProgress size={14} /> : <LucideIcon name="RotateCw" size={14} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {filteredReleases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={data.environments.length + 1} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    No releases found for this channel.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!redeployTarget} onClose={() => setRedeployTarget(null)}>
        <DialogTitle>Redeploy release?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will redeploy version <b>{redeployTarget?.version}</b> to <b>{redeployTarget?.environmentName}</b> again.
            {redeployTarget?.environmentName?.toUpperCase().includes('PROD') && ' This environment looks like production.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRedeployTarget(null)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={confirmRedeploy} startIcon={<LucideIcon name="RotateCw" size={14} />}>
            Redeploy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OctopusProjectDashboard;
