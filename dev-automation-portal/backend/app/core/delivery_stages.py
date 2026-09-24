from typing import Any, Dict, List, Optional
from app.core.delivery_checklist import STAGE_CHECKLISTS

# Each stage hands off to a Claude surface with a prompt that runs the team's delivery
# skill for that phase only. Delivery stages also surface the portal's PR / tag / Push to
# QA actions ("portal" is the tag environment, matching app/core/tag_conventions.py).
STAGES: List[Dict[str, Any]] = [
    {
        "id": "understand",
        "label": "Understand",
        "tool": "Claude Cowork / Claude Code",
        "args": ["--permission-mode", "plan"],
        "headless": True,
        "portal": None,
        "task": [
            "Run only the analysis phase for this ticket. Do not modify any files.",
            "List every acceptance criterion one by one, open questions for the PO/designer,",
            "impacted screens/modules/Redux slices/sagas, risks, and a TODO plan.",
        ],
    },
    {
        "id": "design",
        "label": "Design",
        "tool": "Claude Design",
        "args": ["--permission-mode", "plan"],
        "headless": False,
        "portal": None,
        "task": [
            "Prepare the design phase. Do not modify any files.",
            "Write a design brief I can paste into Claude Design: screens and components,",
            "loading/empty/error/success states, one responsive layout for mobile and desktop web,",
            "Food Hub brand tokens (no hardcoded values), and light/dark themes.",
            "Point out existing components that should be reused.",
        ],
    },
    {
        "id": "develop",
        "label": "Develop + Unit Tests",
        "tool": "Claude Code",
        "args": [],
        "headless": False,
        "portal": None,
        "task": [
            "Run the build phase: branch, AC-by-AC walkthrough with me, TODO plan, implementation",
            "and unit tests to at least 95% coverage (target 98%) on changed files.",
            "Stop for my sign-off before opening any PR.",
        ],
    },
    {
        "id": "test",
        "label": "Test",
        "tool": "Claude in Chrome",
        "args": ["--chrome"],
        "headless": False,
        "portal": None,
        "task": [
            "Run the QA phase in the browser with Claude in Chrome: verify every acceptance",
            "criterion at mobile, tablet and desktop widths in light and dark themes, hunt for bugs",
            "(edge cases, errors, slow network, empty data) and capture a screenshot per AC.",
            "Report findings; do not fix without asking.",
        ],
    },
    {
        "id": "deliver-sit",
        "label": "Deliver: SIT",
        "tool": "Claude Code + Dev Automation Portal",
        "args": [],
        "headless": False,
        "portal": "sit",
        "task": [
            "Run the delivery phase: open the PR(s) using the team template with the ticket key in",
            "the title, and add per-AC evidence and the walkthrough video link to the Jira ticket.",
            "Do not create tags or push to QA; I do that from the Dev Automation Portal.",
        ],
    },
    {
        "id": "deliver-production",
        "label": "Deliver: Production",
        "tool": "Dev Automation Portal",
        "args": ["--permission-mode", "plan"],
        "headless": False,
        "portal": "main",
        "task": [
            "Prepare the production release for this ticket. Do not modify any files.",
            "Summarise what shipped (PRs, commits since the last production tag) as release notes",
            "and list anything that must happen before or after the production tag.",
        ],
    },
]

for _stage in STAGES:
    _stage["checklist"] = STAGE_CHECKLISTS[_stage["id"]]


def get_stage(stage_id: str) -> Optional[Dict[str, Any]]:
    return next((s for s in STAGES if s["id"] == stage_id), None)


def build_prompt(stage: Dict[str, Any], ticket: Dict[str, Any], skill: str) -> str:
    points = ticket.get("story_points")
    lines = [
        f"Use the {skill} skill for Jira ticket {ticket['key']}. Stage: {stage['label']}.",
        "",
        *stage["task"],
        "",
        "Before you finish, confirm each item of this checklist (done / not done / n/a):",
        *[f"- [ ] {c['text']}" for c in stage["checklist"]],
        "",
        "--- Ticket brief (from Jira) ---",
        f"Key: {ticket['key']}",
        f"Summary: {ticket.get('summary', '')}",
        f"Type: {ticket.get('issue_type') or '-'} | Status: {ticket.get('status') or '-'} | "
        f"Priority: {ticket.get('priority') or '-'} | Points: {points if points not in (None, 0) else '-'}",
    ]
    if ticket.get("url"):
        lines.append(f"Link: {ticket['url']}")
    description = (ticket.get("description") or "").strip()
    if description and description != "No description":
        lines += ["", "Description:", description]
    return "\n".join(lines) + "\n"
