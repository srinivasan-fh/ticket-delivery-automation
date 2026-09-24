import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, Collapse, IconButton, Button, Chip } from '@mui/material';
import LucideIcon from './ui/LucideIcon';
import { APILogItem } from '../types';

interface LogViewerProps {
  logs: APILogItem[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (logs.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <LucideIcon name="Terminal" size={28} className="mx-auto mb-2 text-slate-400" />
        <Typography variant="body2">No execution logs capture available for this run.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {logs.map((log) => {
        const isExpanded = expandedId === log.id;
        const success = log.status_code >= 200 && log.status_code < 300;
        
        return (
          <Card key={log.id} sx={{ bgcolor: 'rgba(15, 23, 42, 0.3)', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Box
              onClick={() => toggleExpand(log.id)}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                flexWrap: 'wrap',
                gap: 1.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' }
              }}
            >
              {/* Method & URL */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
                <Chip
                  label={log.method}
                  size="small"
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    height: 20,
                    bgcolor: log.method === 'GET' ? 'primary.main' : log.method === 'POST' ? 'secondary.main' : 'warning.main',
                    color: 'white'
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.primary', wordBreak: 'break-all' }}>
                  {log.endpoint}
                </Typography>
              </Box>

              {/* Status & Timing */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Chip
                  label={log.status_code || 'SIM'}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    height: 20,
                    bgcolor: success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: success ? 'success.main' : 'error.main',
                    border: '1px solid',
                    borderColor: success ? 'success.main' : 'error.main'
                  }}
                />
                
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  {Math.round(log.execution_time_ms)}ms
                </Typography>

                {log.is_simulated && (
                  <Chip
                    label="SIMULATED"
                    size="small"
                    variant="outlined"
                    color="secondary"
                    sx={{ fontSize: '8px', height: 16 }}
                  />
                )}

                <IconButton size="small">
                  <LucideIcon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={16} />
                </IconButton>
              </Box>
            </Box>

            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              <CardContent sx={{ p: 2, pt: 0, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.2)' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1.5 }}>
                  {/* Timestamp */}
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      TIMESTAMP
                    </Typography>
                    <Typography variant="body2" className="mono-font" sx={{ fontSize: '0.8rem' }}>
                      {log.timestamp}
                    </Typography>
                  </Box>

                  {/* Request payload */}
                  {log.payload && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          REQUEST PAYLOAD
                        </Typography>
                        <Button size="small" variant="text" onClick={() => copyToClipboard(log.payload || '')} sx={{ fontSize: '0.7rem', py: 0 }}>
                          Copy
                        </Button>
                      </Box>
                      <Box component="pre" className="mono-font" sx={{ p: 1.5, bgcolor: '#0b0f19', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 1.5, overflowX: 'auto', fontSize: '0.75rem', m: 0, maxH: 150 }}>
                        {JSON.stringify(JSON.parse(log.payload), null, 2)}
                      </Box>
                    </Box>
                  )}

                  {/* Response Body */}
                  {log.response_body && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          RESPONSE BODY
                        </Typography>
                        <Button size="small" variant="text" onClick={() => copyToClipboard(log.response_body || '')} sx={{ fontSize: '0.7rem', py: 0 }}>
                          Copy
                        </Button>
                      </Box>
                      <Box component="pre" className="mono-font" sx={{ p: 1.5, bgcolor: '#0b0f19', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 1.5, overflowX: 'auto', fontSize: '0.75rem', m: 0, maxH: 250 }}>
                        {log.response_body.startsWith('{') || log.response_body.startsWith('[') ? (
                          JSON.stringify(JSON.parse(log.response_body), null, 2)
                        ) : (
                          log.response_body
                        )}
                      </Box>
                    </Box>
                  )}

                  {/* Error Message */}
                  {log.error_message && (
                    <Box sx={{ p: 1.5, bgcolor: 'rgba(239, 68, 68, 0.05)', border: '1px solid', borderColor: 'error.main', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600, display: 'block', mb: 0.5 }}>
                        ERROR LOGGED
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'error.light', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {log.error_message}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Collapse>
          </Card>
        );
      })}
    </Box>
  );
};

export default LogViewer;
