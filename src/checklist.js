// Single source of truth for every checklist. The dashboard renders these and
// CHECKLIST.md is generated from them (`npm run checklist`).

export const ACCESS_CHECKLIST = [
  {
    group: 'GitHub (repo access)',
    items: [
      { id: 'gh-clone', text: 'Repository cloned locally and path set in REPO_PATH / REPO_MAP' },
      { id: 'gh-auth', text: 'GitHub CLI signed in (`gh auth login`) with push access to the repo' },
      { id: 'gh-rules', text: 'Branch protection, required reviewers and CODEOWNERS for the repo are known' },
      { id: 'gh-branches', text: 'SIT and production branches set per repo in REPO_MAP (`sitBranch`, `mainBranch`)' },
    ],
  },
  {
    group: 'Dev Automation Portal (tags, PR reviews, Push to QA)',
    items: [
      { id: 'portal-run', text: 'dev-automation-portal running locally (`./start.sh`) and PORTAL_URL / PORTAL_API_URL set' },
      { id: 'portal-github', text: 'Portal GITHUB_TOKEN set (live mode, not simulated) with `repo` scope' },
      { id: 'portal-contacts', text: 'Portal Team Contacts has QA assignees, PR approval peers and the PR reviewer' },
      { id: 'portal-cliq', text: 'Portal Zoho Cliq OAuth (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN) set for PR and QA notifications' },
    ],
  },
  {
    group: 'Jira (ticket access)',
    items: [
      { id: 'jira-token', text: 'Atlassian API token created at id.atlassian.com and set in JIRA_API_TOKEN' },
      { id: 'jira-env', text: 'JIRA_BASE_URL, JIRA_EMAIL, JIRA_PROJECT_KEYS (and ideally JIRA_BOARD_ID) set' },
      { id: 'jira-board', text: 'You can see the current and next sprint on the board' },
      { id: 'jira-mcp', text: 'Atlassian MCP connected in Claude Code so the skill can comment and attach evidence' },
    ],
  },
  {
    group: 'Claude (code and everything else)',
    items: [
      { id: 'cc-install', text: 'Claude Code installed and signed in (`claude --version` works)' },
      { id: 'cc-skill', text: 'The `rn-ticket-delivery` skill is installed and enabled' },
      { id: 'cc-cowork', text: 'Claude Cowork desktop app available for ticket understanding' },
      { id: 'cc-design', text: 'Claude Design access for UI design' },
      { id: 'cc-chrome', text: 'Claude in Chrome extension installed and connected (`claude --chrome`)' },
    ],
  },
  {
    group: 'Zoho (communication)',
    items: [
      { id: 'cliq-webhook', text: 'Optional: Zoho Cliq incoming webhook set in ZOHO_CLIQ_WEBHOOK_URL for stage-done updates' },
      { id: 'workdrive', text: 'Zoho WorkDrive folder available for walkthrough videos' },
    ],
  },
];

// Per-ticket checklist, one list per delivery stage. Items mirror the
// phases of the rn-ticket-delivery skill.
export const STAGE_CHECKLISTS = {
  understand: [
    { id: 'read', text: 'Ticket, description, attachments and linked tickets read' },
    { id: 'ac-list', text: 'Acceptance criteria listed one by one and walked through with Claude' },
    { id: 'questions', text: 'Open questions raised with PO / designer (on the ticket or in Cliq)' },
    { id: 'impact', text: 'Impacted screens, modules, Redux slices and sagas identified' },
    { id: 'todo', text: 'TODO plan agreed before any code is written' },
    { id: 'estimate', text: 'Story points still valid, or re-estimated with the team' },
  ],
  design: [
    { id: 'screens', text: 'Screens and components designed in Claude Design' },
    { id: 'states', text: 'Loading, empty, error and success states covered' },
    { id: 'responsive', text: 'One responsive layout for mobile and desktop web' },
    { id: 'tokens', text: 'Food Hub brand tokens used; no hardcoded colours, spacing or fonts' },
    { id: 'theme', text: 'Light and dark themes checked' },
    { id: 'signoff', text: 'Design reviewed and approved by the designer / PO' },
  ],
  develop: [
    { id: 'branch', text: 'Feature branch created from the correct base using the naming convention' },
    { id: 'reuse', text: 'Existing components, hooks and Redux/saga architecture reused, nothing duplicated' },
    { id: 'no-hardcode', text: 'No hardcoded values (strings, colours, sizes, URLs); constants and tokens only' },
    { id: 'kiss', text: 'KISS: smallest change that meets every acceptance criterion' },
    { id: 'tests', text: 'Unit tests written; coverage at least 95% (target 98%) on changed files' },
    { id: 'lint', text: 'Lint, type check and the full test suite pass locally' },
    { id: 'defects', text: 'Defect-prevention rules from past bugs checked' },
    { id: 'review', text: 'Three-persona review (developer, QA, architect) done and findings fixed' },
  ],
  test: [
    { id: 'ac-verify', text: 'Every acceptance criterion verified in the browser with Claude in Chrome' },
    { id: 'viewports', text: 'Checked at mobile, tablet and desktop widths' },
    { id: 'themes', text: 'Checked in light and dark themes' },
    { id: 'bug-hunt', text: 'QA bug hunt done: edge cases, errors, slow network, empty data' },
    { id: 'evidence', text: 'Screenshots per acceptance criterion captured' },
    { id: 'video', text: 'Walkthrough video recorded and uploaded to Zoho WorkDrive' },
    { id: 'dev-signoff', text: 'Developer sign-off given' },
  ],
  'deliver-sit': [
    { id: 'pr', text: 'PR opened using the team template, ticket key in the title or branch' },
    { id: 'ci', text: 'CI green on the PR head' },
    { id: 'approval-request', text: 'Approval requested from peers (portal: Request approval, notifies on Cliq)' },
    { id: 'peer-review', text: 'Reviewer notified and all review comments resolved (portal: Notify reviewer)' },
    { id: 'merge', text: 'Required approvals received and PR merged to the SIT branch' },
    { id: 'tag', text: 'SIT tag created from the SIT branch (portal suggests the next tag)' },
    { id: 'jira-evidence', text: 'Per-AC evidence and video link added to the Jira ticket' },
    { id: 'jira-qa', text: 'Pushed to QA for SIT (portal: Push to QA transitions, reassigns and notifies)' },
  ],
  'deliver-production': [
    { id: 'qa-pass', text: 'QA passed on SIT / Pre-Prod and PO accepted' },
    { id: 'release-ticket', text: 'Release Management ticket raised (portal: Release Ticket)' },
    { id: 'release-pr', text: 'Release PR to the main branch approved and merged' },
    { id: 'prod-tag', text: 'Production tag created from the main branch (portal suggests the next tag)' },
    { id: 'smoke', text: 'Production smoke test done' },
    { id: 'jira-done', text: 'Ticket moved to Done with release notes / fix version' },
    { id: 'announce', text: 'Release announced in the Zoho Cliq channel' },
  ],
};
