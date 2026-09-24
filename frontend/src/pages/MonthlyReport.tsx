import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Link as MuiLink,
} from '@mui/material';
import { jiraApi } from '../services/api';

interface MonthlyReportTicket {
  key: string;
  summary: string;
  status: string;
  issue_type?: string | null;
  updated?: string | null;
  created?: string | null;
  url?: string | null;
}

interface MonthlyReportBucket {
  label: string;
  count: number;
  tickets: MonthlyReportTicket[];
}

interface MonthlyReportData {
  month: string;
  is_simulated: boolean;
  buckets: Record<string, MonthlyReportBucket>;
}

const BUCKET_ORDER = ['completed', 'released', 'ready_for_testing', 'reopened', 'blocked', 'dev_in_progress', 'sit_issues', 'production_issues'];

const bucketColor = (key: string): string => {
  if (key === 'completed' || key === 'released') return '#22c55e';
  if (key === 'blocked' || key === 'sit_issues' || key === 'production_issues') return '#ef4444';
  if (key === 'reopened') return '#f59e0b';
  return '#3b82f6';
};

const formatMonthLabel = (month: string): string => {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export const MonthlyReport: React.FC = () => {
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    jiraApi.getMonthlyReport()
      .then((res: any) => setData(res.data || res))
      .catch((err) => setError(err.response?.data?.detail || err.message || 'Failed to load monthly report'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBucket) {
      detailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedBucket]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) return null;

  const selected = selectedBucket ? data.buckets[selectedBucket] : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          Monthly Report
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Your track record for {formatMonthLabel(data.month)} - click any count to see the ticket list.
        </Typography>
        {data.is_simulated && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Simulated mode - Jira isn't configured, so this only approximates status buckets (no dates, no SIT/Production counts).
          </Alert>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2.5 }}>
        {BUCKET_ORDER.map((key) => {
          const bucket = data.buckets[key];
          if (!bucket) return null;
          const isSelected = selectedBucket === key;
          return (
            <Card
              key={key}
              className="glass-panel"
              sx={{
                borderRadius: 3,
                border: isSelected ? `2px solid ${bucketColor(key)}` : '1px solid transparent',
              }}
            >
              <CardActionArea onClick={() => setSelectedBucket(key)} sx={{ height: '100%' }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center', py: 3 }}>
                  <Typography variant="h3" sx={{ fontWeight: 800, color: bucketColor(key) }}>
                    {bucket.count}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', fontWeight: 600 }}>
                    {bucket.label}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      {selected && (
        <Box ref={detailsPanelRef} sx={{ scrollMarginTop: '88px' }}>
          <Card className="glass-panel" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                {selected.label} ({selected.count})
              </Typography>
              {selected.tickets.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No tickets in this bucket for {formatMonthLabel(data.month)}.
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Key</TableCell>
                        <TableCell>Summary</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Updated</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selected.tickets.map((t) => (
                        <TableRow key={t.key} hover>
                          <TableCell>
                            {t.url ? (
                              <MuiLink href={t.url} target="_blank" rel="noopener noreferrer">{t.key}</MuiLink>
                            ) : t.key}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 400 }}>{t.summary}</TableCell>
                          <TableCell><Chip label={t.status} size="small" /></TableCell>
                          <TableCell>{t.issue_type || '-'}</TableCell>
                          <TableCell>{t.updated ? new Date(t.updated).toLocaleDateString() : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default MonthlyReport;
