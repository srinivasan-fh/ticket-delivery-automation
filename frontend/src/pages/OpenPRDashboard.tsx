import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Tabs, Tab, Chip, IconButton, Button,
  CircularProgress, Alert,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { githubApi } from '../services/api';
import { useStore } from '../store/useStore';

interface RepoOption {
  owner: string;
  name: string;
  label: string;
}

interface PRItem {
  number: number;
  title: string;
  branch: string;
  base: string;
  url: string | null;
  state: string;
  author: string | null;
  approvers: string[];
  reviewer_already_approved: boolean;
  updated_at: string | null;
}

const PR_DASHBOARD_REPOS: RepoOption[] = [
  { owner: 'uktech', name: 'BOB-CRM', label: 'BOB-CRM' },
  { owner: 'uktech', name: 'mytakeaway2.0', label: 'Mytakeaway2.0' },
  { owner: 'uktech', name: 'falcon-bobcrm-service', label: 'falcon-bobcrm-service' },
  { owner: 'uktech', name: 't2s-db', label: 't2s-db' },
  { owner: 'uktech', name: 'ms-crons', label: 'ms-crons' },
];

export const OpenPRDashboard: React.FC = () => {
  const { addNotification } = useStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [prs, setPrs] = useState<PRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [merging, setMerging] = useState<number | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<number | null>(null);
  const [mergedPRs, setMergedPRs] = useState<Set<number>>(new Set());
  const [deletedBranches, setDeletedBranches] = useState<Set<number>>(new Set());
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const selectedRepo = PR_DASHBOARD_REPOS[selectedIndex];

  useEffect(() => {
    setLoading(true);
    setError(null);
    githubApi.listPullRequests(selectedRepo.owner, selectedRepo.name, tab)
      .then((res: PRItem[]) => setPrs(res || []))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load pull requests'))
      .finally(() => setLoading(false));
  }, [selectedRepo, tab]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    carouselRef.current?.scrollBy({ left: direction === 'left' ? -220 : 220, behavior: 'smooth' });
  };

  const handleReview = (pr: PRItem) => {
    if (!pr.url) return;
    setNotifying(pr.number);
    githubApi.notifyReviewer(pr.url)
      .finally(() => setNotifying(null));
  };

  const handleApproval = (pr: PRItem) => {
    if (!pr.url) return;
    setApproving(pr.number);
    githubApi.requestApproval(pr.url, selectedRepo.name)
      .finally(() => setApproving(null));
  };

  const handleMerge = (pr: PRItem) => {
    if (!window.confirm(`Merge PR #${pr.number} (${pr.branch} → ${pr.base})? This creates a merge commit and cannot be easily undone.`)) return;
    setMerging(pr.number);
    githubApi.mergePullRequest(selectedRepo.owner, selectedRepo.name, pr.number)
      .then(() => setMergedPRs((prev) => new Set(prev).add(pr.number)))
      .finally(() => setMerging(null));
  };

  const handleDeleteBranch = (pr: PRItem) => {
    if (!window.confirm(`Delete branch "${pr.branch}" from ${selectedRepo.label}? This cannot be undone.`)) return;
    setDeletingBranch(pr.number);
    githubApi.deleteBranch(selectedRepo.owner, selectedRepo.name, pr.branch)
      .then(() => setDeletedBranches((prev) => new Set(prev).add(pr.number)))
      .finally(() => setDeletingBranch(null));
  };

  const handleSitBranch = (pr: PRItem) => {
    addNotification('SIT Branch', `Not implemented yet for #${pr.number}.`, 'info');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Open PR Dashboard
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Browse your own open and closed pull requests across repos - pick a repo below.
        </Typography>
      </Box>

      {/* Repo carousel */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => scrollCarousel('left')} size="small">
          <LucideIcon name="ChevronLeft" />
        </IconButton>
        <Box
          ref={carouselRef}
          sx={{
            display: 'flex', gap: 1.5, overflowX: 'auto', scrollBehavior: 'smooth',
            py: 1, flex: 1, '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {PR_DASHBOARD_REPOS.map((repo, idx) => (
            <Chip
              key={repo.name}
              label={repo.label}
              onClick={() => setSelectedIndex(idx)}
              color={idx === selectedIndex ? 'primary' : 'default'}
              variant={idx === selectedIndex ? 'filled' : 'outlined'}
              sx={{ flexShrink: 0, px: 1.5, py: 2.5, fontWeight: 600, fontSize: '0.9rem' }}
            />
          ))}
        </Box>
        <IconButton onClick={() => scrollCarousel('right')} size="small">
          <LucideIcon name="ChevronRight" />
        </IconButton>
      </Box>

      {/* Open/Closed tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Open PRs" value="open" />
        <Tab label="Closed PRs" value="closed" />
      </Tabs>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && prs.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No {tab} pull requests for {selectedRepo.label}.
        </Typography>
      )}

      {!loading && !error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {prs.map((pr) => {
            const isMerged = mergedPRs.has(pr.number);
            const isBranchDeleted = deletedBranches.has(pr.number);
            const approverCount = pr.approvers.length;

            const approvalEnabled = !isMerged && !!pr.url && approverCount <= 1;
            const reviewEnabled = !isMerged && !!pr.url && approverCount >= 1 && !pr.reviewer_already_approved;
            const sitBranchEnabled = !isMerged && pr.base === 'main' && !['BOB-CRM', 'ms-crons'].includes(selectedRepo.name);
            const mergeEnabled = !isMerged && approverCount >= 2;
            const closeEnabled = isMerged && !isBranchDeleted;

            return (
              <Card key={pr.number} className="glass-panel" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        #{pr.number} {pr.title}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={pr.branch} size="small" variant="outlined" icon={<LucideIcon name="GitBranch" size={12} />} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          → {pr.base} · by {pr.author || 'unknown'}
                        </Typography>
                      </Box>
                    </Box>
                    {pr.url && (
                      <IconButton size="small" href={pr.url} target="_blank" rel="noopener noreferrer">
                        <LucideIcon name="ExternalLink" size={16} />
                      </IconButton>
                    )}
                  </Box>

                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Approver{approverCount !== 1 ? 's' : ''}: {approverCount > 0 ? pr.approvers.join(', ') : 'Awaiting approval'}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={approving === pr.number ? <CircularProgress size={14} /> : <LucideIcon name="CheckCircle2" size={14} />}
                      disabled={!approvalEnabled || approving === pr.number}
                      onClick={() => handleApproval(pr)}
                    >
                      Approval
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={notifying === pr.number ? <CircularProgress size={14} /> : <LucideIcon name="Send" size={14} />}
                      disabled={!reviewEnabled || notifying === pr.number}
                      onClick={() => handleReview(pr)}
                    >
                      Review
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<LucideIcon name="GitBranchPlus" size={14} />}
                      disabled={!sitBranchEnabled}
                      onClick={() => handleSitBranch(pr)}
                    >
                      SIT Branch
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      startIcon={merging === pr.number ? <CircularProgress size={14} /> : <LucideIcon name="GitMerge" size={14} />}
                      disabled={!mergeEnabled || merging === pr.number}
                      onClick={() => handleMerge(pr)}
                    >
                      Merge
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={deletingBranch === pr.number ? <CircularProgress size={14} /> : <LucideIcon name="Trash2" size={14} />}
                      disabled={!closeEnabled || deletingBranch === pr.number}
                      onClick={() => handleDeleteBranch(pr)}
                    >
                      Close PR
                    </Button>
                  </Box>

                  {isMerged && (
                    <Alert severity="success" sx={{ py: 0 }}>
                      Merged into {pr.base}.{isBranchDeleted ? ` Branch "${pr.branch}" deleted.` : ''}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default OpenPRDashboard;
