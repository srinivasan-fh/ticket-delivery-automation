import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert, Autocomplete,
  Paper, Chip, Divider
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { githubApi } from '../services/api';

interface RepoOption {
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
}

const getStatusColor = (status: string = '') => {
  const s = status.toLowerCase();
  if (s === 'ahead') return 'success';
  if (s === 'behind') return 'warning';
  if (s === 'diverged') return 'error';
  return 'default';
};

export const GithubCompareTags: React.FC = () => {
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [baseTag, setBaseTag] = useState('');
  const [headTag, setHeadTag] = useState('');

  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  React.useEffect(() => {
    setReposLoading(true);
    setReposError(null);
    githubApi.listRepos()
      .then((res: RepoOption[]) => setRepos(res || []))
      .catch((err) => setReposError(err.response?.data?.detail || err.message || 'Failed to load repositories'))
      .finally(() => setReposLoading(false));
  }, []);

  const handleSelectRepo = (repo: RepoOption | null) => {
    setSelectedRepo(repo);
    setBaseTag('');
    setHeadTag('');
    setResult(null);
    setCompareError(null);
    setTagOptions([]);
    if (!repo) return;

    githubApi.listTags(repo.owner, repo.name)
      .then((names: string[]) => setTagOptions(names || []))
      .catch(() => {});
  };

  const canCompare = !!selectedRepo && !!baseTag.trim() && !!headTag.trim() && !comparing;

  const handleCompare = () => {
    if (!selectedRepo || !baseTag.trim() || !headTag.trim()) return;
    setComparing(true);
    setCompareError(null);
    setResult(null);
    githubApi.compareTags({
      base_tag: baseTag.trim(),
      head_tag: headTag.trim(),
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
    })
      .then((res: any) => setResult(res.data || res))
      .catch((err) => setCompareError(err.response?.data?.detail || err.message || 'Failed to compare tags'))
      .finally(() => setComparing(false));
  };

  const commits = result?.commits || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 780 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Compare Tags</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Pick a repo and diff two real tags to review the commit delta.
        </Typography>
      </Box>

      <Paper className="glass-panel" sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Repository</Typography>
          <Autocomplete
            size="small"
            options={repos}
            loading={reposLoading}
            getOptionLabel={(o) => o.full_name}
            isOptionEqualToValue={(o, v) => o.full_name === v.full_name}
            value={selectedRepo}
            onChange={(_, value) => handleSelectRepo(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search repositories..."
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {reposLoading ? <CircularProgress size={14} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          {reposError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>{reposError}</Alert>}
        </Box>

        {selectedRepo && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Autocomplete
                size="small"
                freeSolo
                options={tagOptions}
                value={baseTag}
                onInputChange={(_, value) => setBaseTag(value)}
                sx={{ flexGrow: 1, minWidth: 240 }}
                renderInput={(params) => <TextField {...params} label="Base Tag" />}
              />
              <Autocomplete
                size="small"
                freeSolo
                options={tagOptions}
                value={headTag}
                onInputChange={(_, value) => setHeadTag(value)}
                sx={{ flexGrow: 1, minWidth: 240 }}
                renderInput={(params) => <TextField {...params} label="Head Tag" />}
              />
            </Box>

            <Box>
              <Button
                variant="contained"
                disabled={!canCompare}
                onClick={handleCompare}
                startIcon={comparing ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Diff" size={16} />}
              >
                {comparing ? 'Comparing...' : 'Compare'}
              </Button>
            </Box>

            {compareError && <Alert severity="error" sx={{ borderRadius: 2 }}>{compareError}</Alert>}

            {result && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LucideIcon name="Diff" size={18} /> Comparison Details
                  </Typography>
                  <Chip label={result.status} color={getStatusColor(result.status)} size="small" sx={{ fontWeight: 600, textTransform: 'uppercase' }} />
                </Box>

                <Box sx={{ display: 'flex', gap: 3, p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>COMMITS AHEAD</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>{result.ahead_by}</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>COMMITS BEHIND</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>{result.behind_by}</Typography>
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LucideIcon name="History" size={16} /> Commits delta ({commits.length})
                  </Typography>
                  {commits.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>No commits differ between these tags.</Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {commits.map((c: any, idx: number) => (
                        <Box key={c.sha || idx} sx={{ p: 1.5, bgcolor: '#0b0f19', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Chip label={c.sha ? c.sha.substring(0, 7) : 'commit'} size="small" className="mono-font" sx={{ fontSize: '0.75rem', height: 20, bgcolor: 'rgba(255,255,255,0.05)' }} />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.commit?.message || 'No commit message'}</Typography>
                          </Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            By: <b>{c.commit?.author?.name || 'unknown'}</b>
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </>
        )}
      </Paper>
    </Box>
  );
};

export default GithubCompareTags;
