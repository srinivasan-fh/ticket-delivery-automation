import { STAGE_CHECKLISTS } from './checklist.js';

// Each stage hands off to a Claude surface with a prompt that invokes the
// team's delivery skill for that phase only. Delivery stages also use the
// Dev Automation Portal for PRs, tags and Push to QA.
export const STAGES = [
  {
    id: 'understand',
    label: 'Understand',
    tool: 'Claude Cowork / Claude Code',
    args: ['--permission-mode', 'plan'],
    headless: true,
    task: [
      'Run only the analysis phase for this ticket. Do not modify any files.',
      'List every acceptance criterion one by one, open questions for the PO/designer,',
      'impacted screens/modules/Redux slices/sagas, risks, and a TODO plan.',
    ],
  },
  {
    id: 'design',
    label: 'Design',
    tool: 'Claude Design',
    args: ['--permission-mode', 'plan'],
    task: [
      'Prepare the design phase. Do not modify any files.',
      'Write a design brief I can paste into Claude Design: screens and components,',
      'loading/empty/error/success states, one responsive layout for mobile and desktop web,',
      'Food Hub brand tokens (no hardcoded values), and light/dark themes.',
      'Point out existing components that should be reused.',
    ],
  },
  {
    id: 'develop',
    label: 'Develop + Unit Tests',
    tool: 'Claude Code',
    args: [],
    task: [
      'Run the build phase: branch, AC-by-AC walkthrough with me, TODO plan, implementation',
      'and unit tests to at least 95% coverage (target 98%) on changed files.',
      'Stop for my sign-off before opening any PR.',
    ],
  },
  {
    id: 'test',
    label: 'Test',
    tool: 'Claude in Chrome',
    args: ['--chrome'],
    task: [
      'Run the QA phase in the browser with Claude in Chrome: verify every acceptance',
      'criterion at mobile, tablet and desktop widths in light and dark themes, hunt for bugs',
      '(edge cases, errors, slow network, empty data) and capture a screenshot per AC.',
      'Report findings; do not fix without asking.',
    ],
  },
  {
    id: 'deliver-sit',
    label: 'Deliver: SIT',
    tool: 'Claude Code + Dev Automation Portal',
    args: [],
    portal: 'sit',
    task: [
      'Run the delivery phase: open the PR(s) using the team template with the ticket key in',
      'the title, and add per-AC evidence and the walkthrough video link to the Jira ticket.',
      'Do not create tags or push to QA; I do that from the Dev Automation Portal.',
    ],
  },
  {
    id: 'deliver-production',
    label: 'Deliver: Production',
    tool: 'Dev Automation Portal',
    args: ['--permission-mode', 'plan'],
    portal: 'main',
    task: [
      'Prepare the production release for this ticket. Do not modify any files.',
      'Summarise what shipped (PRs, commits since the last production tag) as release notes',
      'and list anything that must happen before or after the production tag.',
    ],
  },
].map((s) => ({ ...s, checklist: STAGE_CHECKLISTS[s.id] }));

export function getStage(id) {
  return STAGES.find((s) => s.id === id);
}

export function buildPrompt(stage, ticket, skill) {
  const lines = [
    `Use the ${skill} skill for Jira ticket ${ticket.key}. Stage: ${stage.label}.`,
    '',
    ...stage.task,
    '',
    'Before you finish, confirm each item of this checklist (done / not done / n/a):',
    ...stage.checklist.map((c) => `- [ ] ${c.text}`),
    '',
    '--- Ticket brief (from Jira) ---',
    `Key: ${ticket.key}`,
    `Summary: ${ticket.summary}`,
    `Type: ${ticket.type} | Status: ${ticket.status} | Priority: ${ticket.priority} | Points: ${ticket.storyPoints ?? '-'}`,
    `Link: ${ticket.url}`,
  ];
  if (ticket.description) lines.push('', 'Description:', ticket.description);
  return `${lines.join('\n')}\n`;
}
