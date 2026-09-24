import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, CircularProgress, Alert,
  Accordion, AccordionSummary, AccordionDetails, Chip, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { devopsApi } from '../services/api';
import { useStore } from '../store/useStore';
import { getDeploymentVisual } from '../utils/octopusStatus';
import { PINNED_OCTOPUS_PROJECTS } from '../utils/octopusFavorites';

interface DeploymentCell {
  state?: string | null;
  version?: string | null;
  completed_time?: string | null;
  is_current: boolean;
}

interface ProjectRow {
  id: string;
  name: string;
  project_group_id: string;
  environments: Record<string, DeploymentCell | null>;
}

interface ProjectGroupSection {
  id: string;
  name: string;
  environment_ids: string[];
  projects: ProjectRow[];
}

interface OverviewResponse {
  project_groups: ProjectGroupSection[];
  environments: { id: string; name: string; status: string }[];
}

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const StatusCell: React.FC<{ cell: DeploymentCell | null | undefined }> = ({ cell }) => {
  if (!cell) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <LucideIcon name="CircleSlash" size={16} />
        <Typography variant="caption">No Data</Typography>
      </Box>
    );
  }

  const visual = getDeploymentVisual(cell.state, cell.is_current);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: visual.bg, border: visual.border, color: visual.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.2 }}>
        {visual.kind === 'progress' ? (
          <CircularProgress size={12} sx={{ color: 'inherit' }} />
        ) : (
          <LucideIcon name={visual.icon} size={14} />
        )}
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{cell.version}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{formatDate(cell.completed_time)}</Typography>
      </Box>
    </Box>
  );
};

export const OctopusProjects: React.FC = () => {
  const navigate = useNavigate();
  const { starredOctopusProjects, toggleStarredOctopusProject } = useStore();

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    devopsApi.getOctopusOverview()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || err.message || 'Failed to load Octopus projects'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const envNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.environments || []).forEach((e) => { map[e.id] = e.name; });
    return map;
  }, [data]);

  const filteredGroups = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    // Groups only ever appear as a result of an active search - the idle landing view is favorites-only.
    if (!term) return [];

    return data.project_groups
      .map((group) => {
        const groupMatches = group.name.toLowerCase().includes(term);
        if (groupMatches) return group;
        const projects = group.projects.filter((p) => p.name.toLowerCase().includes(term));
        return projects.length > 0 ? { ...group, projects } : null;
      })
      .filter((g): g is ProjectGroupSection => !!g);
  }, [data, search]);

  const totalProjects = data?.project_groups.reduce((sum, g) => sum + g.projects.length, 0) || 0;

  // Hardcoded pins render immediately, independent of the overview fetch; user-starred
  // projects resolve to a name/group once that data arrives and are appended after.
  const pinnedFavorites = useMemo(
    () => PINNED_OCTOPUS_PROJECTS.map((p) => ({ id: p.id, name: p.name, groupName: p.groupName, pinned: true as const })),
    []
  );

  const starredFavorites = useMemo(() => {
    if (!data || starredOctopusProjects.length === 0) return [];
    const allProjects = data.project_groups.flatMap((g) =>
      g.projects.map((p) => ({ ...p, groupName: g.name }))
    );
    const byId: Record<string, typeof allProjects[number]> = {};
    allProjects.forEach((p) => { byId[p.id] = p; });
    return starredOctopusProjects
      .filter((id) => !PINNED_OCTOPUS_PROJECTS.some((pin) => pin.id === id))
      .map((id) => byId[id])
      .filter((p): p is typeof allProjects[number] => !!p)
      .map((p) => ({ ...p, pinned: false as const }));
  }, [data, starredOctopusProjects]);

  const favoriteProjects = useMemo(() => [...pinnedFavorites, ...starredFavorites], [pinnedFavorites, starredFavorites]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Projects</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Octopus Deploy project groups, environments, and latest deployment status.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          placeholder="Find projects or project groups"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ minWidth: 320, bgcolor: 'background.paper', borderRadius: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LucideIcon name="Search" size={16} className="text-slate-400" />
              </InputAdornment>
            ),
          }}
        />
        {!loading && !error && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {totalProjects} Project{totalProjects !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      {favoriteProjects.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.6 }}>
            Favorites
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
            {favoriteProjects.map((project) => (
              <Paper
                key={project.id}
                onClick={() => navigate(`/octopus/${project.id}`)}
                className="glass-panel"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  pl: 1.25,
                  pr: 0.75,
                  height: 34,
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'transform 0.12s ease, border-color 0.12s ease',
                  '&:hover': { transform: 'translateY(-1px)', borderColor: 'primary.main' },
                }}
              >
                <LucideIcon name="Database" size={14} className="text-blue-400" />
                <Box sx={{ lineHeight: 1.1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>{project.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block', mt: -0.2 }}>
                    {project.groupName}
                  </Typography>
                </Box>
                {project.pinned ? (
                  <Tooltip title="Pinned in code">
                    <Box sx={{ display: 'flex', alignItems: 'center', p: 0.4 }}>
                      <LucideIcon name="Star" size={13} fill="#f59e0b" className="text-amber-500" />
                    </Box>
                  </Tooltip>
                ) : (
                  <Tooltip title="Unpin project">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); toggleStarredOctopusProject(project.id); }}
                      sx={{ p: 0.4 }}
                    >
                      <LucideIcon name="Star" size={13} fill="#f59e0b" className="text-amber-500" />
                    </IconButton>
                  </Tooltip>
                )}
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {!loading && !error && !search.trim() && favoriteProjects.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">
            No favorite projects yet. Search for a project above and click its star to pin it here.
          </Typography>
        </Box>
      )}

      {!loading && !error && search.trim() && filteredGroups.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">No projects or project groups match your search.</Typography>
        </Box>
      )}

      {!loading && !error && search.trim() && filteredGroups.map((group) => (
        <Accordion key={group.id} defaultExpanded className="glass-panel" sx={{ borderRadius: 3, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<LucideIcon name="ChevronDown" size={18} />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{group.name}</Typography>
              <Chip label={group.projects.length} size="small" sx={{ fontWeight: 700, height: 22 }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 400 + group.environment_ids.length * 180 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, minWidth: 240 }}>Project</TableCell>
                    {group.environment_ids.map((envId) => (
                      <TableCell key={envId} sx={{ fontWeight: 700, minWidth: 160 }}>
                        {envNameById[envId] || envId}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.projects.map((project) => {
                    const isStarred = starredOctopusProjects.includes(project.id);
                    return (
                      <TableRow
                        key={project.id}
                        hover
                        onClick={() => navigate(`/octopus/${project.id}`)}
                        sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Tooltip title={isStarred ? 'Unpin project' : 'Pin project'}>
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); toggleStarredOctopusProject(project.id); }}
                              >
                                <LucideIcon name="Star" size={16} fill={isStarred ? '#f59e0b' : 'none'} className={isStarred ? 'text-amber-500' : 'text-slate-400'} />
                              </IconButton>
                            </Tooltip>
                            <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: 'rgba(59, 130, 246, 0.1)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <LucideIcon name="Database" size={16} />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{project.name}</Typography>
                          </Box>
                        </TableCell>
                        {group.environment_ids.map((envId) => (
                          <TableCell key={envId}>
                            <StatusCell cell={project.environments[envId]} />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default OctopusProjects;
