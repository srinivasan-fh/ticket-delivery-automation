import React, { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Breadcrumbs, Link, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Card, CardContent, Divider, Grid,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { releaseTicketApi } from '../services/api';
import {
  REPO_CONFIGS, RepoId, ENVIRONMENT_OPTIONS, EnvironmentOption, RELEASE_TYPE_OPTIONS,
  FALCON_BOBCRM_CHANNELS, DEFAULT_QA_TOUCH_URL,
} from '../utils/releaseTicketConfig';

export const ReleaseTicketForm: React.FC = () => {
  const { repo: repoParam } = useParams<{ repo: string }>();
  const repo = (repoParam || '') as RepoId;
  const repoConfig = REPO_CONFIGS[repo];

  const [descriptionSuffix, setDescriptionSuffix] = useState('');
  const [environment, setEnvironment] = useState<EnvironmentOption>('Prod');
  const [releaseType, setReleaseType] = useState('Normal Release');
  const [channel, setChannel] = useState(repoConfig?.needsChannel ? FALCON_BOBCRM_CHANNELS[0] : '');
  const [githubReleaseTag, setGithubReleaseTag] = useState('');
  const [githubRevertingTag, setGithubRevertingTag] = useState('');
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [jiraIssueLinks, setJiraIssueLinks] = useState('');
  const [architectReview, setArchitectReview] = useState<'Yes' | 'No'>('No');
  const [notifyTrainingTeam, setNotifyTrainingTeam] = useState<'Yes' | 'No'>('No');
  const [additionalLogging, setAdditionalLogging] = useState<'Yes' | 'No'>('No');
  const [whatToMonitor, setWhatToMonitor] = useState('');
  const [qaSignoff, setQaSignoff] = useState<'Yes' | 'No'>('Yes');
  const [qaTouchUrl, setQaTouchUrl] = useState(DEFAULT_QA_TOUCH_URL);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ key?: string; url?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoConfig) return;
    if (repoConfig.needsChannel && !channel) return;

    let cancelled = false;
    setTagsLoading(true);
    setTagsError(null);
    releaseTicketApi.getCandidate({ repo, channel: repoConfig.needsChannel ? channel : undefined })
      .then((res) => {
        if (cancelled) return;
        setGithubReleaseTag(res.github_release_tag || '');
        setGithubRevertingTag(res.github_reverting_tag || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setTagsError(err.response?.data?.detail || err.message || 'Failed to auto-fill Github tags');
      })
      .finally(() => { if (!cancelled) setTagsLoading(false); });
    return () => { cancelled = true; };
  }, [repo, channel, repoConfig]);

  if (!repoConfig) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" color="error">Unknown repo</Typography>
        <Button component={RouterLink} to="/itsm/release-ticket" variant="contained" sx={{ mt: 2 }}>Back to Release Ticket</Button>
      </Box>
    );
  }

  const handleEnvironmentChange = (value: EnvironmentOption) => {
    setEnvironment(value);
    setReleaseType(RELEASE_TYPE_OPTIONS[value][0]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const res = await releaseTicketApi.createTicket({
        repo,
        description: `${repoConfig.descriptionPrefix()}${descriptionSuffix}`,
        environment,
        release_type: releaseType,
        channel: repoConfig.needsChannel ? channel : undefined,
        github_release_tag: githubReleaseTag,
        github_reverting_tag: githubRevertingTag,
        jira_issue_links: jiraIssueLinks.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean),
        architect_review: architectReview,
        notify_training_team: notifyTrainingTeam,
        additional_logging_required: additionalLogging,
        what_to_monitor: additionalLogging === 'Yes' ? whatToMonitor : undefined,
        qa_signoff_received: qaSignoff,
        qa_touch_url: qaSignoff === 'Yes' ? qaTouchUrl : undefined,
      });
      setResult(res.data || res);
    } catch (err: any) {
      setSubmitError(err.response?.data?.detail || err.message || 'Failed to create release ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
          <Link component={RouterLink} to="/" underline="hover" color="inherit">Dashboard</Link>
          <Link component={RouterLink} to="/itsm/release-ticket" underline="hover" color="inherit">Release Ticket</Link>
          <Typography color="text.primary">{repoConfig.label}</Typography>
        </Breadcrumbs>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'rgba(59, 130, 246, 0.08)', color: 'primary.main', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideIcon name={repoConfig.icon} size={22} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{repoConfig.label} Release Ticket</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{repoConfig.description}</Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Release Details</Typography>

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Release Description</Typography>
                <TextField
                  fullWidth
                  value={descriptionSuffix}
                  onChange={(e) => setDescriptionSuffix(e.target.value)}
                  InputProps={{ startAdornment: <Typography sx={{ color: 'text.secondary', whiteSpace: 'nowrap', mr: 0.5 }}>{repoConfig.descriptionPrefix()}</Typography> }}
                />
              </Box>

              <FormControl fullWidth>
                <InputLabel>Environment To Release</InputLabel>
                <Select value={environment} label="Environment To Release" onChange={(e) => handleEnvironmentChange(e.target.value as EnvironmentOption)}>
                  {ENVIRONMENT_OPTIONS.map((env) => <MenuItem key={env} value={env}>{env}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Release Type</InputLabel>
                <Select value={releaseType} label="Release Type" onChange={(e) => setReleaseType(e.target.value)}>
                  {RELEASE_TYPE_OPTIONS[environment].map((rt) => <MenuItem key={rt} value={rt}>{rt}</MenuItem>)}
                </Select>
              </FormControl>

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>Octopus Project Name</Typography>
                <TextField fullWidth value={repoConfig.label.toLowerCase()} disabled />
              </Box>

              {repoConfig.needsChannel && (
                <FormControl fullWidth>
                  <InputLabel>Octopus Channel Name</InputLabel>
                  <Select value={channel} label="Octopus Channel Name" onChange={(e) => setChannel(e.target.value)}>
                    {FALCON_BOBCRM_CHANNELS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </Select>
                </FormControl>
              )}

              <TextField
                fullWidth
                label="Github Release Tag"
                value={githubReleaseTag}
                onChange={(e) => setGithubReleaseTag(e.target.value)}
                InputProps={{ endAdornment: tagsLoading ? <CircularProgress size={16} /> : undefined }}
              />
              <TextField
                fullWidth
                label="Github-Reverting-Tag"
                value={githubRevertingTag}
                onChange={(e) => setGithubRevertingTag(e.target.value)}
                InputProps={{ endAdornment: tagsLoading ? <CircularProgress size={16} /> : undefined }}
              />
              {tagsError && <Alert severity="warning" sx={{ borderRadius: 2 }}>{tagsError}</Alert>}

              <TextField
                fullWidth
                multiline
                rows={2}
                label="JIRA Issue Links"
                placeholder="e.g. RNMS-1234, RNMS-1235"
                value={jiraIssueLinks}
                onChange={(e) => setJiraIssueLinks(e.target.value)}
              />

              <FormControl fullWidth>
                <InputLabel>Do You Need an ARCHITECT Review?</InputLabel>
                <Select value={architectReview} label="Do You Need an ARCHITECT Review?" onChange={(e) => setArchitectReview(e.target.value as 'Yes' | 'No')}>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Notify Training Team?</InputLabel>
                <Select value={notifyTrainingTeam} label="Notify Training Team?" onChange={(e) => setNotifyTrainingTeam(e.target.value as 'Yes' | 'No')}>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Additional Logging/Monitoring Required?</InputLabel>
                <Select value={additionalLogging} label="Additional Logging/Monitoring Required?" onChange={(e) => setAdditionalLogging(e.target.value as 'Yes' | 'No')}>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </Select>
              </FormControl>
              {additionalLogging === 'Yes' && (
                <TextField
                  fullWidth
                  label="What to Monitor"
                  value={whatToMonitor}
                  onChange={(e) => setWhatToMonitor(e.target.value)}
                />
              )}

              <FormControl fullWidth>
                <InputLabel>QA Sign off Received</InputLabel>
                <Select value={qaSignoff} label="QA Sign off Received" onChange={(e) => setQaSignoff(e.target.value as 'Yes' | 'No')}>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </Select>
              </FormControl>
              {qaSignoff === 'Yes' && (
                <TextField
                  fullWidth
                  label="QA Touch URL"
                  value={qaTouchUrl}
                  onChange={(e) => setQaTouchUrl(e.target.value)}
                />
              )}

              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting || !githubReleaseTag || !githubRevertingTag}
                startIcon={submitting ? <CircularProgress size={16} /> : <LucideIcon name="Rocket" />}
                sx={{ mt: 1, py: 1.25, fontWeight: 700 }}
              >
                {submitting ? 'Filing Release Ticket...' : 'File Release Ticket'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card className="glass-panel" sx={{ borderRadius: 3, p: 2, minHeight: 200 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LucideIcon name="PlaySquare" /> Result
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {submitError && <Alert severity="error" sx={{ borderRadius: 2 }}>{submitError}</Alert>}
              {!submitError && !result && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  The created ticket key and link will appear here after submitting.
                </Typography>
              )}
              {result && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2">Ticket created: <b>{result.key}</b></Typography>
                  {result.url && (
                    <Button size="small" variant="outlined" component="a" href={result.url} target="_blank" endIcon={<LucideIcon name="ExternalLink" size={12} />} sx={{ alignSelf: 'flex-start' }}>
                      View in Jira
                    </Button>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ReleaseTicketForm;
