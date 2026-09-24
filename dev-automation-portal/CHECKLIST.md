# Ticket Delivery Checklist

<!-- Generated from backend/app/core/delivery_checklist.py by `python -m scripts.generate_checklist`. Edit that file, not this one. -->

The **Ticket Delivery** page (JIRA Integration → Ticket Delivery) shows these same checklists and saves progress per ticket.

## 1. One-time setup: access

### GitHub (repo access)

- [ ] Repository cloned locally and set in DELIVERY_REPO_PATH / DELIVERY_REPO_MAP
- [ ] GITHUB_TOKEN set in Settings (live mode, not simulated) with `repo` scope
- [ ] Branch protection, required reviewers and CODEOWNERS for the repo are known
- [ ] SIT and main branches set per repo in DELIVERY_REPO_MAP (`sit_branch`, `main_branch`)

### Jira (ticket access)

- [ ] JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN set in Settings
- [ ] DELIVERY_JIRA_PROJECT_KEYS (and ideally DELIVERY_JIRA_BOARD_ID) set
- [ ] You can see the current and next sprint on the board
- [ ] Atlassian MCP connected in Claude Code so the skill can comment and attach evidence

### Claude (code and everything else)

- [ ] Claude Code installed and signed in (`claude --version` works)
- [ ] The `rn-ticket-delivery` skill is installed and enabled
- [ ] Claude Cowork desktop app available for ticket understanding
- [ ] Claude Design access for UI design
- [ ] Claude in Chrome extension installed and connected (`claude --chrome`)

### Zoho (communication)

- [ ] Zoho Cliq OAuth (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN) set for PR and QA notifications
- [ ] Team Contacts has QA assignees, PR approval peers and the PR reviewer
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

- [ ] Feature branch created from the correct base (portal: Create Branch)
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
- [ ] Approval requested from peers (Request approval, notifies on Cliq)
- [ ] Reviewer notified and all review comments resolved (Notify reviewer)
- [ ] Required approvals received and PR merged to the SIT branch
- [ ] SIT tag created from the SIT branch (Suggest picks the next tag)
- [ ] Per-AC evidence and video link added to the Jira ticket
- [ ] Pushed to QA for SIT (Push to QA moves, reassigns and notifies)

### 2.6 Deliver: Production (Dev Automation Portal)

- [ ] QA passed on SIT / Pre-Prod and PO accepted
- [ ] Release Management ticket raised (portal: Release Ticket)
- [ ] Release PR to the main branch approved and merged
- [ ] Production tag created from the main branch (Suggest picks the next tag)
- [ ] Production smoke test done
- [ ] Ticket moved to Done with release notes / fix version
- [ ] Release announced in the Zoho Cliq channel
