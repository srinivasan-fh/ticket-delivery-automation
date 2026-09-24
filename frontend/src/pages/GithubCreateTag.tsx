import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, CircularProgress, Alert, Autocomplete,
  Paper, ToggleButtonGroup, ToggleButton, Link as MuiLink, Collapse,
  Checkbox, FormControlLabel
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { githubApi } from '../services/api';

type Environment = 'sit' | 'main';

interface RepoOption {
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
}

// Release tags are only ever cut for these two repos - hardcoded so the picker renders
// instantly as toggle buttons instead of waiting on and searching the full org repo list.
const ALLOWED_REPOS: RepoOption[] = [
  { owner: 'uktech', name: 'mytakeaway2.0', full_name: 'uktech/mytakeaway2.0', default_branch: 'main' },
  { owner: 'uktech', name: 'BOB-CRM', full_name: 'uktech/BOB-CRM', default_branch: 'main' },
];

// Label-left / control-right row, used consistently for every field on this page.
const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, width: 180, flexShrink: 0, pt: 1 }}>
      {label}
    </Typography>
    <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
  </Box>
);

export const GithubCreateTag: React.FC = () => {
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  const [environment, setEnvironment] = useState<Environment>('sit');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [sourceBranch, setSourceBranch] = useState<string>('');

  const [tagName, setTagName] = useState('');
  const [suggestionBasis, setSuggestionBasis] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [targetSha, setTargetSha] = useState('');
  const [notesTemplate, setNotesTemplate] = useState('');
  const [publishRelease, setPublishRelease] = useState(true);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [generateNotesError, setGenerateNotesError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdTag, setCreatedTag] = useState<{ owner: string; repo: string; tag: string } | null>(null);

  const defaultBranchFor = (repo: RepoOption, env: Environment) => (env === 'sit' ? 'sit' : repo.default_branch || 'main');

  const fetchSuggestion = (repo: RepoOption, env: Environment, branch: string) => {
    setSuggesting(true);
    setSuggestionError(null);
    setSuggestionBasis(null);
    githubApi.suggestNextTag(repo.owner, repo.name, env, branch)
      .then((res: { suggested_tag: string; basis: string }) => {
        setTagName(res.suggested_tag);
        setSuggestionBasis(res.basis);
      })
      .catch((err) => {
        setTagName('');
        setSuggestionError(err.response?.data?.detail || err.message || 'Could not suggest a tag');
      })
      .finally(() => setSuggesting(false));
  };

  const handleSelectRepo = (repo: RepoOption | null) => {
    setSelectedRepo(repo);
    setCreatedTag(null);
    setCreateError(null);
    setTagName('');
    setSuggestionBasis(null);
    setSuggestionError(null);
    setNotesTemplate('');
    setGenerateNotesError(null);
    if (!repo) {
      setBranchOptions([]);
      setSourceBranch('');
      return;
    }

    const branch = defaultBranchFor(repo, environment);
    setSourceBranch(branch);
    setBranchOptions([repo.default_branch, 'sit', 'main']);
    githubApi.listBranches(repo.owner, repo.name)
      .then((names: string[]) => {
        setBranchOptions(Array.from(new Set([repo.default_branch, 'sit', 'main', ...(names || [])])));
      })
      .catch(() => {});

    fetchSuggestion(repo, environment, branch);
  };

  const handleEnvironmentChange = (_: React.MouseEvent<HTMLElement>, value: Environment | null) => {
    if (!value || !selectedRepo) return;
    setEnvironment(value);
    setCreatedTag(null);
    setCreateError(null);
    const branch = defaultBranchFor(selectedRepo, value);
    setSourceBranch(branch);
    fetchSuggestion(selectedRepo, value, branch);
  };

  const handleGenerateNotes = () => {
    if (!selectedRepo || !tagName.trim()) return;
    setGeneratingNotes(true);
    setGenerateNotesError(null);
    githubApi.generateReleaseNotes({
      tag_name: tagName.trim(),
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
      target_commitish: targetSha.trim() || sourceBranch || undefined,
    })
      .then((res: { name: string; body: string }) => setNotesTemplate(res.body || ''))
      .catch((err) => setGenerateNotesError(err.response?.data?.detail || err.message || 'Could not generate release notes'))
      .finally(() => setGeneratingNotes(false));
  };

  const canSubmit = !!selectedRepo && !!sourceBranch && !!tagName.trim() && !creating;

  const handleCreate = () => {
    if (!selectedRepo || !sourceBranch || !tagName.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreatedTag(null);
    githubApi.createTag({
      tag_name: tagName.trim(),
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
      source_branch: sourceBranch,
      target_commit_sha: targetSha.trim() || undefined,
      release_notes_template: notesTemplate.trim() || undefined,
      publish_release: publishRelease,
    })
      .then(() => setCreatedTag({ owner: selectedRepo.owner, repo: selectedRepo.name, tag: tagName.trim() }))
      .catch((err) => setCreateError(err.response?.data?.detail || err.message || 'Failed to create tag'))
      .finally(() => setCreating(false));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 780 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Create Release Tag</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Pick a repo and environment - the next tag version is auto-suggested from your repo's own convention, and stays editable.
        </Typography>
      </Box>

      <Paper className="glass-panel" sx={{ p: 3, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <FormRow label="1. Repository">
          <ToggleButtonGroup
            value={selectedRepo?.full_name || null}
            exclusive
            size="small"
            onChange={(_, value) => handleSelectRepo(ALLOWED_REPOS.find((r) => r.full_name === value) || null)}
          >
            {ALLOWED_REPOS.map((repo) => (
              <ToggleButton key={repo.full_name} value={repo.full_name}>{repo.name}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </FormRow>

        {selectedRepo && (
          <>
            <FormRow label="2. Environment">
              <ToggleButtonGroup
                value={environment}
                exclusive
                onChange={handleEnvironmentChange}
                size="small"
              >
                <ToggleButton value="sit">SIT</ToggleButton>
                <ToggleButton value="main">main</ToggleButton>
              </ToggleButtonGroup>
            </FormRow>

            <FormRow label="3. Tag Name">
              <TextField
                fullWidth
                size="small"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder={suggesting ? 'Suggesting...' : 'e.g. 0.0.2196-MS-SIT-MYSQL8'}
                InputProps={{
                  endAdornment: suggesting ? <CircularProgress size={14} /> : undefined,
                }}
              />
              {suggestionBasis && !suggesting && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <LucideIcon name="Sparkles" size={12} /> {suggestionBasis}
                </Typography>
              )}
              {suggestionError && !suggesting && (
                <Alert severity="warning" sx={{ mt: 1, borderRadius: 2 }}>{suggestionError} - type the tag name manually.</Alert>
              )}
            </FormRow>

            <Box>
              <Button
                size="small"
                onClick={() => setAdvancedOpen((o) => !o)}
                startIcon={<LucideIcon name={advancedOpen ? 'ChevronDown' : 'ChevronRight'} size={14} />}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', color: 'text.secondary' }}
              >
                Advanced
              </Button>
              <Collapse in={advancedOpen}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1.5 }}>
                  <FormRow label="Source branch">
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={branchOptions}
                      value={sourceBranch}
                      onInputChange={(_, value) => setSourceBranch(value)}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Branch name" helperText="Tag is created at the tip of this branch, unless a commit SHA is given below" />
                      )}
                    />
                  </FormRow>

                  <FormRow label="Target Commit SHA">
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Leave empty to use the source branch tip (optional)"
                      value={targetSha}
                      onChange={(e) => setTargetSha(e.target.value)}
                    />
                  </FormRow>

                  <FormRow label="Release Notes">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        minRows={3}
                        placeholder="Optional - or click Generate to draft from merged PRs since the last tag"
                        value={notesTemplate}
                        onChange={(e) => setNotesTemplate(e.target.value)}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleGenerateNotes}
                          disabled={generatingNotes || !tagName.trim()}
                          startIcon={generatingNotes ? <CircularProgress size={12} /> : <LucideIcon name="Sparkles" size={14} />}
                        >
                          {generatingNotes ? 'Generating...' : 'Generate from PRs'}
                        </Button>
                        <FormControlLabel
                          sx={{ mr: 0 }}
                          control={<Checkbox size="small" checked={publishRelease} onChange={(e) => setPublishRelease(e.target.checked)} />}
                          label={<Typography variant="body2">Publish as a GitHub Release</Typography>}
                        />
                      </Box>
                      {generateNotesError && <Alert severity="warning" sx={{ borderRadius: 2 }}>{generateNotesError}</Alert>}
                    </Box>
                  </FormRow>
                </Box>
              </Collapse>
            </Box>

            <Box>
              <Button
                variant="contained"
                disabled={!canSubmit}
                onClick={handleCreate}
                startIcon={creating ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Tag" size={16} />}
              >
                {creating ? 'Creating...' : 'Create Tag'}
              </Button>
            </Box>

            {createError && <Alert severity="error" sx={{ borderRadius: 2 }}>{createError}</Alert>}

            {createdTag && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                Created <b>{createdTag.tag}</b> on {createdTag.owner}/{createdTag.repo}.{' '}
                <MuiLink
                  href={`https://github.com/${createdTag.owner}/${createdTag.repo}/releases/tag/${createdTag.tag}`}
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

export default GithubCreateTag;
