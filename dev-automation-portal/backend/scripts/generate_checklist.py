"""Regenerate CHECKLIST.md from app/core/delivery_checklist.py.

Run from backend/:  venv/bin/python -m scripts.generate_checklist
"""
import os
from app.core.delivery_checklist import ACCESS_CHECKLIST
from app.core.delivery_stages import STAGES

CHECKLIST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "CHECKLIST.md")


def render() -> str:
    out = [
        "# Ticket Delivery Checklist",
        "",
        "<!-- Generated from backend/app/core/delivery_checklist.py by `python -m scripts.generate_checklist`. Edit that file, not this one. -->",
        "",
        "The **Ticket Delivery** page (JIRA Integration → Ticket Delivery) shows these same checklists and saves progress per ticket.",
        "",
        "## 1. One-time setup: access",
        "",
    ]
    for group in ACCESS_CHECKLIST:
        out += [f"### {group['group']}", "", *[f"- [ ] {i['text']}" for i in group["items"]], ""]
    out += ["## 2. Per-ticket delivery", ""]
    for n, stage in enumerate(STAGES, start=1):
        out += [f"### 2.{n} {stage['label']} ({stage['tool']})", "", *[f"- [ ] {i['text']}" for i in stage["checklist"]], ""]
    return "\n".join(out).rstrip() + "\n"


if __name__ == "__main__":
    with open(CHECKLIST_PATH, "w", encoding="utf-8") as f:
        f.write(render())
    print(f"Wrote {CHECKLIST_PATH}")
