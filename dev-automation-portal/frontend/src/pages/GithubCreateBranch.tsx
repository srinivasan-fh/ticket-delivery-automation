import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert, Autocomplete,
  FormControl, Select, MenuItem, InputLabel, Paper, Chip, Link as MuiLink
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { jiraApi, githubApi } from '../services/api';

type BranchType = 'feature' | 'bugfix' | 'hotfix' | 'develop';

const BRANCH_TYPE_LABELS: Record<BranchType, string> = {
  feature: 'feature',
  bugfix: 'bugfix',
  hotfix: 'hotfix',
  develop: 'develop (epic)',
};

const inferBranchType = (issueType?: string | null): BranchType => {
  const t = (issueType || '').toLowerCase();
  if (t.includes('bug')) return 'bugfix';
  if (t.includes('hotfix')) return 'hotfix';
  if (t.includes('epic')) return 'develop';
  return 'feature';
};

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');

interface RepoOption {
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
}

export const GithubCreateBranch: React.FC = () => {
  const [ticketKey, setTicketKey] = useState('');
  const [fetchingTicket, setFetchingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSummary, setTicketSummary] = useState<string | null>(null);
  const [ticketIssueType, setTicketIssueType] = useState<string | null>(null);

  const [branchType, setBranchType] = useState<BranchType>('feature');
  const [shortDescription, setShortDescription] = useState('');

  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>('');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<{ owner: string; repo: string; branch: string } | null>(null);

  useEffect(() => {
    setReposLoading(true);
    setReposError(null);
    githubApi.listRepos()
      .then((res: RepoOption[]) => setRepos(res || []))
      .catch((err) => setReposError(err.response?.data?.detail || err.message || 'Failed to load repositories'))
      .finally(() => setReposLoading(false));
  }, []);

  const ticketKeyValid = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(ticketKey.trim());

  const fetchTicket = () => {
    const key = ticketKey.trim().toUpperCase();
    if (!ticketKeyValid) {
      setTicketError('Enter a valid JIRA ticket key, e.g. RNMS-1234');
      return;
    }
    setFetchingTicket(true);
    setTicketError(null);
    setCreatedBranch(null);
    jiraApi.getTicket(key)
      .then((res: any) => {
        const data = res.data;
        setTicketSummary(data.summary);
        setTicketIssueType(data.issue_type);
        setBranchType(inferBranchType(data.issue_type));
        setShortDescription(slugify(data.summary || ''));
      })
      .catch((err) => {
        setTicketSummary(null);
        setTicketIssueType(null);
        setTicketError(err.response?.data?.detail || err.message || `Failed to fetch ${key}`);
      })
      .finally(() => setFetchingTicket(false));
  };

  const suggestedBranchName = useMemo(() => {
    const key = ticketKey.trim().toUpperCase();
    if (!key || !shortDescription) return '';
    return `${branchType}/${key}/${shortDescription}`;
  }, [branchType, ticketKey, shortDescription]);

  const handleSelectRepo = (repo: RepoOption | null) => {
    setSelectedRepo(repo);
    setCreatedBranch(null);
    setCreateError(null);
    setSourceBranch(repo?.default_branch || '');
    setBranchOptions(repo ? [repo.default_branch] : []);
    if (!repo) return;

    githubApi.listBranches(repo.owner, repo.name)
      .then((names: string[]) => {
        const merged = Array.from(new Set([repo.default_branch, 'sit', 'develop', ...(names || [])]));
        setBranchOptions(merged);
      })
      .catch(() => {
        // Branch listing is just a convenience seed for the picker - fall back to curated defaults
        setBranchOptions(Array.from(new Set([repo.default_branch, 'sit', 'develop'])));
      });
  };

  const canSubmit = !!selectedRepo && !!sourceBranch && !!suggestedBranchName && !creating;

  const handleCreate = () => {
    if (!selectedRepo || !sourceBranch || !suggestedBranchName) return;
    setCreating(true);
    setCreateError(null);
    setCreatedBranch(null);
    githubApi.createBranch({
      branch_name: suggestedBranchName,
      source_branch: sourceBranch,
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
    })
      .then(() => setCreatedBranch({ owner: selectedRepo.owner, repo: selectedRepo.name, branch: suggestedBranchName }))
      .catch((err) => setCreateError(err.response?.data?.detail || err.message || 'Failed to create branch'))
      .finally(() => setCreating(false));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 780 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Create Branch</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Enter a JIRA ticket to get a suggested branch name, pick a repo and source branch, then create it directly on GitHub.
        </Typography>
      </Box>

      <Paper className="glass-panel" sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>1. JIRA Ticket</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <TextField
              size="small"
              placeholder="e.g. RNMS-1234"
              value={ticketKey}
              onChange={(e) => { setTicketKey(e.target.value); setTicketError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchTicket(); }}
              sx={{ minWidth: 240 }}
            />
            <Button
              variant="outlined"
              onClick={fetchTicket}
              disabled={fetchingTicket || !ticketKey.trim()}
              startIcon={fetchingTicket ? <CircularProgress size={14} /> : <LucideIcon name="Search" size={16} />}
            >
              {fetchingTicket ? 'Fetching...' : 'Fetch'}
            </Button>
          </Box>
          {ticketError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>{ticketError}</Alert>}
          {ticketSummary && !ticketError && (
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={ticketIssueType || 'Task'} size="small" color="info" sx={{ fontWeight: 600 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{ticketSummary}</Typography>
            </Box>
          )}
        </Box>

        {ticketSummary && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Branch Type</InputLabel>
                <Select
                  label="Branch Type"
                  value={branchType}
                  onChange={(e) => setBranchType(e.target.value as BranchType)}
                >
                  {(Object.keys(BRANCH_TYPE_LABELS) as BranchType[]).map((t) => (
                    <MenuItem key={t} value={t}>{BRANCH_TYPE_LABELS[t]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Short Description"
                value={shortDescription}
                onChange={(e) => setShortDescription(slugify(e.target.value))}
                sx={{ flexGrow: 1, minWidth: 240 }}
                helperText="kebab-case, auto-suggested from the ticket summary"
              />
            </Box>

            {suggestedBranchName && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 2, bgcolor: 'rgba(59, 130, 246, 0.08)' }}>
                <LucideIcon name="GitBranch" size={16} className="text-blue-400" />
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{suggestedBranchName}</Typography>
              </Box>
            )}

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>2. Repository</Typography>
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
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>3. Source Branch</Typography>
                <Autocomplete
                  size="small"
                  freeSolo
                  options={branchOptions}
                  value={sourceBranch}
                  onInputChange={(_, value) => setSourceBranch(value)}
                  renderInput={(params) => (
                    <TextField {...params} placeholder="main" />
                  )}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Repo default is <b>{selectedRepo.default_branch}</b>. Type any exact branch name if it's not in the list.
                </Typography>
              </Box>
            )}

            <Box>
              <Button
                variant="contained"
                disabled={!canSubmit}
                onClick={handleCreate}
                startIcon={creating ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="GitBranchPlus" size={16} />}
              >
                {creating ? 'Creating...' : 'Create Branch'}
              </Button>
            </Box>

            {createError && <Alert severity="error" sx={{ borderRadius: 2 }}>{createError}</Alert>}

            {createdBranch && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                Created <b>{createdBranch.branch}</b> on {createdBranch.owner}/{createdBranch.repo}.{' '}
                <MuiLink
                  href={`https://github.com/${createdBranch.owner}/${createdBranch.repo}/tree/${createdBranch.branch}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on GitHub
                </MuiLink>
              </Alert>
            )}
          </>
        )}
      </Paper>
    </Box>
  );
};

export default GithubCreateBranch;
