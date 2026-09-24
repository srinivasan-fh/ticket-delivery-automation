# Ticket Delivery Checklist

<!-- Generated from src/checklist.js by `npm run checklist`. Edit that file, not this one. -->

The dashboard shows these same checklists and saves progress per ticket.

## 1. One-time setup: access

### GitHub (repo access)

- [ ] Repository cloned locally and path set in REPO_PATH / REPO_MAP
- [ ] GitHub CLI signed in (`gh auth login`) with push access to the repo
- [ ] Branch protection, required reviewers and CODEOWNERS for the repo are known
- [ ] SIT and production branches set per repo in REPO_MAP (`sitBranch`, `mainBranch`)

### Dev Automation Portal (tags, PR reviews, Push to QA)

- [ ] dev-automation-portal running locally (`./start.sh`) and PORTAL_URL / PORTAL_API_URL set
- [ ] Portal GITHUB_TOKEN set (live mode, not simulated) with `repo` scope
- [ ] Portal Team Contacts has QA assignees, PR approval peers and the PR reviewer
- [ ] Portal Zoho Cliq OAuth (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN) set for PR and QA notifications

### Jira (ticket access)

- [ ] Atlassian API token created at id.atlassian.com and set in JIRA_API_TOKEN
- [ ] JIRA_BASE_URL, JIRA_EMAIL, JIRA_PROJECT_KEYS (and ideally JIRA_BOARD_ID) set
- [ ] You can see the current and next sprint on the board
- [ ] Atlassian MCP connected in Claude Code so the skill can comment and attach evidence

### Claude (code and everything else)

- [ ] Claude Code installed and signed in (`claude --version` works)
- [ ] The `rn-ticket-delivery` skill is installed and enabled
- [ ] Claude Cowork desktop app available for ticket understanding
- [ ] Claude Design access for UI design
- [ ] Claude in Chrome extension installed and connected (`claude --chrome`)

### Zoho (communication)

- [ ] Optional: Zoho Cliq incoming webhook set in ZOHO_CLIQ_WEBHOOK_URL for stage-done updates
- [ ] Zoho WorkDrive folder available for walkthrough videos

## 2. Per-ticket delivery

### 2.1 Understand (Claude Cowork / Claude Code)

- [ ] Ticket, description, attachments and linked tickets read
- [ ] Acceptance criteria listed one by one and walked through with Claude
- [ ] Open questions raised with PO / designer (on the ticket or in Cliq)
- [ ] Impacted screens, modules, Redux slices and sagas identified
- [ ] TODO plan agreed before any code is written
- [ ] Story points still valid, or re-estimated with the team

### 2.2 Design (Claude Design)

- [ ] Screens and components designed in Claude Design
- [ ] Loading, empty, error and success states covered
- [ ] One responsive layout for mobile and desktop web
- [ ] Food Hub brand tokens used; no hardcoded colours, spacing or fonts
- [ ] Light and dark themes checked
- [ ] Design reviewed and approved by the designer / PO

### 2.3 Develop + Unit Tests (Claude Code)

- [ ] Feature branch created from the correct base using the naming convention
- [ ] Existing components, hooks and Redux/saga architecture reused, nothing duplicated
- [ ] No hardcoded values (strings, colours, sizes, URLs); constants and tokens only
- [ ] KISS: smallest change that meets every acceptance criterion
- [ ] Unit tests written; coverage at least 95% (target 98%) on changed files
- [ ] Lint, type check and the full test suite pass locally
- [ ] Defect-prevention rules from past bugs checked
- [ ] Three-persona review (developer, QA, architect) done and findings fixed

### 2.4 Test (Claude in Chrome)

- [ ] Every acceptance criterion verified in the browser with Claude in Chrome
- [ ] Checked at mobile, tablet and desktop widths
- [ ] Checked in light and dark themes
- [ ] QA bug hunt done: edge cases, errors, slow network, empty data
- [ ] Screenshots per acceptance criterion captured
- [ ] Walkthrough video recorded and uploaded to Zoho WorkDrive
- [ ] Developer sign-off given

### 2.5 Deliver: SIT (Claude Code + Dev Automation Portal)

- [ ] PR opened using the team template, ticket key in the title or branch
- [ ] CI green on the PR head
- [ ] Approval requested from peers (portal: Request approval, notifies on Cliq)
- [ ] Reviewer notified and all review comments resolved (portal: Notify reviewer)
- [ ] Required approvals received and PR merged to the SIT branch
- [ ] SIT tag created from the SIT branch (portal suggests the next tag)
- [ ] Per-AC evidence and video link added to the Jira ticket
- [ ] Pushed to QA for SIT (portal: Push to QA transitions, reassigns and notifies)

### 2.6 Deliver: Production (Dev Automation Portal)

- [ ] QA passed on SIT / Pre-Prod and PO accepted
- [ ] Release Management ticket raised (portal: Release Ticket)
- [ ] Release PR to the main branch approved and merged
- [ ] Production tag created from the main branch (portal suggests the next tag)
- [ ] Production smoke test done
- [ ] Ticket moved to Done with release notes / fix version
- [ ] Release announced in the Zoho Cliq channel
