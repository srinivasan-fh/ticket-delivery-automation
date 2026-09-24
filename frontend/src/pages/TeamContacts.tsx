import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, IconButton,
  CircularProgress, Alert, Divider,
} from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { teamContactsApi, TeamContact } from '../services/api';
import { useStore } from '../store/useStore';

interface ContactListEditorProps {
  title: string;
  description: string;
  contacts: TeamContact[];
  onChange: (contacts: TeamContact[]) => void;
}

const ContactListEditor: React.FC<ContactListEditorProps> = ({ title, description, contacts, onChange }) => {
  const updateAt = (idx: number, field: 'name' | 'email', value: string) => {
    onChange(contacts.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };
  const removeAt = (idx: number) => onChange(contacts.filter((_, i) => i !== idx));
  const add = () => onChange([...contacts, { name: '', email: '' }]);

  return (
    <Card className="glass-panel" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{description}</Typography>
        </Box>
        <Divider />
        {contacts.map((c, idx) => (
          <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Name"
              value={c.name}
              onChange={(e) => updateAt(idx, 'name', e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Email"
              value={c.email}
              onChange={(e) => updateAt(idx, 'email', e.target.value)}
              sx={{ flex: 1 }}
            />
            <IconButton size="small" color="error" onClick={() => removeAt(idx)}>
              <LucideIcon name="Trash2" size={16} />
            </IconButton>
          </Box>
        ))}
        <Button size="small" variant="outlined" startIcon={<LucideIcon name="Plus" size={14} />} onClick={add} sx={{ alignSelf: 'flex-start' }}>
          Add
        </Button>
      </CardContent>
    </Card>
  );
};

export const TeamContacts: React.FC = () => {
  const { addNotification } = useStore();
  const [qaAssignees, setQaAssignees] = useState<TeamContact[]>([]);
  const [approvalPeers, setApprovalPeers] = useState<TeamContact[]>([]);
  const [prReviewer, setPrReviewer] = useState<TeamContact>({ name: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    teamContactsApi.get()
      .then((res: any) => {
        setQaAssignees(res.qa_assignees || []);
        setApprovalPeers(res.approval_peers || []);
        setPrReviewer(res.pr_reviewer || { name: '', email: '' });
      })
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load team contacts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = () => {
    setSaving(true);
    const clean = (list: TeamContact[]) => list.filter((c) => c.name.trim() && c.email.trim());
    teamContactsApi.update({
      qa_assignees: clean(qaAssignees),
      approval_peers: clean(approvalPeers),
      pr_reviewer: prReviewer.name.trim() && prReviewer.email.trim() ? prReviewer : null,
    })
      .then((res: any) => {
        setQaAssignees(res.qa_assignees || []);
        setApprovalPeers(res.approval_peers || []);
        setPrReviewer(res.pr_reviewer || { name: '', email: '' });
        addNotification('Team Contacts Saved', 'Written to backend/.env - takes effect immediately, no restart needed.', 'success');
      })
      .catch((err) => addNotification('Save Failed', err.response?.data?.detail || err.message, 'error'))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Team Contacts
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Add or remove entries freely - no fixed limit. Changes write straight to <code>backend/.env</code> and take effect immediately.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <ContactListEditor
        title="QA Assignees"
        description="Radio choices on the Push to QA page - who a ticket can be reassigned to."
        contacts={qaAssignees}
        onChange={setQaAssignees}
      />

      <ContactListEditor
        title="Approval Peers"
        description="Pinged via Cliq when the Open PR Dashboard's Approval button is clicked (BOB-CRM only pings entries 2 and 3)."
        contacts={approvalPeers}
        onChange={setApprovalPeers}
      />

      <Card className="glass-panel" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>PR Reviewer</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Who gets pinged when the Open PR Dashboard's Review button is clicked.
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              size="small"
              label="Name"
              value={prReviewer.name}
              onChange={(e) => setPrReviewer({ ...prReviewer, name: e.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Email"
              value={prReviewer.email}
              onChange={(e) => setPrReviewer({ ...prReviewer, email: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" onClick={load}>Reset Changes</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : <LucideIcon name="Save" size={16} />}
        >
          {saving ? 'Saving...' : 'Save Contacts'}
        </Button>
      </Box>
    </Box>
  );
};

export default TeamContacts;
