import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, FormControl, InputLabel, Select, MenuItem, Grid, Button, CircularProgress } from '@mui/material';
import LucideIcon from '../components/ui/LucideIcon';

import LogViewer from '../components/LogViewer';
import { systemLogsApi } from '../services/api';
import { APILogItem } from '../types';

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<APILogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await systemLogsApi.getLogs({
        service: serviceFilter || undefined,
        status_code: statusFilter ? Number(statusFilter) : undefined,
        limit: 50
      });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load system logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [serviceFilter, statusFilter]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            Execution Logs & Audit History
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Inspect historical automated API requests, payloads, execution durations, and error responses.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<LucideIcon name="RefreshCw" />} onClick={fetchLogs}>
          Refresh logs
        </Button>
      </Box>

      {/* Filters Card */}
      <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
        <CardContent sx={{ p: 1, pb: '8px !important' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Service</InputLabel>
                <Select
                  value={serviceFilter}
                  label="Filter by Service"
                  onChange={(e) => setServiceFilter(e.target.value)}
                >
                  <MenuItem value="">All Services</MenuItem>
                  <MenuItem value="jira">JIRA</MenuItem>
                  <MenuItem value="github">GitHub</MenuItem>
                  <MenuItem value="jenkins">Jenkins</MenuItem>
                  <MenuItem value="octopus">Octopus Deploy</MenuItem>
                  <MenuItem value="crm">BOB CRM</MenuItem>
                  <MenuItem value="itsm">ITSM Portal</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Filter by Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  <MenuItem value="200">200 OK</MenuItem>
                  <MenuItem value="201">201 Created</MenuItem>
                  <MenuItem value="400">400 Bad Request</MenuItem>
                  <MenuItem value="404">404 Not Found</MenuItem>
                  <MenuItem value="500">500 Server Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Logs Presentation */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : logs.length === 0 ? (
        <Box sx={{ p: 6, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 3, color: 'text.secondary' }}>
          <LucideIcon name="Inbox" size={32} className="mx-auto mb-2 text-slate-400" />
          <Typography variant="body2">No execution logs match the selected filter criteria.</Typography>
        </Box>
      ) : (
        <LogViewer logs={logs} />
      )}
    </Box>
  );
};

export default Logs;
