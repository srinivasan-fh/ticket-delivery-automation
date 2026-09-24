import axios from 'axios';
import { useStore } from '../store/useStore';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Interceptor for logging response success and failure notifications automatically
apiClient.interceptors.response.use(
  (response) => {
    // Check if it's a mutation request (POST, PUT, DELETE) and has execution data
    const method = response.config.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'DELETE'].includes(method)) {
      const data = response.data;
      if (data && data.success) {
        const elapsed = data.execution_time_ms ? ` (${Math.round(data.execution_time_ms)}ms)` : '';
        useStore.getState().addNotification(
          'Execution Successful',
          `Successfully executed ${response.config.url}${elapsed}`,
          'success'
        );
      }
    }
    return response;
  },
  (error) => {
    const errorMsg = error.response?.data?.detail || error.message || 'Unknown network error';
    useStore.getState().addNotification(
      'Execution Failed',
      `Error on ${error.config?.url}: ${errorMsg}`,
      'error'
    );
    return Promise.reject(error);
  }
);

export const jiraApi = {
  getTicket: (key: string) => apiClient.get(`/jira/ticket/${key}`).then(r => r.data),
  addWorklog: (payload: { ticket_key: string; time_spent: string; comment?: string; started?: string }) =>
    apiClient.post('/jira/worklog', payload).then(r => r.data),
  deleteWorklog: (ticketKey: string, worklogId: number) =>
    apiClient.delete(`/jira/worklog/${ticketKey}/${worklogId}`).then(r => r.data),
  addComment: (payload: { ticket_key: string; body: string }) =>
    apiClient.post('/jira/comment', payload).then(r => r.data),
  updateTicket: (payload: { ticket_key: string; status?: string; assignee?: string; priority?: string; labels?: string[] }) =>
    apiClient.put('/jira/ticket', payload).then(r => r.data),
  getTransitions: (ticketKey: string) => apiClient.get(`/jira/ticket/${ticketKey}/transitions`).then(r => r.data),
  transitionTicket: (ticketKey: string, transitionId: string) =>
    apiClient.post(`/jira/ticket/${ticketKey}/transition`, { transition_id: transitionId }).then(r => r.data),
  getAssignableUsers: (ticketKey: string, query: string) =>
    apiClient.get(`/jira/ticket/${ticketKey}/assignable-users`, { params: { query } }).then(r => r.data),
  assignTicket: (ticketKey: string, accountId: string, displayName: string) =>
    apiClient.post(`/jira/ticket/${ticketKey}/assignee`, { account_id: accountId, display_name: displayName }).then(r => r.data),
  pushToQa: (payload: { ticket_key: string; ticket_url: string; environment: 'SIT' | 'Pre-Prod' | 'PROD'; assignee_email?: string }) =>
    apiClient.post('/jira/push-to-qa', payload).then(r => r.data),
  getMyOpenTickets: () => apiClient.get('/jira/my-open-tickets').then(r => r.data),
  getMonthlyReport: () => apiClient.get('/jira/monthly-report').then(r => r.data),
  getQaAssignees: () => apiClient.get('/jira/qa-assignees').then(r => r.data),
  getTimeTracker: () => apiClient.get('/jira/time-tracker').then(r => r.data),
  getSprintBoard: () => apiClient.get('/jira/sprint-board').then(r => r.data),
};

export const githubApi = {
  getPR: (prNumber: number, opts?: { owner?: string; repo?: string }) =>
    apiClient.get(`/github/pr/${prNumber}`, { params: opts }).then(r => r.data),
  getPRFiles: (prNumber: number, opts?: { owner?: string; repo?: string }) =>
    apiClient.get(`/github/pr/${prNumber}/files`, { params: opts }).then(r => r.data),
  submitReview: (payload: {
    pr_number: number;
    owner?: string;
    repo?: string;
    commit_id?: string;
    comment?: string;
    event: string;
    comments?: { path: string; line: number; side: string; body: string }[];
  }) => apiClient.post('/github/pr/approve', payload).then(r => r.data),
  approvePR: (payload: { pr_number: number; comment?: string; event: string }) =>
    apiClient.post('/github/pr/approve', payload).then(r => r.data),
  createBranch: (payload: { branch_name: string; source_branch: string; owner?: string; repo?: string }) =>
    apiClient.post('/github/branch', payload).then(r => r.data),
  listRepos: () => apiClient.get('/github/repos').then(r => r.data),
  listBranches: (owner: string, repo: string) =>
    apiClient.get(`/github/repos/${owner}/${repo}/branches`).then(r => r.data),
  createTag: (payload: { tag_name: string; owner?: string; repo?: string; source_branch?: string; target_commit_sha?: string; release_notes_template?: string; publish_release?: boolean }) =>
    apiClient.post('/github/tag', payload).then(r => r.data),
  generateReleaseNotes: (payload: { tag_name: string; owner?: string; repo?: string; target_commitish?: string; previous_tag_name?: string }) =>
    apiClient.post('/github/releases/generate-notes', payload).then(r => r.data),
  compareTags: (payload: { base_tag: string; head_tag: string; owner?: string; repo?: string }) =>
    apiClient.post('/github/compare', payload).then(r => r.data),
  listTags: (owner: string, repo: string) =>
    apiClient.get(`/github/repos/${owner}/${repo}/tags`).then(r => r.data),
  suggestNextTag: (owner: string, repo: string, environment: string, sourceBranch?: string) =>
    apiClient.get(`/github/repos/${owner}/${repo}/tags/suggest`, { params: { environment, source_branch: sourceBranch } }).then(r => r.data),
  listPullRequests: (owner: string, repo: string, state: 'open' | 'closed') =>
    apiClient.get(`/github/repos/${owner}/${repo}/pulls`, { params: { state } }).then(r => r.data),
  notifyReviewer: (prUrl: string) =>
    apiClient.post('/github/pr/notify-reviewer', { pr_url: prUrl }).then(r => r.data),
  requestApproval: (prUrl: string, repo: string) =>
    apiClient.post('/github/pr/request-approval', { pr_url: prUrl, repo }).then(r => r.data),
  mergePullRequest: (owner: string, repo: string, prNumber: number) =>
    apiClient.post('/github/pr/merge', { owner, repo, pr_number: prNumber }).then(r => r.data),
  deleteBranch: (owner: string, repo: string, branch: string) =>
    apiClient.post('/github/pr/delete-branch', { owner, repo, branch }).then(r => r.data),
};

export const devopsApi = {
  getDashboard: () => apiClient.get('/devops/dashboard').then(r => r.data),
  getJenkinsTree: (path?: string) =>
    apiClient.get('/devops/jenkins/tree', { params: path ? { path } : {} }).then(r => r.data),
  restartJenkinsBuild: (jobName: string) =>
    apiClient.post('/devops/jenkins/build', { job_name: jobName }).then(r => r.data),
  getOctopusReleases: (projectId: string) =>
    apiClient.get(`/devops/octopus/releases/${projectId}`).then(r => r.data),
  deployOctopusRelease: (payload: { project_id: string; environment_id: string; release_version: string }) =>
    apiClient.post('/devops/octopus/deploy', payload).then(r => r.data),
  getDeploymentProgress: (deploymentId: string) =>
    apiClient.get(`/devops/octopus/progress/${deploymentId}`).then(r => r.data),
  getOctopusOverview: () => apiClient.get('/devops/octopus/overview').then(r => r.data),
  getOctopusProjectDashboard: (projectId: string) =>
    apiClient.get(`/devops/octopus/project/${projectId}/dashboard`).then(r => r.data),
  resolveOctopusProjects: (ids: string[]) =>
    apiClient.get('/devops/octopus/projects/resolve', { params: { ids: ids.join(',') } }).then(r => r.data),
};

export const crmApi = {
  createFranchise: (payload: { name: string; location: string; email: string; phone: string }) =>
    apiClient.post('/crm/franchise', payload).then(r => r.data),
  createReseller: (payload: { company_name: string; email: string; phone: string; tax_id: string }) =>
    apiClient.post('/crm/reseller', payload).then(r => r.data),
  lookupOrders: (orderNumbers: string[]) =>
    apiClient.post('/crm/orders/lookup', { order_numbers: orderNumbers }).then(r => r.data),
  raiseSocialPost: (payload: { platform: string; content: string; scheduled_time?: string; media_url?: string }) =>
    apiClient.post('/crm/social/post', payload).then(r => r.data),
  getMeta: () => apiClient.get('/crm/meta').then(r => r.data),
};

export const itsmApi = {
  getDashboard: () => apiClient.get('/itsm/dashboard').then(r => r.data),
  raiseRequest: (formData: FormData) =>
    apiClient.post('/itsm/request', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }).then(r => r.data),
  getRecentTickets: () => apiClient.get('/itsm/tickets').then(r => r.data),
  approveTicket: (ticketId: string) =>
    apiClient.post(`/itsm/tickets/${ticketId}/approve`).then(r => r.data),
  addTicketComment: (ticketId: string, body: string) =>
    apiClient.post(`/itsm/tickets/${ticketId}/comment`, { body }).then(r => r.data),
};

export const releaseTicketApi = {
  getCandidate: (params: { repo: string; channel?: string }) =>
    apiClient.get('/release-ticket/candidate', { params }).then(r => r.data),
  createTicket: (payload: {
    repo: string;
    description: string;
    environment: string;
    release_type: string;
    channel?: string;
    github_release_tag: string;
    github_reverting_tag: string;
    jira_issue_links: string[];
    architect_review: 'Yes' | 'No';
    notify_training_team: 'Yes' | 'No';
    additional_logging_required: 'Yes' | 'No';
    what_to_monitor?: string;
    qa_signoff_received: 'Yes' | 'No';
    qa_touch_url?: string;
  }) => apiClient.post('/release-ticket', payload).then(r => r.data),
  listMyTickets: () => apiClient.get('/release-ticket/my-tickets').then(r => r.data),
  getTicketDetail: (key: string) => apiClient.get(`/release-ticket/my-tickets/${key}`).then(r => r.data),
};

export const tagWatcherApi = {
  start: (payload: { repo: 'MS' | 'MSWEB'; tag_name: string; interval_seconds: 30 | 60 | 120 | 300 }) =>
    apiClient.post('/tag-watcher', payload).then(r => r.data),
  get: (id: number) => apiClient.get(`/tag-watcher/${id}`).then(r => r.data),
  list: (params?: { active_only?: boolean; limit?: number }) =>
    apiClient.get('/tag-watcher', { params }).then(r => r.data),
  stop: (id: number) => apiClient.post(`/tag-watcher/${id}/stop`).then(r => r.data),
};

export const tagPromotionApi = {
  start: (payload: { repo: 'MS' | 'MSWEB'; tag_name: string; interval_seconds: 30 | 60 | 120 | 300 }) =>
    apiClient.post('/tag-promotion', payload).then(r => r.data),
  get: (id: number) => apiClient.get(`/tag-promotion/${id}`).then(r => r.data),
  list: (params?: { active_only?: boolean; limit?: number }) =>
    apiClient.get('/tag-promotion', { params }).then(r => r.data),
  stop: (id: number) => apiClient.post(`/tag-promotion/${id}/stop`).then(r => r.data),
};

export const systemLogsApi = {
  getLogs: (params: { service?: string; status_code?: number; limit?: number }) =>
    apiClient.get('/logs', { params }).then(r => r.data),
};

export const settingsApi = {
  getSettings: () => apiClient.get('/settings').then(r => r.data),
  updateSettings: (payload: any) => apiClient.post('/settings', payload).then(r => r.data),
};

export interface TeamContact {
  name: string;
  email: string;
}

export interface TeamContactsPayload {
  qa_assignees: TeamContact[];
  approval_peers: TeamContact[];
  pr_reviewer: TeamContact | null;
}

export const teamContactsApi = {
  get: () => apiClient.get('/team-contacts').then(r => r.data),
  update: (payload: TeamContactsPayload) => apiClient.post('/team-contacts', payload).then(r => r.data),
};

export default apiClient;
