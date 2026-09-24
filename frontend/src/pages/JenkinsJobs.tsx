import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, CircularProgress, Alert,
  Breadcrumbs, Link, List, ListItemButton, ListItemIcon, ListItemText, Chip, IconButton, Tooltip, Paper
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { devopsApi } from '../services/api';

interface JenkinsItem {
  name: string;
  url: string;
  is_folder: boolean;
  status: string | null;
  last_build_number: number | null;
  last_build_time: string | null;
  in_queue: boolean;
}

interface JenkinsTreeResponse {
  path: string;
  breadcrumbs: string[];
  items: JenkinsItem[];
}

const STATUS_VISUAL: Record<string, { icon: string; color: string }> = {
  SUCCESS: { icon: 'CheckCircle2', color: '#10b981' },
  FAILURE: { icon: 'XCircle', color: '#ef4444' },
  UNSTABLE: { icon: 'AlertTriangle', color: '#f59e0b' },
  BUILDING: { icon: 'Loader', color: '#3b82f6' },
  ABORTED: { icon: 'CircleSlash', color: '#94a3b8' },
  IDLE: { icon: 'Circle', color: '#94a3b8' },
  UNKNOWN: { icon: 'HelpCircle', color: '#94a3b8' },
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const JenkinsJobs: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') || '';

  const [data, setData] = useState<JenkinsTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearch('');
    devopsApi.getJenkinsTree(path || undefined)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || err.message || 'Failed to load Jenkins jobs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  const navigateToPath = (newPath: string) => {
    if (newPath) setSearchParams({ path: newPath });
    else setSearchParams({});
  };

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.items;
    return data.items.filter((i) => i.name.toLowerCase().includes(term));
  }, [data, search]);

  const folders = filteredItems.filter((i) => i.is_folder);
  const jobs = filteredItems.filter((i) => !i.is_folder);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Jenkins Jobs Panel</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Browse Jenkins job folders and build statuses. Read-only - no trigger/rebuild access.
        </Typography>
      </Box>

      <Breadcrumbs aria-label="breadcrumb">
        <Link component="button" underline="hover" color={path ? 'inherit' : 'text.primary'} onClick={() => navigateToPath('')}>
          Jenkins
        </Link>
        {data?.breadcrumbs.map((crumb, idx) => {
          const crumbPath = data.breadcrumbs.slice(0, idx + 1).join('/');
          const isLast = idx === data.breadcrumbs.length - 1;
          return (
            <Link
              key={crumbPath}
              component="button"
              underline="hover"
              color={isLast ? 'text.primary' : 'inherit'}
              onClick={() => navigateToPath(crumbPath)}
            >
              {crumb}
            </Link>
          );
        })}
      </Breadcrumbs>

      <TextField
        placeholder="Find folders or jobs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ minWidth: 320, bgcolor: 'background.paper', borderRadius: 2, alignSelf: 'flex-start' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <LucideIcon name="Search" size={16} className="text-slate-400" />
            </InputAdornment>
          ),
        }}
      />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {!loading && !error && filteredItems.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">No folders or jobs found here.</Typography>
        </Box>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <Paper className="glass-panel" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <List disablePadding>
            {folders.map((item) => (
              <ListItemButton key={item.name} onClick={() => navigateToPath(path ? `${path}/${item.name}` : item.name)} divider>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <LucideIcon name="Folder" size={18} className="text-amber-400" />
                </ListItemIcon>
                <ListItemText primary={item.name} />
                <LucideIcon name="ChevronRight" size={16} className="text-slate-500" />
              </ListItemButton>
            ))}
            {jobs.map((item) => {
              const visual = STATUS_VISUAL[item.status || 'UNKNOWN'] || STATUS_VISUAL.UNKNOWN;
              return (
                <ListItemButton
                  key={item.name}
                  onClick={() => item.url && window.open(item.url, '_blank', 'noreferrer')}
                  divider
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {item.in_queue || item.status === 'BUILDING' ? (
                      <CircularProgress size={16} sx={{ color: visual.color }} />
                    ) : (
                      <LucideIcon name={visual.icon} size={18} style={{ color: visual.color }} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    secondary={item.last_build_number ? `Build #${item.last_build_number} · ${formatDate(item.last_build_time)}` : 'No builds yet'}
                  />
                  {item.in_queue && <Chip label="Queued" size="small" color="warning" sx={{ mr: 1, fontWeight: 700 }} />}
                  <Tooltip title="Open in Jenkins">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); item.url && window.open(item.url, '_blank', 'noreferrer'); }}>
                      <LucideIcon name="ExternalLink" size={15} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default JenkinsJobs;
