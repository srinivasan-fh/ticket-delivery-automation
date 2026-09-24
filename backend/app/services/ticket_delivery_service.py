import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from sqlalchemy.orm import Session
from app.core.config import settings
from app.clients.jira_client import JiraClient
from app.clients.github_client import GithubClient
from app.core import launcher
from app.core.delivery_checklist import ACCESS_CHECKLIST
from app.core.delivery_stages import STAGES, build_prompt, get_stage
from app.models.database_models import DeliveryCheck, JiraTicket
from app.services.cliq_service import CliqService
from app.services.jira_service import JiraService

TICKET_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]+-\d+$")
PROJECT_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]+$")
SETUP_KEY = "__setup__"
SETUP_STAGE = "access"
# Simulated mode reuses the seeded sim_jira_tickets rows ("Sprint 1" is the active one).
SIM_SPRINTS = {"current": "Sprint 1", "next": "Sprint 2"}

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class DeliveryError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def project_keys() -> List[str]:
    keys = [k.strip().upper() for k in settings.DELIVERY_JIRA_PROJECT_KEYS.split(",") if k.strip()]
    bad = [k for k in keys if not PROJECT_KEY_RE.match(k)]
    if bad:
        raise DeliveryError(f"Invalid project key(s) in DELIVERY_JIRA_PROJECT_KEYS: {', '.join(bad)}")
    return keys


def build_jql(keys: List[str], sprint_clause: str, only_mine: bool) -> str:
    parts = []
    if keys:
        parts.append("project in (" + ", ".join(f'"{k}"' for k in keys) + ")")
    parts.append(sprint_clause)
    if only_mine:
        parts.append("assignee = currentUser()")
    return " AND ".join(parts) + " ORDER BY rank ASC"


def repo_for(ticket_key: str) -> Dict[str, Optional[str]]:
    project = ticket_key.split("-")[0]
    try:
        repo_map = json.loads(settings.DELIVERY_REPO_MAP) if settings.DELIVERY_REPO_MAP else {}
    except ValueError:
        raise DeliveryError("DELIVERY_REPO_MAP must be valid JSON")
    entry = repo_map.get(project) or {}
    return {
        "path": entry.get("path") or settings.DELIVERY_REPO_PATH,
        "owner": entry.get("owner") or settings.GITHUB_OWNER,
        "repo": entry.get("repo") or settings.GITHUB_REPO,
        "sit_branch": entry.get("sit_branch") or "sit",
        "main_branch": entry.get("main_branch") or "main",
    }


def _clean_tickets(items: Any) -> List[Dict[str, Any]]:
    tickets = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not TICKET_KEY_RE.match(str(item.get("key", ""))):
            continue
        points = item.get("story_points")
        url = str(item.get("url") or "")
        tickets.append({
            "key": str(item["key"]),
            "summary": str(item.get("summary") or ""),
            "status": str(item.get("status") or ""),
            "type": str(item.get("type") or ""),
            "priority": str(item.get("priority") or ""),
            "assignee": str(item.get("assignee") or ""),
            "story_points": points if isinstance(points, (int, float)) and not isinstance(points, bool) else None,
            "sprint": str(item.get("sprint") or ""),
            "url": url if url.startswith("https://") else None,
        })
    return tickets


def parse_ticket_reply(text: str) -> "tuple[List[Dict[str, Any]], Optional[str]]":
    """Parse Claude's reply: {"error": ..., "tickets": [...]} (or a bare [...] array).
    Returns (tickets, error_reported_by_claude)."""
    obj_start, obj_end = text.find("{"), text.rfind("}")
    arr_start = text.find("[")
    if obj_start != -1 and obj_end > obj_start and (arr_start == -1 or obj_start < arr_start):
        try:
            data = json.loads(text[obj_start:obj_end + 1])
        except ValueError:
            data = None
        if isinstance(data, dict) and "tickets" in data:
            error = data.get("error")
            return _clean_tickets(data.get("tickets")), (str(error) if error else None)
    arr_end = text.rfind("]")
    if arr_start == -1 or arr_end < arr_start:
        raise DeliveryError(f"Claude Code did not return a ticket list: {text[:200]}", 502)
    try:
        return _clean_tickets(json.loads(text[arr_start:arr_end + 1])), None
    except ValueError:
        raise DeliveryError("Claude Code returned a ticket list that is not valid JSON", 502)


def parse_ticket_list(text: str) -> List[Dict[str, Any]]:
    return parse_ticket_reply(text)[0]


def require_ticket_key(key: str) -> str:
    if not TICKET_KEY_RE.match(key or ""):
        raise DeliveryError("Invalid ticket key")
    return key


def data_dir(*parts: str) -> str:
    base = settings.DELIVERY_DATA_DIR
    if not os.path.isabs(base):
        base = os.path.join(BACKEND_DIR, base)
    path = os.path.join(base, *parts)
    os.makedirs(path, exist_ok=True)
    return path


class TicketDeliveryService:
    def __init__(self, db: Session):
        self.db = db
        self.client = JiraClient()

    # ---------- sprint tickets ----------
    async def _sprint_clause(self, which: str) -> Optional[str]:
        if not settings.DELIVERY_JIRA_BOARD_ID:
            return "sprint in futureSprints()" if which == "next" else "sprint in openSprints()"
        state = "future" if which == "next" else "active"
        status_code, data, error, _ = await self.client.get_board_sprints(settings.DELIVERY_JIRA_BOARD_ID, state)
        if status_code != 200 or not isinstance(data, dict):
            raise DeliveryError(error or f"Jira returned HTTP {status_code} for board sprints", 502)
        sprints = data.get("values") or []
        if not sprints:
            return None
        if which == "next":
            return f"sprint = {int(sprints[0]['id'])}"
        return "sprint in (" + ", ".join(str(int(s["id"])) for s in sprints) + ")"

    def _map_issue(self, issue: Dict[str, Any]) -> Dict[str, Any]:
        fields = issue.get("fields") or {}
        sprints = [s for s in (fields.get(settings.DELIVERY_SPRINT_FIELD) or []) if isinstance(s, dict)]
        sprint = next((s for s in sprints if s.get("state") == "active"), None) \
            or next((s for s in sprints if s.get("state") == "future"), None) \
            or (sprints[-1] if sprints else None)
        return {
            "key": issue.get("key"),
            "summary": fields.get("summary", ""),
            "status": (fields.get("status") or {}).get("name", ""),
            "status_category": ((fields.get("status") or {}).get("statusCategory") or {}).get("key", ""),
            "issue_type": (fields.get("issuetype") or {}).get("name"),
            "priority": (fields.get("priority") or {}).get("name"),
            "assignee": (fields.get("assignee") or {}).get("displayName") or "Unassigned",
            "story_points": fields.get(settings.DELIVERY_STORY_POINTS_FIELD),
            "sprint": (sprint or {}).get("name"),
            "url": f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{issue.get('key')}",
        }

    async def get_sprint_tickets(self, which: Literal["current", "next"]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            clause = await self._sprint_clause(which)
            if not clause:
                return {"source": "live", "jql": None, "tickets": [], "execution_time_ms": (time.perf_counter() - start_time) * 1000}
            jql = build_jql(project_keys(), clause, settings.DELIVERY_ONLY_MINE)
            fields = ",".join(["summary", "status", "issuetype", "priority", "assignee", settings.DELIVERY_SPRINT_FIELD, settings.DELIVERY_STORY_POINTS_FIELD])
            # /search/jql is cursor-paginated - page through everything (capped as a backstop).
            issues: List[Dict[str, Any]] = []
            next_token = None
            for _ in range(20):
                status_code, data, error, _ = await self.client.search_issues(jql, next_page_token=next_token, fields=fields)
                if status_code != 200 or not isinstance(data, dict):
                    raise DeliveryError(error or f"Jira returned HTTP {status_code}", 502)
                issues.extend(data.get("issues", []))
                next_token = data.get("nextPageToken")
                if data.get("isLast", True) or not next_token:
                    break
            return {"source": "live", "jql": jql, "tickets": [self._map_issue(i) for i in issues], "execution_time_ms": (time.perf_counter() - start_time) * 1000}

        # Simulation Mode
        JiraService(self.db)  # seeds sim_jira_tickets on first use
        rows = self.db.query(JiraTicket).filter(JiraTicket.sprint == SIM_SPRINTS[which]).all()
        tickets = [{
            "key": t.key, "summary": t.summary, "status": t.status,
            "status_category": "done" if t.status == "Done" else "indeterminate" if t.status == "In Progress" else "new",
            "issue_type": "Task", "priority": t.priority, "assignee": t.assignee or "Unassigned",
            "story_points": t.story_points, "sprint": t.sprint, "url": None,
        } for t in rows]
        return {"source": "simulated", "jql": f'sprint = "{SIM_SPRINTS[which]}" (simulated)', "tickets": tickets, "execution_time_ms": (time.perf_counter() - start_time) * 1000}

    # ---------- sprint tickets via Claude Code's Atlassian MCP (My Tickets page) ----------
    async def get_mcp_tickets(self, which: Literal["current", "next"]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        clause = "sprint in futureSprints()" if which == "next" else "sprint in openSprints()"
        jql = build_jql(project_keys(), clause, settings.DELIVERY_ONLY_MINE)
        cwd = settings.DELIVERY_REPO_PATH if settings.DELIVERY_REPO_PATH and os.path.isdir(settings.DELIVERY_REPO_PATH) else os.path.expanduser("~")

        configured = [launcher.mcp_tool_prefix(s) for s in settings.CLAUDE_JIRA_MCP_SERVERS.split(",") if s.strip()]
        discovered = await asyncio.to_thread(launcher.discover_jira_mcp_servers, settings.CLAUDE_BIN, cwd)
        servers = list(dict.fromkeys(discovered + configured))
        read_only_tools = ["searchJiraIssuesUsingJql", "getAccessibleAtlassianResources", "atlassianUserInfo"]
        allowed = [f"mcp__{server}__{tool}" for server in servers for tool in read_only_tools]
        prompt = "\n".join([
            "Use your Atlassian (Jira) MCP tools only - searchJiraIssuesUsingJql, and getAccessibleAtlassianResources first if you need the cloudId.",
            f"Run this JQL and return every result (page through if needed): {jql}",
            f"Request the fields summary, status, issuetype, priority, assignee, {settings.DELIVERY_SPRINT_FIELD}, {settings.DELIVERY_STORY_POINTS_FIELD}.",
            "Reply with ONLY this JSON object and nothing else:",
            '{"error": null, "tickets": [{"key": "...", "summary": "...", "status": "...", "type": "...", "priority": "...", '
            '"assignee": "...", "story_points": number or null, "sprint": "...", "url": "https://<site>/browse/<key>"}]}',
            'If you could not run the search (tool missing, not allowed, not signed in), reply {"error": "<why>", "tickets": []}.',
            "Only use an empty tickets list with a null error when the search really returned no issues.",
        ])
        try:
            envelope = await asyncio.to_thread(
                launcher.run_claude_print, settings.CLAUDE_BIN, prompt, allowed, cwd, settings.CLAUDE_MCP_TIMEOUT_SECONDS)
        except RuntimeError as exc:
            raise DeliveryError(str(exc), 502)
        if envelope.get("is_error"):
            raise DeliveryError(f"Claude Code reported an error: {str(envelope.get('result'))[:300]}", 502)
        reply = str(envelope.get("result") or "")
        tickets, claude_error = parse_ticket_reply(reply)
        denied = sorted({str(d.get("tool_name")) for d in (envelope.get("permission_denials") or []) if isinstance(d, dict)})
        if not tickets and (denied or claude_error):
            hint = f"Allowed MCP servers: {', '.join(servers) or 'none found'}. Run `claude mcp list` and set CLAUDE_JIRA_MCP_SERVERS in backend/.env to your Atlassian server's name."
            what = f"it was not allowed to use {', '.join(denied)}" if denied else claude_error
            raise DeliveryError(f"Claude Code could not read Jira: {what}. {hint}", 502)
        return {"source": "claude-mcp", "jql": jql, "tickets": tickets, "mcp_servers": servers,
                "execution_time_ms": (time.perf_counter() - start_time) * 1000}

    # ---------- checklists ----------
    def get_checks(self, keys: List[str]) -> Dict[str, Any]:
        rows = self.db.query(DeliveryCheck).filter(DeliveryCheck.ticket_key.in_([*keys, SETUP_KEY])).all()
        tickets: Dict[str, Dict[str, Dict[str, str]]] = {}
        access: Dict[str, str] = {}
        for r in rows:
            if r.ticket_key == SETUP_KEY:
                access[r.item_id] = r.checked_at.isoformat()
            else:
                tickets.setdefault(r.ticket_key, {}).setdefault(r.stage, {})[r.item_id] = r.checked_at.isoformat()
        return {"tickets": tickets, "access": access}

    def _set(self, ticket_key: str, stage: str, item_id: str, done: bool) -> None:
        row = self.db.query(DeliveryCheck).filter_by(ticket_key=ticket_key, stage=stage, item_id=item_id).first()
        if done and not row:
            self.db.add(DeliveryCheck(ticket_key=ticket_key, stage=stage, item_id=item_id, checked_at=datetime.utcnow()))
        elif not done and row:
            self.db.delete(row)
        self.db.commit()

    async def set_check(self, ticket_key: str, stage_id: str, item_id: str, done: bool) -> Dict[str, Any]:
        require_ticket_key(ticket_key)
        stage = get_stage(stage_id)
        if not stage:
            raise DeliveryError("Unknown stage", 404)
        if not any(c["id"] == item_id for c in stage["checklist"]):
            raise DeliveryError("Unknown checklist item", 404)
        self._set(ticket_key, stage_id, item_id, done)
        stage_checks = self.get_checks([ticket_key])["tickets"].get(ticket_key, {}).get(stage_id, {})
        if done and settings.DELIVERY_CLIQ_NOTIFY and len(stage_checks) == len(stage["checklist"]):
            await CliqService().send_message(f"✅ {ticket_key}: {stage['label']} checklist complete")
        return {"ticket_key": ticket_key, "stage": stage_id, "checks": stage_checks}

    def set_access(self, item_id: str, done: bool) -> Dict[str, str]:
        if not any(i["id"] == item_id for g in ACCESS_CHECKLIST for i in g["items"]):
            raise DeliveryError("Unknown setup item", 404)
        self._set(SETUP_KEY, SETUP_STAGE, item_id, done)
        return self.get_checks([])["access"]

    # ---------- Claude hand-off ----------
    async def start_stage(self, ticket_key: str, stage_id: str, mode: Literal["launch", "run", "prompt"]) -> Dict[str, Any]:
        require_ticket_key(ticket_key)
        stage = get_stage(stage_id)
        if not stage:
            raise DeliveryError("Unknown stage", 404)
        if mode == "run" and not stage["headless"]:
            raise DeliveryError("This stage is interactive - open it in Claude Code instead")
        repo = repo_for(ticket_key)
        if not repo["path"]:
            raise DeliveryError("No local repo configured for this ticket (DELIVERY_REPO_PATH / DELIVERY_REPO_MAP)")

        # The brief is a convenience; Claude Code reads the full ticket via the Atlassian MCP,
        # so a failed lookup (e.g. simulated mode with a real key) must not block the launch.
        res = await JiraService(self.db).get_ticket(ticket_key)
        ticket = res["data"] if res["success"] and isinstance(res.get("data"), dict) else {"key": ticket_key}
        prompt = build_prompt(stage, {**ticket, "key": ticket_key}, settings.CLAUDE_SKILL)
        prompt_file = os.path.join(data_dir("prompts"), f"{ticket_key}-{stage_id}.md")
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(prompt)

        command = launcher.build_shell_command(repo["path"], settings.CLAUDE_BIN, stage["args"], prompt_file)
        result: Dict[str, Any] = {"command": command, "prompt_file": prompt_file, "launched": False, "output_file": None}
        if mode == "launch":
            argv = launcher.terminal_invocation(sys.platform, command, settings.DELIVERY_TERMINAL_CMD)
            if not argv:
                raise DeliveryError("No terminal launcher for this OS - set DELIVERY_TERMINAL_CMD or copy the command")
            try:
                launcher.launch_detached(argv)
            except OSError as exc:
                raise DeliveryError(f"Could not open a terminal ({argv[0]}): {exc}")
            result["launched"] = True
        elif mode == "run":
            out_file = os.path.join(data_dir("runs"), f"{ticket_key}-{stage_id}.md")
            launcher.run_headless(settings.CLAUDE_BIN, stage["args"], prompt, repo["path"], out_file)
            result.update(launched=True, output_file=out_file)
        return result

    def get_output(self, ticket_key: str, stage_id: str) -> Optional[str]:
        require_ticket_key(ticket_key)
        if not get_stage(stage_id):
            raise DeliveryError("Unknown stage", 404)
        path = os.path.join(data_dir("runs"), f"{ticket_key}-{stage_id}.md")
        if not os.path.exists(path):
            return None
        with open(path, encoding="utf-8") as f:
            return f.read()

    # ---------- setup / config ----------
    async def _jira_check(self) -> Dict[str, Any]:
        if not settings.jira_configured:
            return {"ok": False, "detail": "Simulated - set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in Settings"}
        status_code, data, error, _ = await self.client.get_myself()
        if status_code == 200 and isinstance(data, dict):
            return {"ok": True, "detail": f"Live - signed in as {data.get('displayName') or data.get('emailAddress')}"}
        return {"ok": False, "detail": f"Jira credentials set but not working: {(error or f'HTTP {status_code}')[:200]}"}

    async def _github_check(self) -> Dict[str, Any]:
        if not settings.github_configured:
            return {"ok": False, "detail": "Simulated - set GITHUB_TOKEN in Settings"}
        status_code, data, error, _ = await GithubClient().get_authenticated_user()
        if status_code == 200 and isinstance(data, dict):
            return {"ok": True, "detail": f"Live - signed in as {data.get('login')}"}
        return {"ok": False, "detail": f"GITHUB_TOKEN set but not working: {(error or f'HTTP {status_code}')[:200]}"}

    async def health(self) -> Dict[str, Dict[str, Any]]:
        checks: Dict[str, Dict[str, Any]] = {
            "jira": await self._jira_check(),
            "github": await self._github_check(),
            "cliq": {"ok": settings.zoho_cliq_configured,
                     "detail": "Configured (Zoho OAuth set)" if settings.zoho_cliq_configured else "Simulated - set ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN in .env"},
            "claude": launcher.run_version(settings.CLAUDE_BIN),
        }
        try:
            keys = project_keys() or ["default"]
        except DeliveryError as exc:
            checks["projects"] = {"ok": False, "detail": str(exc)}
            keys = ["default"]
        for project in keys:
            try:
                repo = repo_for(f"{project}-1")
            except DeliveryError as exc:
                checks[f"repo {project}"] = {"ok": False, "detail": str(exc)}
                continue
            problems = []
            if not repo["path"] or not os.path.isdir(os.path.join(repo["path"], ".git")):
                problems.append("local path is not a git repo")
            if not (repo["owner"] and repo["repo"]):
                problems.append("GitHub owner/repo not set")
            checks[f"repo {project}"] = {
                "ok": not problems,
                "detail": "; ".join(problems) + " (DELIVERY_REPO_PATH / DELIVERY_REPO_MAP)" if problems else f"{repo['path']} → {repo['owner']}/{repo['repo']}",
            }
        return checks

    def config(self) -> Dict[str, Any]:
        return {
            "stages": [{k: s[k] for k in ("id", "label", "tool", "headless", "portal", "checklist")} for s in STAGES],
            "access": ACCESS_CHECKLIST,
            "skill": settings.CLAUDE_SKILL,
            "design_url": settings.CLAUDE_DESIGN_URL,
        }

    def ticket_repo(self, ticket_key: str) -> Dict[str, Optional[str]]:
        return repo_for(require_ticket_key(ticket_key))
