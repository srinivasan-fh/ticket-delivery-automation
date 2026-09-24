import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Breadcrumbs, Link, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Card, CardContent, Divider,
  Grid, Chip, ToggleButtonGroup, ToggleButton, RadioGroup, Radio, FormControlLabel
} from '@mui/material';
import { SERVICES } from '../utils/servicesConfig';
import LucideIcon from '../components/ui/LucideIcon';
import LogViewer from '../components/LogViewer';
import ServiceResultViews from '../components/ServiceResultViews';
import {
  jiraApi, githubApi, crmApi, itsmApi, systemLogsApi
} from '../services/api';
import { useStore } from '../store/useStore';

// Accepts a bare ticket key ("RNMS-24580") or a pasted Jira URL containing one
const extractJiraKey = (input: string): string => {
  const match = input.match(/[A-Za-z][A-Za-z0-9]*-\d+/);
  return (match ? match[0] : input.trim()).toUpperCase();
};

export const ServiceRunner: React.FC = () => {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { addRecent } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const service = SERVICES.find((s) => s.id === serviceId);

  // Form states
  const [formData, setFormData] = useState<Record<string, any>>({});

  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  // Execution states
  const [executing, setExecuting] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [runLogs, setRunLogs] = useState<any[]>([]);
  const [qaAssignees, setQaAssignees] = useState<{ name: string; email: string }[]>([]);

  // Fetch dropdown collections when component mounts or service updates
  useEffect(() => {
    if (!service) return;
    setResponse(null);
    setError(null);
    setRunLogs([]);
    setFormData({});
    setFileToUpload(null);

    const loadMeta = async () => {
      try {
        if (serviceId === 'jira-open-tickets') {
          const tickets = await jiraApi.getMyOpenTickets();
          setResponse(tickets.data || tickets);
        }
        if (serviceId === 'jira-time-tracker') {
          const tracker = await jiraApi.getTimeTracker();
          setResponse(tracker);
        }
        if (serviceId === 'jira-sprint-board') {
          const board = await jiraApi.getSprintBoard();
          setResponse(board);
        }
        if (serviceId === 'jira-push-to-qa') {
          const assignees = await jiraApi.getQaAssignees();
          setQaAssignees(assignees || []);
        }
      } catch (err: any) {
        console.error('Failed to load page metadata:', err);
      }
    };

    loadMeta();
  }, [serviceId]);

  if (!service) {
    return (
      <Box sx={{ p: 4, textAlignment: 'center' }}>
        <Typography variant="h5" color="error">Service not found</Typography>
        <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 2 }}>Back to Dashboard</Button>
      </Box>
    );
  }

  // Handle standard form changes
  const handleInputChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Copy result json
  const handleCopyResult = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    }
  };

  // Download result json
  const handleDownloadResult = () => {
    if (response) {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(response, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${serviceId}_response.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  // ITSM Upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileToUpload(e.target.files[0]);
    }
  };

  // CSV Lookup parser helper
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          // parse order numbers from CSV lines
          const orderNumbers = text
            .split(/[\r\n,]+/)
            .map((item) => item.trim())
            .filter((item) => item.startsWith('ORD-'));
          
          if (orderNumbers.length > 0) {
            handleInputChange('order_numbers', orderNumbers.join(', '));
            useStore.getState().addNotification('CSV Parsed', `Loaded ${orderNumbers.length} orders from file.`, 'info');
          } else {
            setError('Could not extract any ORD-XXXX codes from CSV file.');
          }
        }
      };
      reader.readAsText(file);
    }
  };

  // Execute automation action
  const handleExecute = async () => {
    setExecuting(true);
    setResponse(null);
    setError(null);
    addRecent(service.id);

    const start = Date.now();
    try {
      let result: any = null;

      // Routing API actions depending on service ID
      switch (serviceId) {
        // JIRA
        case 'jira-view-ticket':
          result = await jiraApi.getTicket(formData.ticket_key ? extractJiraKey(formData.ticket_key) : 'PROJ-101');
          break;
        case 'jira-open-tickets':
          result = await jiraApi.getMyOpenTickets();
          break;
        case 'jira-add-worklog':
          result = await jiraApi.addWorklog({
            ticket_key: formData.ticket_key || '',
            time_spent: formData.time_spent || '',
            comment: formData.comment,
            started: formData.started ? new Date(formData.started).toISOString() : undefined,
          });
          break;
        case 'jira-delete-worklog':
          result = await jiraApi.deleteWorklog(formData.ticket_key || '', Number(formData.worklog_id));
          break;
        case 'jira-push-to-qa':
          const ticketUrl = formData.ticket_url || '';
          result = await jiraApi.pushToQa({
            ticket_key: extractJiraKey(ticketUrl),
            ticket_url: ticketUrl,
            environment: formData.environment || 'SIT',
            assignee_email: formData.qa_assignee_email || qaAssignees[0]?.email,
          });
          break;

        // GITHUB
        case 'github-view-pr':
          result = await githubApi.getPR(Number(formData.pr_number));
          break;
        // CRM
        case 'crm-franchise-creation':
          result = await crmApi.createFranchise({
            name: formData.name,
            location: formData.location,
            email: formData.email,
            phone: formData.phone,
          });
          break;
        case 'crm-reseller-creation':
          result = await crmApi.createReseller({
            company_name: formData.company_name,
            email: formData.email,
            phone: formData.phone,
            tax_id: formData.tax_id,
          });
          break;
        case 'crm-order-lookup':
          const orderNumbers = formData.order_numbers
            ? formData.order_numbers.split(',').map((o: string) => o.trim())
            : [];
          result = await crmApi.lookupOrders(orderNumbers);
          break;
        case 'crm-social-post':
          result = await crmApi.raiseSocialPost({
            platform: formData.platform || 'Twitter/X',
            content: formData.content,
            scheduled_time: formData.scheduled_time || undefined,
            media_url: formData.media_url || undefined,
          });
          break;

        // ITSM
        case 'itsm-raise-request':
          const fData = new FormData();
          fData.append('title', formData.title);
          fData.append('description', formData.description);
          fData.append('category', formData.category || 'General');
          fData.append('priority', formData.priority || 'Medium');
          if (fileToUpload) {
            fData.append('file', fileToUpload);
          }
          result = await itsmApi.raiseRequest(fData);
          break;

        default:
          throw new Error('Unsupported service automation run');
      }

      setResponse(result.data || result);
      setExecutionTime(result.execution_time_ms || (Date.now() - start));
      
      // Pull recent API execution logs from database for this service
      const dbLogs = await systemLogsApi.getLogs({ service: service.category, limit: 3 });
      setRunLogs(dbLogs);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Automation execution failed');
      // Still attempt to pull logs
      try {
        const dbLogs = await systemLogsApi.getLogs({ service: service.category, limit: 3 });
        setRunLogs(dbLogs);
      } catch (logErr) {}
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header and Breadcrumbs */}
      <Box>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
          <Link component={RouterLink} to="/" underline="hover" color="inherit">
            Dashboard
          </Link>
          <Link component={RouterLink} to={`/category/${service.category}`} underline="hover" color="inherit" sx={{ textTransform: 'capitalize' }}>
            {service.category}
          </Link>
          <Typography color="text.primary">{service.title}</Typography>
        </Breadcrumbs>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: 'rgba(59, 130, 246, 0.08)', color: 'primary.main', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <LucideIcon name={service.icon} size={22} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {service.title}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {service.description}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      <Grid container spacing={4}>
        {/* Left Side: Input Form - skipped entirely for jira-open-tickets, which is a single full-width board */}
        {serviceId !== 'jira-open-tickets' && (
        <Grid item xs={12} md={serviceId === 'jira-view-ticket' ? 3 : 12}>
          <Card className="glass-panel" sx={{ borderRadius: 3, p: 2 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: serviceId === 'jira-view-ticket' ? 1.5 : 2.5 }}>
              {serviceId !== 'jira-view-ticket' && (
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Automation Parameters
                </Typography>
              )}

              {/* Dynamic Inputs Render mapping the ServiceID */}

              {/* JIRA - View Ticket (compact: ticket key or URL, minimal chrome) */}
              {serviceId === 'jira-view-ticket' && (
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Ticket key or URL"
                  value={formData.ticket_key || ''}
                  onChange={(e) => handleInputChange('ticket_key', e.target.value)}
                />
              )}

              {/* JIRA - Add Worklog */}
              {serviceId === 'jira-add-worklog' && (
                <>
                  <TextField
                    fullWidth
                    label="Jira Ticket Key"
                    placeholder="e.g. PROJ-101"
                    value={formData.ticket_key || ''}
                    onChange={(e) => handleInputChange('ticket_key', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Time Spent"
                    placeholder="e.g. 2h 30m, 45m"
                    value={formData.time_spent || ''}
                    onChange={(e) => handleInputChange('time_spent', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Worklog Description"
                    placeholder="Describe what tasks were completed..."
                    value={formData.comment || ''}
                    onChange={(e) => handleInputChange('comment', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="Started Date"
                    InputLabelProps={{ shrink: true }}
                    value={formData.started || ''}
                    onChange={(e) => handleInputChange('started', e.target.value)}
                  />
                </>
              )}

              {/* JIRA - Delete Worklog */}
              {serviceId === 'jira-delete-worklog' && (
                <>
                  <TextField
                    fullWidth
                    label="Jira Ticket Key"
                    placeholder="e.g. PROJ-101"
                    value={formData.ticket_key || ''}
                    onChange={(e) => handleInputChange('ticket_key', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Worklog ID"
                    placeholder="e.g. 1"
                    value={formData.worklog_id || ''}
                    onChange={(e) => handleInputChange('worklog_id', e.target.value)}
                  />
                </>
              )}

              {/* JIRA - Push to QA */}
              {serviceId === 'jira-push-to-qa' && (
                <>
                  <TextField
                    fullWidth
                    label="Jira Ticket URL"
                    placeholder="e.g. https://your-domain.atlassian.net/browse/RNMS-1234"
                    value={formData.ticket_url || ''}
                    onChange={(e) => handleInputChange('ticket_url', e.target.value)}
                    helperText="Paste the full Jira ticket link"
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Environment
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={formData.environment || 'SIT'}
                        onChange={(_, value) => value && handleInputChange('environment', value)}
                      >
                        <ToggleButton value="SIT">SIT</ToggleButton>
                        <ToggleButton value="Pre-Prod">Pre-Prod</ToggleButton>
                        <ToggleButton value="PROD">PROD</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        QA Assignee
                      </Typography>
                      <RadioGroup
                        value={formData.qa_assignee_email || qaAssignees[0]?.email || ''}
                        onChange={(e) => handleInputChange('qa_assignee_email', e.target.value)}
                      >
                        {qaAssignees.length === 0 ? (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            No QA assignees configured - add some on the Team Contacts page.
                          </Typography>
                        ) : (
                          qaAssignees.map((opt) => (
                            <FormControlLabel key={opt.email} value={opt.email} control={<Radio size="small" />} label={opt.name} />
                          ))
                        )}
                      </RadioGroup>
                    </Box>
                  </Box>
                </>
              )}

              {/* GITHUB - View PR & Approve PR */}
              {serviceId === 'github-view-pr' && (
                <TextField
                  fullWidth
                  type="number"
                  label="PR Number"
                  placeholder="e.g. 101"
                  value={formData.pr_number || ''}
                  onChange={(e) => handleInputChange('pr_number', e.target.value)}
                  helperText="Default simulated PRs: 101, 102"
                />
              )}

              {/* CRM - Franchise */}
              {serviceId === 'crm-franchise-creation' && (
                <>
                  <TextField
                    fullWidth
                    label="Franchise Name"
                    placeholder="e.g. Franchise Alpha"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Location"
                    placeholder="e.g. Texas, USA"
                    value={formData.location || ''}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="email"
                    label="Email Address"
                    placeholder="e.g. franchise@domain.com"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Phone Number"
                    placeholder="e.g. +1-555-0199"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </>
              )}

              {/* CRM - Reseller */}
              {serviceId === 'crm-reseller-creation' && (
                <>
                  <TextField
                    fullWidth
                    label="Company Name"
                    placeholder="e.g. Tech Retailers Corp"
                    value={formData.company_name || ''}
                    onChange={(e) => handleInputChange('company_name', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="email"
                    label="Reseller Contact Email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Phone Number"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Reseller Tax ID"
                    placeholder="e.g. TAX-12345"
                    value={formData.tax_id || ''}
                    onChange={(e) => handleInputChange('tax_id', e.target.value)}
                  />
                </>
              )}

              {/* CRM - Order Lookup */}
              {serviceId === 'crm-order-lookup' && (
                <>
                  <TextField
                    fullWidth
                    label="Order IDs (comma separated)"
                    placeholder="e.g. ORD-1001, ORD-1002"
                    value={formData.order_numbers || ''}
                    onChange={(e) => handleInputChange('order_numbers', e.target.value)}
                    helperText="Valid mock IDs: ORD-1001 to ORD-1005"
                  />
                  
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
                    Bulk CSV Upload Option
                  </Typography>
                  <Button variant="outlined" component="label" startIcon={<LucideIcon name="UploadCloud" />}>
                    Upload Orders CSV
                    <input type="file" accept=".csv,.txt" hidden onChange={handleCsvUpload} />
                  </Button>
                </>
              )}

              {/* CRM - Social Media Post */}
              {serviceId === 'crm-social-post' && (
                <>
                  <FormControl fullWidth>
                    <InputLabel>Platform</InputLabel>
                    <Select
                      value={formData.platform || 'Twitter/X'}
                      label="Platform"
                      onChange={(e) => handleInputChange('platform', e.target.value)}
                    >
                      <MenuItem value="Twitter/X">Twitter/X</MenuItem>
                      <MenuItem value="LinkedIn">LinkedIn</MenuItem>
                      <MenuItem value="Facebook">Facebook</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    inputProps={{ maxLength: 280 }}
                    label="Post Content"
                    placeholder="Write copy for social post (max 280 characters)..."
                    value={formData.content || ''}
                    onChange={(e) => handleInputChange('content', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label="Schedule Post Time (Optional)"
                    InputLabelProps={{ shrink: true }}
                    value={formData.scheduled_time || ''}
                    onChange={(e) => handleInputChange('scheduled_time', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Media Attachment URL (Optional)"
                    placeholder="e.g. https://domain.com/banner.png"
                    value={formData.media_url || ''}
                    onChange={(e) => handleInputChange('media_url', e.target.value)}
                  />
                </>
              )}

              {/* ITSM - Raise Request */}
              {serviceId === 'itsm-raise-request' && (
                <>
                  <TextField
                    fullWidth
                    label="Request Title"
                    placeholder="e.g. Software access request"
                    value={formData.title || ''}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                  />
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Detailed Description"
                    placeholder="Describe your technical support need..."
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                  />
                  <FormControl fullWidth>
                    <InputLabel>Request Type</InputLabel>
                    <Select
                      value={formData.category || '359'}
                      label="Request Type"
                      onChange={(e) => handleInputChange('category', e.target.value)}
                    >
                      <MenuItem value="359">AWS Access Request (ID: 359)</MenuItem>
                      <MenuItem value="365">GitHub Access Request (ID: 365)</MenuItem>
                      <MenuItem value="369">Jira Access Request (ID: 369)</MenuItem>
                      <MenuItem value="364">Database Access Request (ID: 364)</MenuItem>
                      <MenuItem value="361">DataBase Query Request (ID: 361)</MenuItem>
                      <MenuItem value="349">Request a Change (ID: 349)</MenuItem>
                      <MenuItem value="350">Investigate a Problem (ID: 350)</MenuItem>
                      <MenuItem value="367">Config Update (ID: 367)</MenuItem>
                      <MenuItem value="370">Lambda Change (ID: 370)</MenuItem>
                      <MenuItem value="371">CloudFront Request (ID: 371)</MenuItem>
                      <MenuItem value="372">SSM Request (ID: 372)</MenuItem>
                      <MenuItem value="373">Cron - Update (ID: 373)</MenuItem>
                      <MenuItem value="366">VPN PIN RESET - Request (ID: 366)</MenuItem>
                      <MenuItem value="376">Monitor Tool Access (ID: 376)</MenuItem>
                      <MenuItem value="374">Other Request With Approval (ID: 374)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth>
                    <InputLabel>Priority</InputLabel>
                    <Select
                      value={formData.priority || 'Medium'}
                      label="Priority"
                      onChange={(e) => handleInputChange('priority', e.target.value)}
                    >
                      <MenuItem value="Low">Low</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="High">High</MenuItem>
                      <MenuItem value="Critical">Critical</MenuItem>
                    </Select>
                  </FormControl>
                  
                  <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, p: 2, textAlign: 'center' }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    <LucideIcon name="Paperclip" size={24} className="mx-auto mb-1 text-slate-400" />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {fileToUpload ? fileToUpload.name : 'Upload attachments (Optional)'}
                    </Typography>
                    <Button size="small" onClick={() => fileInputRef.current?.click()} sx={{ mt: 1 }}>
                      Browse Files
                    </Button>
                  </Box>
                </>
              )}

              {/* View Dashboard type services */}
              {['jira-time-tracker', 'jira-sprint-board'].includes(serviceId || '') && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  This service displays a read-only live analytical summary. Click below to fetch the latest data.
                </Typography>
              )}

              <Button
                variant="contained"
                onClick={handleExecute}
                disabled={executing}
                startIcon={executing ? <CircularProgress size={16} /> : <LucideIcon name="Zap" />}
                sx={{ mt: serviceId === 'jira-view-ticket' ? 0.5 : 2, py: 1.25, fontWeight: 700 }}
              >
                {serviceId === 'jira-view-ticket'
                  ? (executing ? 'Fetching...' : 'Fetch')
                  : (executing ? 'Executing Automation...' : 'Execute Service')}
              </Button>
            </CardContent>
          </Card>
        </Grid>
        )}

        {/* Right Side: Outputs & Logs */}
        <Grid item xs={12} md={serviceId === 'jira-view-ticket' ? 9 : 12}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Output Panel */}
            <Card className="glass-panel" sx={{ borderRadius: 3, p: 2, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  {serviceId === 'jira-open-tickets' ? (
                    <><LucideIcon name="Kanban" /> Ticket Board</>
                  ) : (
                    <><LucideIcon name="PlaySquare" /> Output Result</>
                  )}
                </Typography>
                
                {response && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {serviceId === 'jira-open-tickets' && (
                      <Button size="small" variant="outlined" onClick={handleExecute} disabled={executing} startIcon={executing ? <CircularProgress size={12} /> : <LucideIcon name="RefreshCw" size={12} />}>
                        Refresh
                      </Button>
                    )}
                    <Button size="small" variant="outlined" onClick={handleCopyResult} startIcon={<LucideIcon name="Copy" size={12} />}>
                      Copy Response
                    </Button>
                    <Button size="small" variant="outlined" onClick={handleDownloadResult} startIcon={<LucideIcon name="Download" size={12} />}>
                      Download JSON
                    </Button>
                  </Box>
                )}
              </Box>

              <Divider />

              {/* Loader */}
              {executing && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: 2, py: 6 }}>
                  <CircularProgress size={40} />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Running automation scripts...</Typography>
                </Box>
              )}

              {/* Errors */}
              {error && (
                <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              {/* Data Presentation */}
              {!executing && !error && !response && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, py: 8, color: 'text.secondary', gap: 1 }}>
                  <LucideIcon name="Terminal" size={32} />
                  <Typography variant="body2">Execution results will be displayed here</Typography>
                </Box>
              )}

              {!executing && response && (
                <Box sx={{ mt: 2, flexGrow: 1 }}>
                  {executionTime && (
                    <Chip
                      label={`Execution Time: ${Math.round(executionTime)}ms`}
                      size="small"
                      color="secondary"
                      sx={{ mb: 2, fontWeight: 600 }}
                    />
                  )}

                  {/* Render custom result view or fallback */}
                  <ServiceResultViews serviceId={serviceId || ''} response={response} />
                </Box>
              )}
            </Card>

            {/* HTTP Execution Logs */}
            {runLogs.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LucideIcon name="Terminal" /> Under the Hood: API Requests
                </Typography>
                <LogViewer logs={runLogs} />
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ServiceRunner;
