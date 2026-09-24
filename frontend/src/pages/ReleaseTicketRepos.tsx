import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Paper, IconButton, Chip, CircularProgress, Alert, Button, Divider, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { releaseTicketApi, jiraApi } from '../services/api';
import { REPO_CONFIGS, REPO_ORDER } from '../utils/releaseTicketConfig';

interface TicketListItem {
  key: string;
  summary?: string;
  status?: string;
  created?: string;
  repo?: string;
  environment?: string;
  release_type?: string;
  github_release_tag?: string;
  github_reverting_tag?: string;
}

interface TicketComment {
  id?: string;
  author?: string;
  body?: string;
  created?: string;
}

interface TicketApprover {
  display_name?: string;
  decision?: string;
}

interface TicketApproval {
  name?: string;
  final_decision?: string;
  approvers: TicketApprover[];
}

interface TicketDetail extends TicketListItem {
  url?: string;
  reporter?: string;
  assignee?: string;
  channel?: string | null;
  jira_issue_links?: string;
  architect_review?: string;
  notify_training_team?: string;
  additional_logging_required?: string;
  what_to_monitor?: string | null;
  qa_signoff_received?: string;
  qa_touch_url?: string;
  comments?: TicketComment[];
  approvals?: TicketApproval[];
}

const approvalDecisionColor = (decision?: string): 'success' | 'error' | 'warning' | 'default' => {
  const d = (decision || '').toLowerCase();
  if (d.includes('approved')) return 'success';
  if (d.includes('declined') || d.includes('rejected')) return 'error';
  if (d.includes('pending')) return 'warning';
  return 'default';
};

const formatDate = (iso?: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const DetailRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <Grid item xs={6} sm={4}>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>{value || '-'}</Typography>
  </Grid>
);

export const ReleaseTicketRepos: React.FC = () => {
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);

  const [addCommentOpen, setAddCommentOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [detailView, setDetailView] = useState<'comments' | 'approvals'>('comments');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    releaseTicketApi.listMyTickets()
      .then((res) => { if (!cancelled) setTickets(res); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || err.message || 'Failed to load release tickets'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tickets;
    return tickets.filter((t) =>
      [t.key, t.summary, t.repo, t.environment, t.status].some((f) => (f || '').toLowerCase().includes(term))
    );
  }, [tickets, search]);

  const pagedTickets = useMemo(
    () => filteredTickets.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredTickets, page, rowsPerPage]
  );

  const openTicketDetails = async (key: string) => {
    setSelectedKey(key);
    setSelectedTicket(null);
    setSelectedError(null);
    setDetailView('comments');
    setLoadingSelected(true);
    try {
      const res = await releaseTicketApi.getTicketDetail(key);
      setSelectedTicket(res);
    } catch (err: any) {
      setSelectedError(err.response?.data?.detail || err.message || 'Ticket not found');
    } finally {
      setLoadingSelected(false);
    }
  };

  // Bring the details panel into view as soon as it opens, instead of leaving the user to scroll
  useEffect(() => {
    if (selectedKey) {
      detailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedKey]);

  const handleAddComment = async () => {
    if (!selectedKey || !commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await jiraApi.addComment({ ticket_key: selectedKey, body: commentBody.trim() });
      setSelectedTicket((prev) => (prev ? {
        ...prev,
        comments: [{ id: `local-${Date.now()}`, author: 'You', body: commentBody.trim(), created: new Date().toISOString() }, ...(prev.comments || [])],
      } : prev));
      setDetailView('comments');
      setAddCommentOpen(false);
      setCommentBody('');
    } catch (err) {
      // Notification already surfaced globally by the axios interceptor in api.ts
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Release Ticket</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          File a Release Management request (CloudSecOps - ITSM) for a repo.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        {REPO_ORDER.map((repoId) => {
          const repo = REPO_CONFIGS[repoId];
          return (
            <Grid item xs={12} sm={6} md={4} key={repoId}>
              <Card
                className="glass-card"
                onClick={() => navigate(`/itsm/release-ticket/${repoId}`)}
                sx={{
                  height: 160,
                  borderRadius: 3,
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  '&:hover': { transform: 'translateY(-3px)', borderColor: 'primary.main' },
                }}
              >
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'rgba(59, 130, 246, 0.08)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LucideIcon name={repo.icon} size={22} />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{repo.label}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{repo.description}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Divider />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>My Release Tickets</Typography>
          <TextField
            placeholder="Search key, summary, repo, environment, status"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            size="small"
            sx={{ minWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LucideIcon name="Search" size={16} className="text-slate-400" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

        {!loading && !error && (
          <Paper className="glass-panel" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Key</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Summary</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Repo</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Environment / Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedTickets.map((t) => (
                    <TableRow
                      key={t.key}
                      hover
                      onClick={() => openTicketDetails(t.key)}
                      selected={selectedKey === t.key}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontWeight: 700 }}>{t.key}</TableCell>
                      <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.summary}</TableCell>
                      <TableCell>{t.repo}</TableCell>
                      <TableCell>{t.environment}{t.release_type ? ` / ${t.release_type}` : ''}</TableCell>
                      <TableCell><Chip label={t.status} size="small" /></TableCell>
                      <TableCell>{formatDate(t.created)}</TableCell>
                    </TableRow>
                  ))}
                  {pagedTickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                        No release tickets found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredTickets.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          </Paper>
        )}

        {selectedKey && (
          <Box ref={detailsPanelRef} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', scrollMarginTop: 16 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'rgba(59, 130, 246, 0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LucideIcon name="Ticket" size={18} /> {selectedKey}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {selectedTicket?.url && (
                  <Button size="small" variant="contained" component="a" href={selectedTicket.url} target="_blank" endIcon={<LucideIcon name="ExternalLink" size={14} />}>
                    Open in Jira
                  </Button>
                )}
                <IconButton size="small" onClick={() => setSelectedKey(null)}>
                  <LucideIcon name="X" size={16} />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ p: 2.5 }}>
              {loadingSelected && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                  <CircularProgress size={28} />
                </Box>
              )}
              {selectedError && <Alert severity="error" sx={{ borderRadius: 2 }}>{selectedError}</Alert>}
              {!loadingSelected && selectedTicket && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>{selectedTicket.summary}</Typography>
                  <Grid container spacing={2}>
                    <DetailRow label="STATUS" value={selectedTicket.status} />
                    <DetailRow label="REPO" value={selectedTicket.repo} />
                    <DetailRow label="ENVIRONMENT" value={selectedTicket.environment} />
                    <DetailRow label="RELEASE TYPE" value={selectedTicket.release_type} />
                    {selectedTicket.channel && <DetailRow label="OCTOPUS CHANNEL" value={selectedTicket.channel} />}
                    <DetailRow label="CREATED" value={formatDate(selectedTicket.created)} />
                    <DetailRow label="REPORTER" value={selectedTicket.reporter} />
                    <DetailRow label="ASSIGNEE" value={selectedTicket.assignee} />
                    <DetailRow label="GITHUB RELEASE TAG" value={selectedTicket.github_release_tag} />
                    <DetailRow label="GITHUB-REVERTING-TAG" value={selectedTicket.github_reverting_tag} />
                    <DetailRow label="ARCHITECT REVIEW" value={selectedTicket.architect_review} />
                    <DetailRow label="NOTIFY TRAINING TEAM" value={selectedTicket.notify_training_team} />
                    <DetailRow label="ADDITIONAL LOGGING" value={selectedTicket.additional_logging_required} />
                    {selectedTicket.what_to_monitor && <DetailRow label="WHAT TO MONITOR" value={selectedTicket.what_to_monitor} />}
                    <DetailRow label="QA SIGN OFF" value={selectedTicket.qa_signoff_received} />
                    {selectedTicket.qa_touch_url && <DetailRow label="QA TOUCH URL" value={selectedTicket.qa_touch_url} />}
                    {selectedTicket.jira_issue_links && <DetailRow label="JIRA ISSUE LINKS" value={selectedTicket.jira_issue_links} />}
                  </Grid>

                  <Divider />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={detailView}
                      onChange={(_, value) => value && setDetailView(value)}
                    >
                      <ToggleButton value="comments">Comments ({(selectedTicket.comments || []).length})</ToggleButton>
                      <ToggleButton value="approvals">Approvals ({(selectedTicket.approvals || []).length})</ToggleButton>
                    </ToggleButtonGroup>
                    {detailView === 'comments' && (
                      <Button size="small" variant="outlined" startIcon={<LucideIcon name="MessageSquarePlus" size={14} />} onClick={() => setAddCommentOpen(true)}>
                        Add Comment
                      </Button>
                    )}
                  </Box>

                  {detailView === 'comments' && (
                    (selectedTicket.comments || []).length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>No comments posted on this ticket.</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {(selectedTicket.comments || []).map((c, idx) => (
                          <Box key={c.id || idx} sx={{ display: 'flex', gap: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>{c.author ? c.author.charAt(0) : 'A'}</Avatar>
                            <Box sx={{ flexGrow: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.author}</Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDate(c.created)}</Typography>
                              </Box>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.primary' }}>{c.body}</Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )
                  )}

                  {detailView === 'approvals' && (
                    (selectedTicket.approvals || []).length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>No approval steps on this ticket.</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {(selectedTicket.approvals || []).map((a, idx) => (
                          <Box key={idx} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{a.name}</Typography>
                              <Chip label={a.final_decision} size="small" color={approvalDecisionColor(a.final_decision)} />
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {a.approvers.map((ap, apIdx) => (
                                <Box key={apIdx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{ap.display_name}</Typography>
                                  <Chip label={ap.decision} size="small" color={approvalDecisionColor(ap.decision)} variant="outlined" />
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={addCommentOpen} onClose={() => setAddCommentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Comment{selectedKey ? ` - ${selectedKey}` : ''}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            autoFocus
            placeholder="Write a comment..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCommentOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddComment} disabled={submittingComment || !commentBody.trim()}>
            {submittingComment ? <CircularProgress size={16} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReleaseTicketRepos;
