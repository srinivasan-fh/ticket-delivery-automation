# Ticket Delivery Automation

> **Ticket Delivery now lives in the Dev Automation Portal** — see [`dev-automation-portal/`](dev-automation-portal/) (JIRA Integration → Ticket Delivery). It reuses the portal's Jira, GitHub, Cliq and Push to QA code directly. The standalone Node.js dashboard below still works and is kept for reference.

A local dashboard that lists your **current and next sprint** Jira tickets and gives each one action buttons for every delivery stage. Each stage hands off to the right Claude surface, which runs the team's `rn-ticket-delivery` skill for that phase. Tags, PR reviews and Push to QA go through the [Dev Automation Portal](https://github.com/anboli-foodhub/dev-automation-portal).

```
Jira (current / next sprint)
   │
   ▼
Ticket card ── Understand ─── Claude Cowork / Claude Code (plan mode, can run in background)
           ├── Design ─────── Claude Code design brief → Claude Design
           ├── Develop+Tests ─ Claude Code (interactive, skill build phase, 95–98% coverage)
           ├── Test ───────── Claude Code + Claude in Chrome (`--chrome`)
           ├── Deliver: SIT ── Claude Code opens PR + Jira evidence
           │                   Portal: request approval · notify reviewer · SIT tag · Push to QA
           └── Deliver: Prod ─ Portal: production tag · release ticket · tag promotion
Each stage has a checklist (saved per ticket); a completed stage can post to Zoho Cliq.
```

The checklist is in **[CHECKLIST.md](CHECKLIST.md)**. It is generated from `src/checklist.js`, and the dashboard uses the same data.

## Requirements

- Node.js 20.12+ (no npm dependencies)
- [Claude Code](https://code.claude.com) installed and signed in, with the `rn-ticket-delivery` skill
- A Jira Cloud API token
- The Dev Automation Portal running locally (`./start.sh`, which serves the UI on `:5173` and the API on `:8000`) with `GITHUB_TOKEN` set, so it runs in live mode

## Setup

```bash
cp .env.example .env     # fill in Jira, repo, portal (see comments in the file)
npm start                # → http://localhost:4600
```

Open **Setup checklist** in the dashboard. It runs live checks for Jira, the portal, the Claude CLI, the repo and Cliq, and lets you tick off the one-time access checklist.

### Multiple repos

Map Jira projects to local clones and GitHub repos:

```
REPO_MAP={"RNMS":{"path":"/code/app","github":"org/app","sitBranch":"sit","mainBranch":"main"}}
```

## How the buttons work

| Button | What happens |
|---|---|
| **Open in Claude Code** | Fetches the ticket from Jira, writes a prompt (skill + stage task + checklist + ticket brief) to `.tda/prompts/`, and opens a terminal running `claude` in the repo. It uses Terminal.app on macOS, `x-terminal-emulator` on Linux, or `TERMINAL_CMD`. |
| **Run in background** | Understand stage only: runs `claude -p` in plan mode and saves the output to `.tda/runs/` (see **Show last result**). |
| **Copy command** | Copies the same command so you can run it yourself (for example on Windows). |
| **Request approval / Notify reviewer** | Calls the portal for open PRs whose title or branch contains the ticket key. |
| **Suggest / Create tag** | The portal suggests the next tag using its per-repo conventions (`sit` / `main`) and creates it from the SIT or main branch. Asks you to confirm first. |
| **Push to QA** | The portal changes the ticket's status, comments, reassigns it to QA and notifies on Cliq. Asks you to confirm first. |

## Security

- Listens on `127.0.0.1` only and rejects any other `Host` header, which blocks DNS rebinding.
- Every API call needs a random token that is embedded in the page and changes on each start, so other websites can't trigger launches (CSRF).
- Jira text never reaches a shell. The prompt is written to a file and read with `"$(cat file)"`, and ticket keys, stages, tag names and PR URLs are all validated.

## Development

```bash
npm test             # node:test with coverage
npm run checklist    # regenerate CHECKLIST.md after editing src/checklist.js
```
