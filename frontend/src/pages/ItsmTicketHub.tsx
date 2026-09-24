import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Tooltip, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, DialogContentText
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { itsmApi } from '../services/api';

interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  has_pending_approval: boolean;
}

const getPriorityColor = (priority: string = '') => {
  const p = priority.toLowerCase();
  if (p.includes('1') || p.includes('critical') || p.includes('highest')) return 'error';
  if (p.includes('2') || p.includes('high')) return 'warning';
  if (p.includes('3') || p.includes('medium')) return 'info';
  return 'default';
};

const getStatusColor = (status: string = '') => {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved') || s.includes('approved') || s.includes('completed')) return 'success';
  if (s.includes('approval')) return 'warning';
  if (s.includes('progress')) return 'primary';
  return 'default';
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const ItsmTicketHub: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Ticket | null>(null);
  const [commentTarget, setCommentTarget] = useState<Ticket | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadTickets = () => {
    setLoading(true);
    setError(null);
    itsmApi.getRecentTickets()
      .then((res) => setTickets(res.tickets || []))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load ITSM tickets'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const ticketId = approveTarget.id;
    setApproveTarget(null);
    setApprovingId(ticketId);
    try {
      await itsmApi.approveTicket(ticketId);
      loadTickets();
    } catch (err) {
      // Notification already surfaced globally by the axios interceptor in api.ts
    } finally {
      setApprovingId(null);
    }
  };

  const submitComment = async () => {
    if (!commentTarget || !commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await itsmApi.addTicketComment(commentTarget.id, commentBody.trim());
      setCommentTarget(null);
      setCommentBody('');
    } catch (err) {
      // Notification already surfaced globally by the axios interceptor in api.ts
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>ITSM Ticket Hub</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Recently requested ITSM tickets, ordered by created date. Approve or comment directly from here.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={loadTickets}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} /> : <LucideIcon name="RefreshCw" size={16} />}
        >
          Refresh
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <TableContainer component={Paper} className="glass-panel" sx={{ borderRadius: 3, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Ticket</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Priority</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.map((ticket) => {
                const isApproving = approvingId === ticket.id;
                return (
                  <TableRow key={ticket.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>{ticket.id}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{ticket.title}</Typography>
                      {ticket.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.3, maxWidth: 480 }}>
                          {ticket.description.length > 140 ? `${ticket.description.slice(0, 140)}...` : ticket.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={ticket.priority} size="small" color={getPriorityColor(ticket.priority)} sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={ticket.status} size="small" color={getStatusColor(ticket.status)} sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {formatDate(ticket.created_at)}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title={ticket.has_pending_approval ? 'Approve this ticket' : 'No approval action available for you on this ticket'}>
                          <span>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              disabled={!ticket.has_pending_approval || isApproving}
                              onClick={() => setApproveTarget(ticket)}
                              startIcon={isApproving ? <CircularProgress size={12} color="inherit" /> : <LucideIcon name="Check" size={14} />}
                            >
                              Approve
                            </Button>
                          </span>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => { setCommentTarget(ticket); setCommentBody(''); }}
                          startIcon={<LucideIcon name="MessageSquarePlus" size={14} />}
                        >
                          Add Comment
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    No tickets found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Approve confirmation */}
      <Dialog open={!!approveTarget} onClose={() => setApproveTarget(null)}>
        <DialogTitle>Approve ticket?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will approve <b>{approveTarget?.id}</b> - {approveTarget?.title} - and transition it forward in its workflow.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveTarget(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={confirmApprove} startIcon={<LucideIcon name="Check" size={14} />}>
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add comment popup */}
      <Dialog open={!!commentTarget} onClose={() => setCommentTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Add comment to {commentTarget?.id}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{commentTarget?.title}</Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            placeholder="Write a comment..."
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!commentBody.trim() || submittingComment}
            onClick={submitComment}
            startIcon={submittingComment ? <CircularProgress size={14} color="inherit" /> : <LucideIcon name="Send" size={14} />}
          >
            {submittingComment ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ItsmTicketHub;
