import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Breadcrumbs, Link, Button, TextField, CircularProgress, Alert,
  Chip, Divider, IconButton, Popover, Tooltip, Avatar
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { githubApi, systemLogsApi } from '../services/api';
import { parsePatch, ParsedDiffLine } from '../utils/parseDiff';

interface PendingComment {
  id: string;
  filename: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
}

interface ParsedPr {
  owner: string;
  repo: string;
  number: number;
}

const PR_URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

// GitHub-style compact button sizing/colors (dark mode), scoped to this page only.
const ghBtnBase = { height: 28, fontSize: '0.8rem', fontWeight: 600, borderRadius: '6px', textTransform: 'none' as const, px: 1.5, py: 0, minWidth: 0, lineHeight: '28px' };
const ghPrimaryBtnSx = { ...ghBtnBase, bgcolor: '#238636', color: '#fff', '&:hover': { bgcolor: '#2ea043' } };
const ghDefaultBtnSx = { ...ghBtnBase, bgcolor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', '&:hover': { bgcolor: '#30363d' } };

const getStatusColor = (status: string = '') => {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('merged')) return 'success';
  if (s.includes('closed') || s.includes('changes')) return 'error';
  if (s.includes('open')) return 'primary';
  return 'default';
};

const lineKey = (filename: string, line: number, side: string) => `${filename}::${side}::${line}`;

const REVIEW_EVENT_LABELS: Record<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES', { title: string; placeholder: string; submit: string }> = {
  COMMENT: { title: 'Comment on this pull request', placeholder: 'Leave a comment', submit: 'Submit comment' },
  APPROVE: { title: 'Approve this pull request', placeholder: 'Leave a comment (optional)', submit: 'Submit approval' },
  REQUEST_CHANGES: { title: 'Request changes', placeholder: 'Explain what needs to change', submit: 'Submit request changes' },
};

export const GithubPullRequestReview: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPr, setParsedPr] = useState<ParsedPr | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prData, setPrData] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);

  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [activeComposerKey, setActiveComposerKey] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const [reviewAnchor, setReviewAnchor] = useState<HTMLElement | null>(null);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewEvent, setReviewEvent] = useState<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'>('COMMENT');
  const [submitting, setSubmitting] = useState(false);

  const handleShowDiff = async () => {
    const match = inputValue.trim().match(PR_URL_RE);
    if (!match) {
      setParseError('Paste a full PR URL, e.g. https://github.com/owner/repo/pull/123');
      return;
    }
    setParseError(null);
    const pr: ParsedPr = { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
    setParsedPr(pr);
    setPendingComments([]);
    setCollapsedFiles({});
    setError(null);
    setLoading(true);
    try {
      const [prRes, filesRes] = await Promise.all([
        githubApi.getPR(pr.number, { owner: pr.owner, repo: pr.repo }),
        githubApi.getPRFiles(pr.number, { owner: pr.owner, repo: pr.repo }),
      ]);
      setPrData(prRes.data || prRes);
      setFiles((filesRes.data || filesRes) as any[]);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load pull request');
      setPrData(null);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const openComposer = (filename: string, line: number, side: 'LEFT' | 'RIGHT') => {
    setActiveComposerKey(lineKey(filename, line, side));
    setComposerText('');
  };

  const addPendingComment = (filename: string, line: number, side: 'LEFT' | 'RIGHT') => {
    if (!composerText.trim()) return;
    setPendingComments((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename, line, side, body: composerText.trim() },
    ]);
    setActiveComposerKey(null);
    setComposerText('');
  };

  const removePendingComment = (id: string) => {
    setPendingComments((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleFileCollapsed = (filename: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [filename]: !prev[filename] }));
  };

  const handleSubmitReview = async () => {
    if (!parsedPr || !prData) return;
    setSubmitting(true);
    try {
      await githubApi.submitReview({
        pr_number: parsedPr.number,
        owner: parsedPr.owner,
        repo: parsedPr.repo,
        commit_id: prData.head?.sha,
        comment: reviewBody,
        event: reviewEvent,
        comments: pendingComments.map((c) => ({ path: c.filename, line: c.line, side: c.side, body: c.body })),
      });
      setPendingComments([]);
      setReviewBody('');
      setReviewAnchor(null);
      const prRes = await githubApi.getPR(parsedPr.number, { owner: parsedPr.owner, repo: parsedPr.repo });
      setPrData(prRes.data || prRes);
      systemLogsApi.getLogs({ service: 'github', limit: 1 }).catch(() => {});
    } catch (err) {
      // Notification already surfaced globally by the axios interceptor in api.ts
    } finally {
      setSubmitting(false);
    }
  };

  const renderDiffRow = (file: any, parsed: ParsedDiffLine) => {
    if (parsed.type === 'hunk') {
      return (
        <Box key={`hunk-${parsed.content}`} sx={{ display: 'grid', gridTemplateColumns: '50px 50px 1fr', bgcolor: 'rgba(56,139,253,0.1)', color: '#79c0ff', fontFamily: 'monospace', fontSize: '0.78rem' }}>
          <Box sx={{ gridColumn: '1 / span 3', px: 1.5, py: 0.25 }}>{parsed.content}</Box>
        </Box>
      );
    }

    const side: 'LEFT' | 'RIGHT' = parsed.type === 'remove' ? 'LEFT' : 'RIGHT';
    const line = side === 'LEFT' ? parsed.oldLine! : parsed.newLine!;
    const key = lineKey(file.filename, line, side);
    const bg = parsed.type === 'add' ? 'rgba(46,160,67,0.15)' : parsed.type === 'remove' ? 'rgba(248,81,73,0.15)' : 'transparent';
    const marker = parsed.type === 'add' ? '+' : parsed.type === 'remove' ? '-' : ' ';
    const isHovered = hoveredKey === key;
    const linePending = pendingComments.filter((c) => c.filename === file.filename && c.line === line && c.side === side);

    return (
      <React.Fragment key={key}>
        <Box
          onMouseEnter={() => setHoveredKey(key)}
          onMouseLeave={() => setHoveredKey((k) => (k === key ? null : k))}
          sx={{ display: 'grid', gridTemplateColumns: '50px 50px 1fr', bgcolor: bg, fontFamily: 'monospace', fontSize: '0.78rem', position: 'relative', '&:hover': { bgcolor: parsed.type === 'context' ? 'rgba(255,255,255,0.03)' : bg } }}
        >
          <Box sx={{ color: 'text.secondary', textAlign: 'right', pr: 0.5, userSelect: 'none' }}>{parsed.oldLine ?? ''}</Box>
          <Box sx={{ color: 'text.secondary', textAlign: 'right', pr: 0.5, userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
            {isHovered && (
              <IconButton size="small" sx={{ p: 0, color: '#3fb950' }} onClick={() => openComposer(file.filename, line, side)}>
                <LucideIcon name="PlusCircle" size={14} />
              </IconButton>
            )}
            {parsed.newLine ?? ''}
          </Box>
          <Box sx={{ whiteSpace: 'pre-wrap', pl: 0.5 }}>
            <Box component="span" sx={{ color: parsed.type === 'add' ? '#3fb950' : parsed.type === 'remove' ? '#f85149' : 'text.secondary', pr: 1 }}>{marker}</Box>
            {parsed.content}
          </Box>
        </Box>

        {activeComposerKey === key && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '50px 50px 1fr', bgcolor: '#0d1117', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d' }}>
            <Box sx={{ gridColumn: '1 / span 3', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                autoFocus
                multiline
                minRows={2}
                size="small"
                placeholder="Leave a review comment on this line"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.85rem' } }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" sx={ghPrimaryBtnSx} onClick={() => addPendingComment(file.filename, line, side)}>Add review comment</Button>
                <Button size="small" sx={ghDefaultBtnSx} onClick={() => setActiveComposerKey(null)}>Cancel</Button>
              </Box>
            </Box>
          </Box>
        )}

        {linePending.map((c) => (
          <Box key={c.id} sx={{ display: 'grid', gridTemplateColumns: '50px 50px 1fr', bgcolor: '#0d1117', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d' }}>
            <Box sx={{ gridColumn: '1 / span 3', p: 1.5, display: 'flex', gap: 1.5 }}>
              <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem' }}>Y</Avatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>you</Typography>
                <Chip label="Pending" size="small" sx={{ ml: 1, height: 16, fontSize: '0.65rem', bgcolor: 'rgba(210,153,34,0.2)', color: '#d29922' }} />
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{c.body}</Typography>
              </Box>
              <IconButton size="small" onClick={() => removePendingComment(c.id)}>
                <LucideIcon name="X" size={14} />
              </IconButton>
            </Box>
          </Box>
        ))}
      </React.Fragment>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
          <Link component={RouterLink} to="/" underline="hover" color="inherit">Dashboard</Link>
          <Link component={RouterLink} to="/category/github" underline="hover" color="inherit">github</Link>
          <Typography color="text.primary">Approve Pull Request</Typography>
        </Breadcrumbs>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Approve Pull Request</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          Paste a PR link to view its diff and submit an approval, comment, or request-changes review.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="https://github.com/owner/repo/pull/123"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleShowDiff(); }}
          error={!!parseError}
          helperText={parseError}
        />
        <Button
          variant="contained"
          disabled={loading}
          onClick={handleShowDiff}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Diff" size={16} />}
          sx={{ ...ghPrimaryBtnSx, height: 40, flexShrink: 0 }}
        >
          {loading ? 'Loading...' : 'Show Diff'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {prData && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* PR header */}
          <Box className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  {prData.title} <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>#{prData.number}</Typography>
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                  {parsedPr?.owner}/{parsedPr?.repo} &middot; opened by <b>{prData.user?.login || prData.user}</b>
                </Typography>
              </Box>
              <Chip label={prData.state} size="small" color={getStatusColor(prData.state)} sx={{ fontWeight: 700, textTransform: 'uppercase' }} />
            </Box>
          </Box>

          {/* Files changed */}
          <Box className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Files changed ({files.length})
                </Typography>
                {pendingComments.length > 0 && (
                  <Tooltip title={`${pendingComments.length} pending comment${pendingComments.length > 1 ? 's' : ''}`}>
                    <Chip label={pendingComments.length} size="small" sx={{ height: 18, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(210,153,34,0.2)', color: '#d29922' }} />
                  </Tooltip>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button sx={ghDefaultBtnSx} onClick={(e) => { setReviewEvent('COMMENT'); setReviewAnchor(e.currentTarget); }}>
                  Comment
                </Button>
                <Button
                  sx={{ ...ghBtnBase, bgcolor: 'transparent', color: '#f85149', border: '1px solid #f85149', '&:hover': { bgcolor: 'rgba(248,81,73,0.1)' } }}
                  onClick={(e) => { setReviewEvent('REQUEST_CHANGES'); setReviewAnchor(e.currentTarget); }}
                >
                  Request changes
                </Button>
                <Button sx={ghPrimaryBtnSx} onClick={(e) => { setReviewEvent('APPROVE'); setReviewAnchor(e.currentTarget); }}>
                  Approve
                </Button>
              </Box>
            </Box>

            {files.map((file) => {
              const isCollapsed = !!collapsedFiles[file.filename];
              return (
                <Box key={file.filename} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Box
                    onClick={() => toggleFileCollapsed(file.filename)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.02)', cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
                  >
                    <IconButton size="small" sx={{ p: 0 }} onClick={(e) => { e.stopPropagation(); toggleFileCollapsed(file.filename); }}>
                      <LucideIcon name={isCollapsed ? 'ChevronRight' : 'ChevronDown'} size={16} />
                    </IconButton>
                    <LucideIcon name="FileDiff" size={14} />
                    <Typography variant="body2" className="mono-font" sx={{ fontWeight: 700, flexGrow: 1 }}>{file.filename}</Typography>
                    <Typography variant="caption" sx={{ color: '#3fb950', fontWeight: 700 }}>+{file.additions}</Typography>
                    <Typography variant="caption" sx={{ color: '#f85149', fontWeight: 700 }}>-{file.deletions}</Typography>
                    <Chip label={file.status} size="small" sx={{ height: 18, fontSize: '0.65rem', textTransform: 'capitalize' }} />
                  </Box>
                  {!isCollapsed && (
                    <Box sx={{ overflowX: 'auto' }}>
                      {file.patch ? parsePatch(file.patch).map((line) => renderDiffRow(file, line)) : (
                        <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>No textual diff available for this file.</Typography>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Popover
        open={!!reviewAnchor}
        anchorEl={reviewAnchor}
        onClose={() => setReviewAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{REVIEW_EVENT_LABELS[reviewEvent].title}</Typography>
          {pendingComments.length > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {pendingComments.length} pending line comment{pendingComments.length > 1 ? 's' : ''} will be submitted with this review.
            </Typography>
          )}
          <TextField
            multiline
            minRows={3}
            size="small"
            placeholder={REVIEW_EVENT_LABELS[reviewEvent].placeholder}
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
          />
          <Divider />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button sx={ghDefaultBtnSx} onClick={() => setReviewAnchor(null)}>Cancel</Button>
            <Button
              sx={reviewEvent === 'REQUEST_CHANGES' ? { ...ghBtnBase, bgcolor: '#f85149', color: '#fff', '&:hover': { bgcolor: '#da3633' } } : ghPrimaryBtnSx}
              disabled={submitting}
              onClick={handleSubmitReview}
              startIcon={submitting ? <CircularProgress size={12} color="inherit" /> : undefined}
            >
              {submitting ? 'Submitting...' : REVIEW_EVENT_LABELS[reviewEvent].submit}
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
};

export default GithubPullRequestReview;
