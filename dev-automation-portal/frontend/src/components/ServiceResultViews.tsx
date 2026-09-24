import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Grid, Chip, Card, CardContent, Divider, Avatar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  LinearProgress, Tabs, Tab, Stack, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, CircularProgress, Menu, MenuItem, IconButton,
  Checkbox, FormControlLabel
} from '@mui/material';
import LucideIcon from './ui/LucideIcon';
import { jiraApi } from '../services/api';

interface JiraTransitionOption {
  id: string;
  name: string;
}

interface ServiceResultViewsProps {
  serviceId: string;
  response: any;
}

// Helpers
const getPriorityColor = (priority: string = '') => {
  const p = priority.toLowerCase();
  if (p.includes('critical') || p.includes('high') || p.includes('highest')) return 'error';
  if (p.includes('medium') || p.includes('major')) return 'warning';
  if (p.includes('low') || p.includes('minor') || p.includes('lowest')) return 'info';
  return 'default';
};

// A bare number (e.g. "25191") is assumed to be an RNMS ticket - the project used throughout
// this portal's own workflow. A full key or pasted URL is still honored as typed.
const resolveTicketKeyFromNumber = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^\d+$/.test(trimmed)) return `RNMS-${trimmed}`;
  const match = trimmed.match(/[A-Za-z][A-Za-z0-9]*-\d+/);
  return (match ? match[0] : trimmed).toUpperCase();
};

const getStatusColor = (status: string = '') => {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('success') || s.includes('resolved') || s.includes('published') || s.includes('healthy') || s.includes('shipped') || s.includes('delivered')) return 'success';
  if (s.includes('progress') || s.includes('processing') || s.includes('building') || s.includes('scheduled') || s.includes('pending')) return 'primary';
  if (s.includes('todo') || s.includes('to do') || s.includes('open') || s.includes('idle')) return 'warning';
  if (s.includes('failed') || s.includes('failure') || s.includes('error') || s.includes('cancelled')) return 'error';
  return 'default';
};

export const ServiceResultViews: React.FC<ServiceResultViewsProps> = ({ serviceId, response }) => {
  if (!response) return null;

  // ----------------------------------------------------
  // JIRA - VIEW TICKET
  // ----------------------------------------------------
  if (serviceId === 'jira-view-ticket') {
    const [activeTab, setActiveTab] = useState(0);
    const [comments, setComments] = useState<any[]>(response.comments || []);
    const [addCommentOpen, setAddCommentOpen] = useState(false);
    const [commentBody, setCommentBody] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const worklogs = response.worklogs || [];

    const [statusValue, setStatusValue] = useState<string>(response.status);
    const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
    const [transitions, setTransitions] = useState<JiraTransitionOption[]>([]);
    const [loadingTransitions, setLoadingTransitions] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const openStatusMenu = (e: React.MouseEvent<HTMLElement>) => {
      setStatusAnchor(e.currentTarget);
      setLoadingTransitions(true);
      jiraApi.getTransitions(response.key)
        .then((res: JiraTransitionOption[]) => setTransitions(res || []))
        .catch(() => setTransitions([]))
        .finally(() => setLoadingTransitions(false));
    };

    const handleTransition = async (t: JiraTransitionOption) => {
      setUpdatingStatus(true);
      try {
        await jiraApi.transitionTicket(response.key, t.id);
        setStatusValue(t.name);
        setStatusAnchor(null);
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setUpdatingStatus(false);
      }
    };

    const handleAddComment = async () => {
      if (!commentBody.trim()) return;
      setSubmittingComment(true);
      try {
        await jiraApi.addComment({ ticket_key: response.key, body: commentBody.trim() });
        setComments((prev) => [
          { id: `local-${Date.now()}`, author: 'You', body: commentBody.trim(), created: new Date().toISOString() },
          ...prev,
        ]);
        setAddCommentOpen(false);
        setCommentBody('');
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setSubmittingComment(false);
      }
    };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        {/* Ticket Header Card */}
        <Card className="glass-panel" sx={{ borderRadius: 3, p: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: 'rgba(59, 130, 246, 0.1)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="Ticket" size={20} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.light' }}>
                  {response.key}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Chip
                  label={statusValue}
                  size="small"
                  color={getStatusColor(statusValue)}
                  onClick={openStatusMenu}
                  onDelete={openStatusMenu}
                  deleteIcon={updatingStatus ? <CircularProgress size={12} color="inherit" /> : <LucideIcon name="ChevronDown" size={14} />}
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
                <Chip label={response.priority} size="small" color={getPriorityColor(response.priority)} sx={{ fontWeight: 600 }} />
                {response.story_points > 0 && (
                  <Chip label={`${response.story_points} SP`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                )}
              </Stack>
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
              {response.summary}
            </Typography>

            <Divider />

            <Grid container spacing={3}>
              {/* Left Column: Description */}
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1 }}>
                  Description
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 2,
                    maxHeight: '200px',
                    overflowY: 'scroll',
                    whiteSpace: 'pre-wrap',
                    color: 'text.primary',
                    lineHeight: 1.6,
                    fontSize: '0.9rem',
                    '&::-webkit-scrollbar': {
                      width: '6px',
                    },
                    '&::-webkit-scrollbar-track': {
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: '3px',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      background: 'rgba(59, 130, 246, 0.3)',
                      borderRadius: '3px',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                      background: 'rgba(59, 130, 246, 0.5)',
                    }
                  }}
                >
                  {response.description || 'No description provided.'}
                </Box>
              </Grid>

              {/* Right Column: Metadata Details */}
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.03)', borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    Ticket Details
                  </Typography>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Assignee</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: 'primary.dark' }}>
                        {response.assignee ? response.assignee.charAt(0) : 'U'}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{response.assignee || 'Unassigned'}</Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Reporter</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: 'secondary.dark' }}>
                        {response.reporter ? response.reporter.charAt(0) : 'R'}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{response.reporter || 'Reporter'}</Typography>
                    </Box>
                  </Box>

                  {response.sprint && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sprint</Typography>
                      <Chip label={response.sprint} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.75rem' }} />
                    </Box>
                  )}

                  {response.labels && response.labels.length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Labels</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {response.labels.map((label: string, idx: number) => (
                          <Chip key={idx} label={label} size="small" variant="filled" sx={{ fontSize: '0.7rem', height: 20, bgcolor: 'rgba(255,255,255,0.06)' }} />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Comments & Worklogs Tabs Card */}
        <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)}>
              <Tab label={`Comments (${comments.length})`} sx={{ fontWeight: 600 }} />
              <Tab label={`Worklogs (${worklogs.length})`} sx={{ fontWeight: 600 }} />
            </Tabs>
            {activeTab === 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<LucideIcon name="MessageSquarePlus" size={14} />}
                onClick={() => setAddCommentOpen(true)}
                sx={{ mb: 1 }}
              >
                Add Comment
              </Button>
            )}
          </Box>

          <CardContent sx={{ p: 2 }}>
            {/* Tab 0: Comments */}
            {activeTab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {comments.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
                    No comments posted on this ticket.
                  </Typography>
                ) : (
                  comments.map((comment: any, idx: number) => (
                    <Box key={comment.id || idx} sx={{ display: 'flex', gap: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                      <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.85rem' }}>
                        {comment.author ? comment.author.charAt(0) : 'A'}
                      </Avatar>
                      <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{comment.author}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {comment.created ? new Date(comment.created).toLocaleString() : 'Just now'}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {comment.body}
                        </Typography>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            )}

            {/* Tab 1: Worklogs */}
            {activeTab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {worklogs.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
                    No work logged on this ticket yet.
                  </Typography>
                ) : (
                  worklogs.map((wl: any, idx: number) => (
                    <Box key={wl.id || idx} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2, flexWrap: 'wrap', gap: 1 }}>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Box sx={{ p: 1, borderRadius: '8px', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', height: 'fit-content' }}>
                          <LucideIcon name="Clock" size={16} />
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            Logged {wl.time_spent}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.85rem' }}>
                            {wl.comment || 'No description provided.'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                            Logged by: <b>{wl.author || 'Unknown User'}</b>
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {wl.started ? new Date(wl.started).toLocaleString() : 'Date unspecified'}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </CardContent>
        </Card>

        <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => setStatusAnchor(null)}>
          {loadingTransitions ? (
            <MenuItem disabled>
              <CircularProgress size={14} sx={{ mr: 1 }} /> Loading statuses...
            </MenuItem>
          ) : transitions.length === 0 ? (
            <MenuItem disabled>No status changes available</MenuItem>
          ) : (
            transitions.map((t) => (
              <MenuItem key={t.id} onClick={() => handleTransition(t)} disabled={updatingStatus}>
                {t.name}
              </MenuItem>
            ))
          )}
        </Menu>

        <Dialog open={addCommentOpen} onClose={() => setAddCommentOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Add comment to {response.key}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={4}
              placeholder="Write a comment..."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddCommentOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!commentBody.trim() || submittingComment}
              onClick={handleAddComment}
              startIcon={submittingComment ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Send" size={14} />}
            >
              {submittingComment ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ----------------------------------------------------
  // JIRA - ADD WORKLOG
  // ----------------------------------------------------
  if (serviceId === 'jira-add-worklog') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="CheckCircle2" size={24} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.light' }}>Worklog Logged Successfully</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Details registered in JIRA database</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>TICKET KEY</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>{response.ticket_key}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>TIME SPENT</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.time_spent}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>STARTED DATE</Typography>
              <Typography variant="body2">{new Date(response.started).toLocaleString()}</Typography>
            </Grid>
            {response.comment && (
              <Grid item xs={12}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>DESCRIPTION / COMMENT</Typography>
                <Box sx={{ mt: 0.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.85rem' }}>
                  {response.comment}
                </Box>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // JIRA - DELETE WORKLOG
  // ----------------------------------------------------
  if (serviceId === 'jira-delete-worklog') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(239, 68, 68, 0.15)' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(239, 68, 68, 0.1)', color: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideIcon name="Trash2" size={22} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.light' }}>Worklog Deleted</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>The specified worklog has been successfully removed from JIRA.</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // JIRA - PUSH TO QA
  // ----------------------------------------------------
  if (serviceId === 'jira-push-to-qa') {
    const cliq = response.cliq_notification || {};
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(59, 130, 246, 0.15)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(59, 130, 246, 0.1)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="Rocket" size={22} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.light' }}>Pushed to {response.environment}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Ticket {response.ticket_key}</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>COMMENT</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
                changes pushed to {response.environment}. Kindly validate
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>NEW ASSIGNEE</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>{response.assignee?.assignee || 'QA'}</Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>CLIQ NOTIFICATION</Typography>
              <Chip
                label={cliq.success ? (cliq.source === 'simulated' ? 'Simulated' : 'Sent') : 'Failed'}
                size="small"
                color={cliq.success ? 'success' : 'error'}
                sx={{ mt: 0.5, fontWeight: 600 }}
              />
              {cliq.error && (
                <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{cliq.error}</Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // JIRA - TIME TRACKER DASHBOARD
  // ----------------------------------------------------
  // ----------------------------------------------------
  // JIRA - OPEN TICKETS ASSIGNED TO ME
  // ----------------------------------------------------
  if (serviceId === 'jira-open-tickets') {
    const statuses: string[] = response.statuses || [];
    const grouped: Record<string, any[]> = response.grouped || {};
    const totalCount = (response.tickets || []).length;
    const currentSprintName: string | null = response.current_sprint_name || null;

    const [onlyCurrentSprint, setOnlyCurrentSprint] = useState(false);
    const visibleGrouped: Record<string, any[]> = onlyCurrentSprint
      ? Object.fromEntries(statuses.map((s) => [s, (grouped[s] || []).filter((t: any) => t.in_current_sprint)]))
      : grouped;
    const visibleTotalCount = onlyCurrentSprint
      ? statuses.reduce((sum, s) => sum + (visibleGrouped[s]?.length || 0), 0)
      : totalCount;

    const [ticketSearch, setTicketSearch] = useState('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [loadingSelected, setLoadingSelected] = useState(false);
    const [selectedError, setSelectedError] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState(0);
    const detailsPanelRef = useRef<HTMLDivElement | null>(null);

    // Status editing (same transitions-based mechanism as View JIRA Ticket)
    const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
    const [transitions, setTransitions] = useState<JiraTransitionOption[]>([]);
    const [loadingTransitions, setLoadingTransitions] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Assignee editing
    const [assigneeAnchor, setAssigneeAnchor] = useState<HTMLElement | null>(null);
    const [assigneeQuery, setAssigneeQuery] = useState('');
    const [assignableUsers, setAssignableUsers] = useState<{ account_id: string; display_name: string; avatar_url?: string }[]>([]);
    const [loadingAssignable, setLoadingAssignable] = useState(false);
    const [updatingAssignee, setUpdatingAssignee] = useState(false);

    // Add Comment
    const [addCommentOpen, setAddCommentOpen] = useState(false);
    const [commentBody, setCommentBody] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // Add Worklog
    const [addWorklogOpen, setAddWorklogOpen] = useState(false);
    const [worklogTimeSpent, setWorklogTimeSpent] = useState('');
    const [worklogComment, setWorklogComment] = useState('');
    const [worklogStarted, setWorklogStarted] = useState('');
    const [submittingWorklog, setSubmittingWorklog] = useState(false);

    const openTicketDetails = async (key: string) => {
      setSelectedKey(key);
      setSelectedTicket(null);
      setSelectedError(null);
      setSelectedTab(0);
      setLoadingSelected(true);
      try {
        const res = await jiraApi.getTicket(key);
        setSelectedTicket(res.data || res);
      } catch (err: any) {
        setSelectedError(err.response?.data?.detail || err.message || 'Ticket not found');
      } finally {
        setLoadingSelected(false);
      }
    };

    const handleTicketSearch = () => {
      if (!ticketSearch.trim()) return;
      openTicketDetails(resolveTicketKeyFromNumber(ticketSearch));
    };

    // Bring the details panel into view as soon as it opens, instead of leaving the user to scroll
    useEffect(() => {
      if (selectedKey) {
        detailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, [selectedKey]);

    const openStatusMenu = (e: React.MouseEvent<HTMLElement>) => {
      if (!selectedKey) return;
      setStatusAnchor(e.currentTarget);
      setLoadingTransitions(true);
      jiraApi.getTransitions(selectedKey)
        .then((res: JiraTransitionOption[]) => setTransitions(res || []))
        .catch(() => setTransitions([]))
        .finally(() => setLoadingTransitions(false));
    };

    const handleTransition = async (t: JiraTransitionOption) => {
      if (!selectedKey) return;
      setUpdatingStatus(true);
      try {
        await jiraApi.transitionTicket(selectedKey, t.id);
        setSelectedTicket((prev: any) => (prev ? { ...prev, status: t.name } : prev));
        setStatusAnchor(null);
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setUpdatingStatus(false);
      }
    };

    const openAssigneeMenu = (e: React.MouseEvent<HTMLElement>) => {
      if (!selectedKey) return;
      setAssigneeAnchor(e.currentTarget);
      setAssigneeQuery('');
      setLoadingAssignable(true);
      jiraApi.getAssignableUsers(selectedKey, '')
        .then((res) => setAssignableUsers(res || []))
        .catch(() => setAssignableUsers([]))
        .finally(() => setLoadingAssignable(false));
    };

    const handleAssigneeQueryChange = (value: string) => {
      if (!selectedKey) return;
      setAssigneeQuery(value);
      setLoadingAssignable(true);
      jiraApi.getAssignableUsers(selectedKey, value)
        .then((res) => setAssignableUsers(res || []))
        .catch(() => setAssignableUsers([]))
        .finally(() => setLoadingAssignable(false));
    };

    const handleAssign = async (user: { account_id: string; display_name: string }) => {
      if (!selectedKey) return;
      setUpdatingAssignee(true);
      try {
        await jiraApi.assignTicket(selectedKey, user.account_id, user.display_name);
        setSelectedTicket((prev: any) => (prev ? { ...prev, assignee: user.display_name } : prev));
        setAssigneeAnchor(null);
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setUpdatingAssignee(false);
      }
    };

    const handleAddComment = async () => {
      if (!selectedKey || !commentBody.trim()) return;
      setSubmittingComment(true);
      try {
        await jiraApi.addComment({ ticket_key: selectedKey, body: commentBody.trim() });
        setSelectedTicket((prev: any) => (prev ? {
          ...prev,
          comments: [{ id: `local-${Date.now()}`, author: 'You', body: commentBody.trim(), created: new Date().toISOString() }, ...(prev.comments || [])],
        } : prev));
        setAddCommentOpen(false);
        setCommentBody('');
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setSubmittingComment(false);
      }
    };

    const handleAddWorklog = async () => {
      if (!selectedKey || !worklogTimeSpent.trim()) return;
      setSubmittingWorklog(true);
      try {
        const res = await jiraApi.addWorklog({
          ticket_key: selectedKey,
          time_spent: worklogTimeSpent.trim(),
          comment: worklogComment.trim() || undefined,
          started: worklogStarted ? new Date(worklogStarted).toISOString() : undefined,
        });
        const wl = res.data || res;
        setSelectedTicket((prev: any) => (prev ? {
          ...prev,
          worklogs: [{ id: wl.id || `local-${Date.now()}`, time_spent: worklogTimeSpent.trim(), comment: worklogComment.trim(), started: wl.started || new Date().toISOString(), author: 'You' }, ...(prev.worklogs || [])],
        } : prev));
        setAddWorklogOpen(false);
        setWorklogTimeSpent('');
        setWorklogComment('');
        setWorklogStarted('');
      } catch (err) {
        // Notification already surfaced globally by the axios interceptor in api.ts
      } finally {
        setSubmittingWorklog(false);
      }
    };

    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LucideIcon name="ListChecks" /> My Open Tickets
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <FormControlLabel
                sx={{ mr: 0 }}
                control={<Checkbox size="small" checked={onlyCurrentSprint} onChange={(e) => setOnlyCurrentSprint(e.target.checked)} disabled={!currentSprintName} />}
                label={<Typography variant="body2">{currentSprintName ? `Current Sprint (${currentSprintName})` : 'Show only current sprint'}</Typography>}
              />
              <Chip label={`${visibleTotalCount} total`} size="small" color="secondary" sx={{ fontWeight: 600 }} />
              <TextField
                size="small"
                placeholder="Ticket # e.g. 25191"
                value={ticketSearch}
                onChange={(e) => { setTicketSearch(e.target.value); setSelectedError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTicketSearch(); }}
                sx={{ width: 170 }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleTicketSearch}
                disabled={loadingSelected || !ticketSearch.trim()}
                startIcon={loadingSelected ? <CircularProgress size={12} /> : <LucideIcon name="Search" size={14} />}
              >
                Search
              </Button>
            </Box>
          </Box>

          {totalCount === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No Backlog, To Do, or Dev In Progress tickets are currently assigned to you.
            </Typography>
          )}

          {totalCount > 0 && onlyCurrentSprint && visibleTotalCount === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              None of your open tickets are in the current sprint{currentSprintName ? ` (${currentSprintName})` : ''}.
            </Typography>
          )}

          {totalCount > 0 && visibleTotalCount > 0 && (
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 0.5 }}>
              {statuses.map((status) => {
                const items = visibleGrouped[status] || [];
                return (
                  <Box
                    key={status}
                    sx={{
                      flex: '1 1 0',
                      minWidth: 260,
                      display: 'flex',
                      flexDirection: 'column',
                      bgcolor: 'rgba(255,255,255,0.012)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 2,
                      maxHeight: '65vh',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.25, borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                      <Chip label={status} size="small" color={getStatusColor(status)} sx={{ fontWeight: 700, textTransform: 'uppercase' }} />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>{items.length}</Typography>
                    </Box>

                    <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
                      {items.length === 0 && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
                          No tickets
                        </Typography>
                      )}
                      {items.map((t: any) => (
                        <Box
                          key={t.key}
                          onClick={() => openTicketDetails(t.key)}
                          sx={{
                            p: 1.25,
                            bgcolor: 'rgba(255,255,255,0.02)',
                            border: '1px solid',
                            borderColor: selectedKey === t.key ? 'primary.main' : 'rgba(255,255,255,0.06)',
                            borderRadius: 1.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.75,
                            cursor: 'pointer',
                            transition: 'border-color 0.12s ease',
                            '&:hover': { borderColor: 'primary.main' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Chip label={t.key} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: '0.68rem' }} />
                            {t.priority && <Chip label={t.priority} size="small" color={getPriorityColor(t.priority)} sx={{ height: 20, fontSize: '0.65rem' }} />}
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{ fontSize: '0.8rem', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                          >
                            {t.summary}
                          </Typography>
                          {t.url && (
                            <Button
                              size="small"
                              variant="text"
                              component="a"
                              href={t.url}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              endIcon={<LucideIcon name="ExternalLink" size={12} />}
                              sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0.5, fontSize: '0.7rem' }}
                            >
                              Open
                            </Button>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Ticket Details - opens below the board when a card (or the search box) is used */}
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

              {loadingSelected && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                  <CircularProgress size={28} />
                </Box>
              )}

              {!loadingSelected && selectedError && (
                <Typography variant="body2" sx={{ color: 'error.main', p: 2 }}>{selectedError}</Typography>
              )}

              {!loadingSelected && selectedTicket && (
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Chip
                      label={selectedTicket.status}
                      size="small"
                      color={getStatusColor(selectedTicket.status)}
                      onClick={openStatusMenu}
                      onDelete={openStatusMenu}
                      deleteIcon={updatingStatus ? <CircularProgress size={12} color="inherit" /> : <LucideIcon name="ChevronDown" size={14} />}
                      sx={{ fontWeight: 600, cursor: 'pointer' }}
                    />
                    {selectedTicket.priority && <Chip label={selectedTicket.priority} size="small" color={getPriorityColor(selectedTicket.priority)} sx={{ fontWeight: 600 }} />}
                    {selectedTicket.issue_type && <Chip label={selectedTicket.issue_type} size="small" variant="outlined" />}
                    {selectedTicket.story_points > 0 && <Chip label={`${selectedTicket.story_points} SP`} size="small" variant="outlined" />}
                  </Stack>

                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{selectedTicket.summary}</Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={8}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1 }}>Description</Typography>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 2,
                          maxHeight: 220,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.85rem',
                          lineHeight: 1.6,
                        }}
                      >
                        {selectedTicket.description || 'No description provided.'}
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Assignee</Typography>
                          <Box
                            onClick={openAssigneeMenu}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', borderRadius: 1, px: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
                          >
                            <Avatar sx={{ width: 22, height: 22, fontSize: '0.68rem', bgcolor: 'primary.dark' }}>
                              {selectedTicket.assignee ? selectedTicket.assignee.charAt(0) : 'U'}
                            </Avatar>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedTicket.assignee || 'Unassigned'}</Typography>
                            {updatingAssignee ? <CircularProgress size={12} /> : <LucideIcon name="ChevronDown" size={14} />}
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Reporter</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedTicket.reporter || 'Unknown'}</Typography>
                        </Box>
                        {selectedTicket.sprint && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sprint</Typography>
                            <Chip label={selectedTicket.sprint} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.7rem' }} />
                          </Box>
                        )}
                        {selectedTicket.labels?.length > 0 && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Labels</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {selectedTicket.labels.map((label: string, idx: number) => (
                                <Chip key={idx} label={label} size="small" sx={{ fontSize: '0.68rem', height: 18, bgcolor: 'rgba(255,255,255,0.06)' }} />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  </Grid>

                  <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', pt: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                      <Tabs value={selectedTab} onChange={(_, val) => setSelectedTab(val)} sx={{ minHeight: 36 }}>
                        <Tab label={`Comments (${(selectedTicket.comments || []).length})`} sx={{ fontWeight: 600, minHeight: 36 }} />
                        <Tab label={`Worklogs (${(selectedTicket.worklogs || []).length})`} sx={{ fontWeight: 600, minHeight: 36 }} />
                      </Tabs>
                      {selectedTab === 0 && (
                        <Button size="small" variant="outlined" startIcon={<LucideIcon name="MessageSquarePlus" size={14} />} onClick={() => setAddCommentOpen(true)}>
                          Add Comment
                        </Button>
                      )}
                      {selectedTab === 1 && (
                        <Button size="small" variant="outlined" startIcon={<LucideIcon name="CalendarPlus" size={14} />} onClick={() => setAddWorklogOpen(true)}>
                          Add Worklog
                        </Button>
                      )}
                    </Box>

                    <Box sx={{ pt: 2 }}>
                      {selectedTab === 0 && (
                        (selectedTicket.comments || []).length === 0 ? (
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>No comments posted on this ticket.</Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {selectedTicket.comments.map((c: any, idx: number) => (
                              <Box key={c.id || idx} sx={{ display: 'flex', gap: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>{c.author ? c.author.charAt(0) : 'A'}</Avatar>
                                <Box sx={{ flexGrow: 1 }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.author}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{c.created ? new Date(c.created).toLocaleString() : ''}</Typography>
                                  </Box>
                                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.body}</Typography>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        )
                      )}

                      {selectedTab === 1 && (
                        (selectedTicket.worklogs || []).length === 0 ? (
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>No work logged on this ticket yet.</Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {selectedTicket.worklogs.map((wl: any, idx: number) => (
                              <Box key={wl.id || idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Logged {wl.time_spent}</Typography>
                                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.5 }}>{wl.comment || 'No description provided.'}</Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>Logged by: <b>{wl.author || 'Unknown'}</b></Typography>
                                </Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{wl.started ? new Date(wl.started).toLocaleString() : ''}</Typography>
                              </Box>
                            ))}
                          </Box>
                        )
                      )}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </CardContent>

        <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => setStatusAnchor(null)}>
          {loadingTransitions ? (
            <MenuItem disabled>
              <CircularProgress size={14} sx={{ mr: 1 }} /> Loading statuses...
            </MenuItem>
          ) : transitions.length === 0 ? (
            <MenuItem disabled>No status changes available</MenuItem>
          ) : (
            transitions.map((t) => (
              <MenuItem key={t.id} onClick={() => handleTransition(t)} disabled={updatingStatus}>
                {t.name}
              </MenuItem>
            ))
          )}
        </Menu>

        <Menu anchorEl={assigneeAnchor} open={!!assigneeAnchor} onClose={() => setAssigneeAnchor(null)}>
          <Box sx={{ px: 1.5, py: 1, width: 240 }}>
            <TextField
              fullWidth
              size="small"
              autoFocus
              placeholder="Search people..."
              value={assigneeQuery}
              onChange={(e) => handleAssigneeQueryChange(e.target.value)}
            />
          </Box>
          {loadingAssignable ? (
            <MenuItem disabled>
              <CircularProgress size={14} sx={{ mr: 1 }} /> Searching...
            </MenuItem>
          ) : assignableUsers.length === 0 ? (
            <MenuItem disabled>No matching users</MenuItem>
          ) : (
            assignableUsers.map((u) => (
              <MenuItem key={u.account_id} onClick={() => handleAssign(u)} disabled={updatingAssignee}>
                <Avatar src={u.avatar_url} sx={{ width: 22, height: 22, fontSize: '0.65rem', mr: 1 }}>
                  {u.display_name.charAt(0)}
                </Avatar>
                {u.display_name}
              </MenuItem>
            ))
          )}
        </Menu>

        <Dialog open={addCommentOpen} onClose={() => setAddCommentOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Comment</DialogTitle>
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

        <Dialog open={addWorklogOpen} onClose={() => setAddWorklogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Worklog</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Time Spent"
              placeholder="e.g. 2h 30m, 45m"
              value={worklogTimeSpent}
              onChange={(e) => setWorklogTimeSpent(e.target.value)}
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              placeholder="Describe what tasks were completed..."
              value={worklogComment}
              onChange={(e) => setWorklogComment(e.target.value)}
            />
            <TextField
              fullWidth
              type="datetime-local"
              label="Started Date"
              InputLabelProps={{ shrink: true }}
              value={worklogStarted}
              onChange={(e) => setWorklogStarted(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddWorklogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAddWorklog} disabled={submittingWorklog || !worklogTimeSpent.trim()}>
              {submittingWorklog ? <CircularProgress size={16} /> : 'Submit'}
            </Button>
          </DialogActions>
        </Dialog>
      </Card>
    );
  }

  if (serviceId === 'jira-time-tracker') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LucideIcon name="Clock" /> Time Tracking Summary
          </Typography>
          <Grid container spacing={3}>
            {[
              { label: 'TODAY', value: response.today_hours, limit: 8, color: '#3b82f6' },
              { label: 'WEEK', value: response.week_hours, limit: 40, color: '#10b981' },
              { label: 'MONTH', value: response.month_hours, limit: 160, color: '#8b5cf6' },
              { label: 'REMAINING', value: response.remaining_hours, limit: 40, color: '#f59e0b', subtext: 'Target week limit' }
            ].map((card, idx) => {
              const percentage = Math.min(100, Math.round((card.value / card.limit) * 100));
              return (
                <Grid item xs={12} sm={6} md={3} key={idx}>
                  <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{card.label}</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{card.value}h</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <LinearProgress variant="determinate" value={percentage} sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: card.color } }} />
                      <Typography variant="caption" sx={{ minWidth: 24, textAlign: 'right', fontWeight: 600 }}>{percentage}%</Typography>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // JIRA - SPRINT BOARD ANALYTICS
  // ----------------------------------------------------
  if (serviceId === 'jira-sprint-board') {
    const spDone = response.story_points_done || 0;
    const spTotal = response.story_points_total || 0;
    const completionRate = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;

    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LucideIcon name="BarChart4" /> Sprint Analytics: {response.sprint_name}
            </Typography>
            <Chip label={response.sprint_status} color="success" size="small" sx={{ fontWeight: 600, textTransform: 'uppercase' }} />
          </Box>

          <Box sx={{ p: 2.5, bgcolor: 'rgba(59, 130, 246, 0.02)', border: '1px solid rgba(59, 130, 246, 0.08)', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Story Points Completion</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{response.burndown_summary}</Typography>
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{completionRate}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={completionRate} sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { borderRadius: 5 } }} />
          </Box>

          <Grid container spacing={2}>
            {[
              { title: 'TO DO', count: response.backlog_count, color: 'warning', icon: 'FileText' },
              { title: 'IN PROGRESS', count: response.in_progress_count, color: 'primary', icon: 'Clock' },
              { title: 'DONE', count: response.done_count, color: 'success', icon: 'CheckCircle2' }
            ].map((col, idx) => (
              <Grid item xs={12} md={4} key={idx}>
                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1, borderRadius: '8px', bgcolor: `rgba(255,255,255,0.03)`, color: `${col.color}.main` }}>
                      <LucideIcon name={col.icon} size={18} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>{col.title}</Typography>
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{col.count} issues</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // GITHUB - VIEW PR
  // ----------------------------------------------------
  if (serviceId === 'github-view-pr') {
    const reviews = response.reviews || [];

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* PR Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: 'rgba(168, 85, 247, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="GitPullRequest" size={20} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  PR #{response.number}: {response.title}
                </Typography>
              </Box>
              <Chip label={response.state} color={getStatusColor(response.state)} size="small" sx={{ fontWeight: 600, textTransform: 'uppercase' }} />
            </Box>

            <Divider />

            {/* PR Metrics */}
            <Grid container spacing={2}>
              {[
                { label: 'Commits', value: response.commits, icon: 'GitCommit' },
                { label: 'Files Changed', value: response.changed_files, icon: 'FileDiff' },
                { label: 'Additions', value: `+${response.additions}`, icon: 'PlusCircle', color: 'success.main' },
                { label: 'Deletions', value: `-${response.deletions}`, icon: 'MinusCircle', color: 'error.main' }
              ].map((m, idx) => (
                <Grid item xs={6} sm={3} key={idx}>
                  <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{m.label}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: m.color || 'text.primary' }}>{m.value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>

            {/* Merge Status & Link */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LucideIcon name={response.mergeable ? 'CheckCircle2' : 'AlertTriangle'} size={18} className={response.mergeable ? 'text-green-500' : 'text-yellow-500'} />
                <Typography variant="body2">
                  {response.mergeable ? 'This branch has no conflicts and is mergeable.' : 'Conflicts detected, cannot merge automatically.'}
                </Typography>
              </Box>
              {response.html_url && (
                <Button size="small" variant="contained" component="a" href={response.html_url} target="_blank" endIcon={<LucideIcon name="ExternalLink" size={12} />}>
                  Open GitHub PR
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* PR Reviews Card */}
        <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <LucideIcon name="CheckSquare" /> Approvals & Reviews ({reviews.length})
            </Typography>
            {reviews.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', py: 1, textAlign: 'center' }}>
                No review comments submitted yet.
              </Typography>
            ) : (
              reviews.map((r: any, idx: number) => (
                <Box key={idx} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: 'primary.dark' }}>
                        {r.user.charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.user}</Typography>
                    </Box>
                    <Chip label={r.state} size="small" color={getStatusColor(r.state)} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', pl: 4, fontStyle: r.comment ? 'normal' : 'italic' }}>
                    {r.comment || 'No comment provided.'}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ----------------------------------------------------
  // CRM - FRANCHISE CREATION SUCCESS
  // ----------------------------------------------------
  if (serviceId === 'crm-franchise-creation') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="Store" size={22} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.light' }}>Franchise Created</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Onboarded new franchise node</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>FRANCHISE ID</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>#{response.id}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>NAME</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.name}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>LOCATION</Typography>
              <Typography variant="body2">{response.location}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>EMAIL</Typography>
              <Typography variant="body2">{response.email}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>PHONE</Typography>
              <Typography variant="body2">{response.phone}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // CRM - RESELLER CREATION SUCCESS
  // ----------------------------------------------------
  if (serviceId === 'crm-reseller-creation') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="UserPlus" size={22} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.light' }}>Reseller Onboarding Successful</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Tax records and credentials generated</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>RESELLER ID</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>#{response.id}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>TAX REGISTER ID</Typography>
              <Chip label={response.tax_id} size="small" color="primary" sx={{ mt: 0.5, fontSize: '0.75rem', fontWeight: 600 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>COMPANY NAME</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.company_name}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>EMAIL</Typography>
              <Typography variant="body2">{response.email}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>PHONE</Typography>
              <Typography variant="body2">{response.phone}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // CRM - ORDER LOOKUP RESULTS TABLE
  // ----------------------------------------------------
  if (serviceId === 'crm-order-lookup') {
    const orders = Array.isArray(response) ? response : (response.data || []);

    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LucideIcon name="SearchCode" /> Order Lookup Results ({orders.length})
          </Typography>
          {orders.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
              No matching orders found in DB. Verify Order numbers (e.g. ORD-1001 to ORD-1005).
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Order ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Items</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Total</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((o: any, idx: number) => (
                    <TableRow key={o.order_number || idx} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' } }}>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.light' }}>{o.order_number}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell align="right">{o.items_count}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>${o.total_amount?.toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <Chip label={o.status} size="small" color={getStatusColor(o.status)} sx={{ fontSize: '0.75rem', fontWeight: 600 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                        {o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Today'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // CRM - SOCIAL POST MOCKUP PREVIEW
  // ----------------------------------------------------
  if (serviceId === 'crm-social-post') {
    const platform = response.platform || 'Twitter/X';
    const isTwitter = platform.toLowerCase().includes('twitter') || platform.toLowerCase().includes('x');
    const isLinkedIn = platform.toLowerCase().includes('linkedin');
    
    let platformBg = 'rgba(59, 130, 246, 0.1)';
    let platformColor = '#3b82f6';
    let platformIcon = 'Twitter';
    if (isLinkedIn) {
      platformBg = 'rgba(10, 102, 194, 0.1)';
      platformColor = '#0a66c2';
      platformIcon = 'Linkedin';
    } else if (platform.toLowerCase().includes('facebook')) {
      platformBg = 'rgba(24, 119, 242, 0.1)';
      platformColor = '#1877f2';
      platformIcon = 'Facebook';
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
        {/* Receipt Header */}
        <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)' }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="Share2" size={22} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.light' }}>Post Scheduled Successfully</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Integration API reported code 201</Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={1}>
              <Chip label={response.status} color={getStatusColor(response.status)} size="small" sx={{ fontWeight: 700 }} />
              {response.scheduled_time && (
                <Chip label={`Scheduled: ${new Date(response.scheduled_time).toLocaleString()}`} variant="outlined" size="small" />
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Realistic Mock Preview Card */}
        <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
              <LucideIcon name="Eye" size={16} /> Live Platform Preview
            </Typography>

            <Box sx={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, p: 2.5, bgcolor: '#0b0f19', maxWidth: '550px', mx: 'auto', width: '100%' }}>
              {/* Header inside Preview */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Avatar sx={{ bgcolor: platformColor, width: 40, height: 40, fontWeight: 700 }}>
                    AN
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Anboli.m <Chip label="Author" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.08)' }} />
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      @anboli_dev • {response.scheduled_time ? 'Scheduled' : 'Just now'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: platformBg, color: platformColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name={platformIcon} size={15} />
                </Box>
              </Box>

              {/* Preview Content */}
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2, lineHeight: 1.6, fontSize: '0.95rem' }}>
                {response.content}
              </Typography>

              {/* Preview Media Attachment if present */}
              {response.media_url && (
                <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', mb: 2, maxHeight: '280px' }}>
                  <Box component="img" src={response.media_url} alt="Attachment Preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: any) => { e.target.style.display = 'none'; }} />
                </Box>
              )}

              {/* Interactive Dummy Footer */}
              <Divider sx={{ mb: 1, borderColor: 'rgba(255,255,255,0.03)' }} />
              {isTwitter ? (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, color: 'text.secondary', fontSize: '0.75rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="MessageSquare" size={14} /> 0</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="Repeat" size={14} /> 0</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="Heart" size={14} /> 0</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="Share" size={14} /></Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 4, px: 1, color: 'text.secondary', fontSize: '0.8rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="ThumbsUp" size={14} /> Like</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="MessageSquare" size={14} /> Comment</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LucideIcon name="Share2" size={14} /> Share</Box>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }


  // ----------------------------------------------------
  // ITSM - RAISE REQUEST SUCCESS RECEIPT
  // ----------------------------------------------------
  if (serviceId === 'itsm-raise-request') {
    return (
      <Card className="glass-panel" sx={{ borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.15)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(16, 185, 129, 0.1)', color: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="FilePlus2" size={22} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'secondary.light' }}>ITSM Request Submitted</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Service ticket raised successfully</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>REQUEST ID</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.id}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>CATEGORY</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.category}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>PRIORITY</Typography>
              <Chip label={response.priority} size="small" color={getPriorityColor(response.priority)} sx={{ mt: 0.5, fontWeight: 600 }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>STATUS</Typography>
              <Chip label={response.status} size="small" color={getStatusColor(response.status)} sx={{ mt: 0.5, fontWeight: 600 }} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>TITLE</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{response.title}</Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>DESCRIPTION</Typography>
              <Box sx={{ mt: 0.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                {response.description}
              </Box>
            </Grid>
            {response.attachments && response.attachments.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>ATTACHED FILES</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {response.attachments.map((file: string, i: number) => (
                    <Chip key={i} label={file} icon={<LucideIcon name="Paperclip" size={12} />} size="small" variant="outlined" />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------------------
  // DEFAULT / FALLBACK (Plain object key/value list)
  // ----------------------------------------------------
  return (
    <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Execution Details</Typography>
        <Box component="pre" className="mono-font" sx={{ p: 2, bgcolor: '#0b0f19', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2, overflowX: 'auto', fontSize: '0.8rem', m: 0 }}>
          {JSON.stringify(response, null, 2)}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ServiceResultViews;
