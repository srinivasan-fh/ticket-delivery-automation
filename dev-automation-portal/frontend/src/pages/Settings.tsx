import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Divider, TextField, Button, Grid, Chip, Alert, CircularProgress } from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';
import { settingsApi } from '../services/api';
import { useStore } from '../store/useStore';


export const Settings: React.FC = () => {
  const { addNotification } = useStore();
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getSettings();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load portal configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFieldChange = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const secretPlaceholder = (field: string) =>
    config[`${field}_configured`] ? 'Configured — leave blank to keep current value' : 'Not configured';

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await settingsApi.updateSettings(config);
      setSaveSuccess(true);
      addNotification('Settings Saved', 'Environment variables written back to .env successfully', 'success');
      // reload settings to see updated mask values
      await fetchSettings();
    } catch (err: any) {
      addNotification('Settings Error', err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Export configurations as JSON
  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'devportal_config_export.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addNotification('Settings Exported', 'Configuration JSON downloaded', 'info');
  };

  // Import configurations from JSON file
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target?.result as string;
        try {
          const parsed = JSON.parse(text);
          setConfig((prev) => ({ ...prev, ...parsed }));
          addNotification('Config Imported', 'Configuration loaded. Click Save changes to write to disk.', 'info');
        } catch (err) {
          addNotification('Import Error', 'Failed to parse JSON file', 'error');
        }
      };
      reader.readAsText(file);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            API Integrations & Credentials
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Configure target base URLs and personal authentication credentials. Values are written back to your local <code>.env</code> file.
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<LucideIcon name="Download" />} onClick={handleExport}>
            Export Config
          </Button>
          <Button variant="outlined" component="label" startIcon={<LucideIcon name="Upload" />}>
            Import Config
            <input type="file" accept=".json" hidden onChange={handleImport} />
          </Button>
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" onClose={() => setSaveSuccess(false)} sx={{ borderRadius: 2 }}>
          Credentials updated successfully! Runtime modules reloaded.
        </Alert>
      )}

      {/* Grid panels */}
      <Grid container spacing={3.5}>
        {/* JIRA Config */}
        <Grid item xs={12} md={6}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LucideIcon name="Ticket" className="text-blue-500" /> JIRA Cloud API
                </Typography>
                <Chip
                  label={config.is_jira_configured ? 'Configured' : 'Using Simulation'}
                  color={config.is_jira_configured ? 'success' : 'default'}
                  size="small"
                  variant="outlined"
                />
              </Box>
              <Divider />
              <TextField
                fullWidth
                label="JIRA Base URL"
                placeholder="https://your-domain.atlassian.net"
                value={config.JIRA_BASE_URL}
                onChange={(e) => handleFieldChange('JIRA_BASE_URL', e.target.value)}
              />
              <TextField
                fullWidth
                label="JIRA Login Email"
                placeholder="email@company.com"
                value={config.JIRA_EMAIL}
                onChange={(e) => handleFieldChange('JIRA_EMAIL', e.target.value)}
              />
              <TextField
                fullWidth
                type="password"
                label="JIRA API Token"
                placeholder={secretPlaceholder('JIRA_API_TOKEN')}
                value={config.JIRA_API_TOKEN}
                onChange={(e) => handleFieldChange('JIRA_API_TOKEN', e.target.value)}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* GitHub Config */}
        <Grid item xs={12} md={6}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LucideIcon name="GitPullRequest" className="text-purple-500" /> GitHub Operations
                </Typography>
                <Chip
                  label={config.is_github_configured ? 'Configured' : 'Using Simulation'}
                  color={config.is_github_configured ? 'success' : 'default'}
                  size="small"
                  variant="outlined"
                />
              </Box>
              <Divider />
              <TextField
                fullWidth
                type="password"
                label="Personal Access Token (PAT)"
                placeholder={secretPlaceholder('GITHUB_TOKEN')}
                value={config.GITHUB_TOKEN}
                onChange={(e) => handleFieldChange('GITHUB_TOKEN', e.target.value)}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Repository Owner"
                    placeholder="e.g. octopus-deploy"
                    value={config.GITHUB_OWNER}
                    onChange={(e) => handleFieldChange('GITHUB_OWNER', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Repository Name"
                    placeholder="e.g. main-portal"
                    value={config.GITHUB_REPO}
                    onChange={(e) => handleFieldChange('GITHUB_REPO', e.target.value)}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* DevOps Config */}
        <Grid item xs={12} md={6}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LucideIcon name="Cpu" className="text-emerald-500" /> Jenkins & Octopus CI/CD
                </Typography>
                <Chip
                  label={config.is_jenkins_configured || config.is_octopus_configured ? 'Configured' : 'Using Simulation'}
                  color={config.is_jenkins_configured || config.is_octopus_configured ? 'success' : 'default'}
                  size="small"
                  variant="outlined"
                />
              </Box>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Jenkins Server</Typography>
              <TextField
                fullWidth
                label="Jenkins Base URL"
                placeholder="http://localhost:8080"
                value={config.JENKINS_URL}
                onChange={(e) => handleFieldChange('JENKINS_URL', e.target.value)}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Jenkins User"
                    value={config.JENKINS_USER}
                    onChange={(e) => handleFieldChange('JENKINS_USER', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="password"
                    label="API Token"
                    placeholder={secretPlaceholder('JENKINS_TOKEN')}
                    value={config.JENKINS_TOKEN}
                    onChange={(e) => handleFieldChange('JENKINS_TOKEN', e.target.value)}
                  />
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>Octopus Deploy</Typography>
              <TextField
                fullWidth
                label="Octopus Server URL"
                placeholder="http://localhost:8085"
                value={config.OCTOPUS_URL}
                onChange={(e) => handleFieldChange('OCTOPUS_URL', e.target.value)}
              />
              <TextField
                fullWidth
                type="password"
                label="Octopus API Key"
                placeholder={secretPlaceholder('OCTOPUS_API_KEY')}
                value={config.OCTOPUS_API_KEY}
                onChange={(e) => handleFieldChange('OCTOPUS_API_KEY', e.target.value)}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* ITSM & CRM Configurations */}
        <Grid item xs={12} md={6}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LucideIcon name="Store" className="text-amber-500" /> ITSM & BOB CRM
              </Typography>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>BOB CRM Integration</Typography>
              <TextField
                fullWidth
                label="CRM Base URL"
                value={config.CRM_BASE_URL}
                onChange={(e) => handleFieldChange('CRM_BASE_URL', e.target.value)}
              />
              <TextField
                fullWidth
                type="password"
                label="CRM API Key"
                placeholder={secretPlaceholder('CRM_API_KEY')}
                value={config.CRM_API_KEY}
                onChange={(e) => handleFieldChange('CRM_API_KEY', e.target.value)}
              />

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>ITSM Service Portal</Typography>
              <TextField
                fullWidth
                label="ITSM Base URL"
                value={config.ITSM_BASE_URL}
                onChange={(e) => handleFieldChange('ITSM_BASE_URL', e.target.value)}
              />
              <TextField
                fullWidth
                type="password"
                label="ITSM API Key"
                placeholder={secretPlaceholder('ITSM_API_KEY')}
                value={config.ITSM_API_KEY}
                onChange={(e) => handleFieldChange('ITSM_API_KEY', e.target.value)}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Footer */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
        <Button variant="outlined" onClick={fetchSettings}>
          Reset Changes
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : <LucideIcon name="Save" />}
          sx={{ px: 4, fontWeight: 700 }}
        >
          {saving ? 'Saving changes...' : 'Save credentials'}
        </Button>
      </Box>
    </Box>
  );
};

export default Settings;
