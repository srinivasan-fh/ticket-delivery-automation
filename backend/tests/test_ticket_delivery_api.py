from app.core import launcher
from app.core.config import settings
from app.clients.jira_client import JiraClient
from app.services import ticket_delivery_service as svc


def test_config_and_health(client, delivery_settings, monkeypatch):
    cfg = client.get("/api/ticket-delivery/config").json()
    assert len(cfg["stages"]) == 6 and cfg["skill"] == "rn-ticket-delivery"
    monkeypatch.setattr(launcher, "run_version", lambda b: {"ok": True, "detail": "2.0.0 (Claude Code)"})
    health = client.get("/api/ticket-delivery/health").json()
    assert health["jira"]["ok"] is False and "Simulated" in health["jira"]["detail"]
    assert health["github"]["ok"] is False and health["claude"]["detail"] == "2.0.0 (Claude Code)"
    assert health["repo default"]["ok"] is True
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "bad key")
    assert client.get("/api/ticket-delivery/health").json()["projects"]["ok"] is False


def test_simulated_sprint_tickets(client):
    body = client.get("/api/ticket-delivery/tickets?sprint=current").json()
    assert body["source"] == "simulated"
    assert "RNMS-26235" in [t["key"] for t in body["tickets"]]
    assert client.get("/api/ticket-delivery/tickets?sprint=next").json()["tickets"] == []
    assert client.get("/api/ticket-delivery/tickets?sprint=later").status_code == 422


def test_live_sprint_tickets_with_board(client, monkeypatch):
    monkeypatch.setattr(settings, "JIRA_BASE_URL", "https://j.atlassian.net")
    monkeypatch.setattr(settings, "JIRA_API_TOKEN", "t")
    monkeypatch.setattr(settings, "DELIVERY_JIRA_BOARD_ID", "7")
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "RNMS")
    seen = {}

    async def sprints(self, board_id, state):
        return 200, {"values": [{"id": 20}, {"id": 21}] if state == "future" else [{"id": 11}]}, None, 1.0

    pages = [
        {"issues": [{"key": "RNMS-1", "fields": {"summary": "A", "status": {"name": "To Do", "statusCategory": {"key": "new"}},
                     "customfield_10010": [{"name": "Old", "state": "closed"}, {"name": "CodeRed-Sprint 9", "state": "future"}],
                     "customfield_10016": 3}}], "isLast": False, "nextPageToken": "p2"},
        {"issues": [{"key": "RNMS-2", "fields": {}}], "isLast": True},
    ]

    async def search(self, jql, max_results=100, next_page_token=None, fields=None):
        seen.setdefault("jql", jql)
        seen["fields"] = fields
        return 200, pages[1 if next_page_token else 0], None, 1.0

    monkeypatch.setattr(JiraClient, "get_board_sprints", sprints)
    monkeypatch.setattr(JiraClient, "search_issues", search)
    body = client.get("/api/ticket-delivery/tickets?sprint=next").json()
    assert body["jql"] == 'project in ("RNMS") AND sprint = 20 AND assignee = currentUser() AND issuetype not in subTaskIssueTypes() ORDER BY rank ASC'
    assert "customfield_10010" in seen["fields"]
    first, second = body["tickets"]
    assert first["sprint"] == "CodeRed-Sprint 9" and first["story_points"] == 3
    assert first["url"] == "https://j.atlassian.net/browse/RNMS-1"
    assert second["assignee"] == "Unassigned" and second["sprint"] is None

    async def no_sprints(self, board_id, state):
        return 200, {"values": []}, None, 1.0
    monkeypatch.setattr(JiraClient, "get_board_sprints", no_sprints)
    assert client.get("/api/ticket-delivery/tickets?sprint=current").json()["tickets"] == []

    async def broken(self, *a, **k):
        return 401, {"errorMessages": ["nope"]}, "HTTP Error 401", 1.0
    monkeypatch.setattr(JiraClient, "get_board_sprints", broken)
    assert client.get("/api/ticket-delivery/tickets").status_code == 502
    monkeypatch.setattr(settings, "DELIVERY_JIRA_BOARD_ID", None)
    monkeypatch.setattr(JiraClient, "search_issues", broken)
    r = client.get("/api/ticket-delivery/tickets")
    assert r.status_code == 502 and "401" in r.json()["detail"]


def test_checklists(client, monkeypatch):
    r = client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "develop", "item_id": "tests", "done": True})
    assert r.status_code == 200 and "tests" in r.json()["checks"]
    client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "develop", "item_id": "tests", "done": True})
    client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "develop", "item_id": "lint", "done": True})
    r = client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "develop", "item_id": "lint", "done": False})
    assert list(r.json()["checks"]) == ["tests"]
    assert client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "develop", "item_id": "zzz"}).status_code == 404
    assert client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-1", "stage": "zzz", "item_id": "x"}).status_code == 404
    assert client.put("/api/ticket-delivery/checks", json={"ticket_key": "bad", "stage": "develop", "item_id": "tests"}).status_code == 400

    assert client.put("/api/ticket-delivery/access", json={"item_id": "cc-skill", "done": True}).json().keys() == {"cc-skill"}
    assert client.put("/api/ticket-delivery/access", json={"item_id": "zzz", "done": True}).status_code == 404
    checks = client.get("/api/ticket-delivery/checks?keys=RNMS-1,RNMS-2").json()
    assert list(checks["tickets"]["RNMS-1"]["develop"]) == ["tests"] and "cc-skill" in checks["access"]


def test_completed_stage_posts_to_cliq_when_enabled(client, monkeypatch):
    sent = []

    async def fake_send(self, text, channel="coderedinternal"):
        sent.append(text)
        return {"success": True}

    monkeypatch.setattr(svc.CliqService, "send_message", fake_send)
    monkeypatch.setattr(settings, "DELIVERY_CLIQ_NOTIFY", True)
    items = [c["id"] for c in svc.get_stage("design")["checklist"]]
    for item in items:
        client.put("/api/ticket-delivery/checks", json={"ticket_key": "RNMS-9", "stage": "design", "item_id": item, "done": True})
    assert sent == ["✅ RNMS-9: Design checklist complete"]


def test_stage_launch_run_and_prompt(client, delivery_settings, monkeypatch):
    launched, runs = [], []
    monkeypatch.setattr(launcher, "launch_detached", lambda argv: launched.append(argv))
    monkeypatch.setattr(launcher, "run_headless", lambda *a: runs.append(a))
    monkeypatch.setattr(svc.sys, "platform", "linux")
    url = "/api/ticket-delivery/tickets/RNMS-26235/stages/"

    r = client.post(url + "develop", json={"mode": "prompt"}).json()
    assert r["launched"] is False and r["command"].startswith(f"cd {delivery_settings} && claude")
    assert "Stage: Develop + Unit Tests" in open(r["prompt_file"]).read()

    assert client.post(url + "test", json={"mode": "launch"}).json()["launched"] is True
    assert launched[0][0] == "x-terminal-emulator" and "--chrome" in launched[0][-1]

    assert client.post(url + "develop", json={"mode": "run"}).status_code == 400
    r = client.post(url + "understand", json={"mode": "run"}).json()
    assert r["output_file"].endswith("RNMS-26235-understand.md") and runs[0][1] == ["--permission-mode", "plan"]
    assert client.get(url + "understand/output").json() == {"output": None}
    with open(r["output_file"], "w") as f:
        f.write("analysis")
    assert client.get(url + "understand/output").json() == {"output": "analysis"}

    assert client.post(url + "zzz", json={"mode": "prompt"}).status_code == 404
    assert client.post(url + "develop", json={"mode": "rm"}).status_code == 422
    unknown = client.post("/api/ticket-delivery/tickets/RNMS-99999/stages/develop", json={"mode": "prompt"})
    assert unknown.status_code == 200
    unknown_prompt = open(unknown.json()["prompt_file"]).read()
    assert "Read RNMS-99999 from Jira with the Atlassian MCP first" in unknown_prompt and "Ticket brief" not in unknown_prompt
    assert client.get("/api/ticket-delivery/tickets/RNMS-1/stages/zzz/output").status_code == 404

    monkeypatch.setattr(svc.sys, "platform", "win32")
    assert "DELIVERY_TERMINAL_CMD" in client.post(url + "develop", json={"mode": "launch"}).json()["detail"]
    monkeypatch.setattr(settings, "DELIVERY_TERMINAL_CMD", "no-such-terminal {cmd}")

    def boom(argv):
        raise FileNotFoundError(argv[0])
    monkeypatch.setattr(launcher, "launch_detached", boom)
    assert "Could not open a terminal" in client.post(url + "develop", json={"mode": "launch"}).json()["detail"]

    monkeypatch.setattr(settings, "DELIVERY_REPO_PATH", None)
    assert client.post(url + "develop", json={"mode": "prompt"}).status_code == 400


def test_launch_rejects_non_local_host(client):
    from fastapi.testclient import TestClient
    from app.main import app
    remote = TestClient(app, base_url="http://evil.example")
    assert remote.post("/api/ticket-delivery/tickets/RNMS-1/stages/develop", json={"mode": "prompt"}).status_code == 403


def test_ticket_repo(client, delivery_settings):
    assert client.get("/api/ticket-delivery/tickets/RNMS-1/repo").json()["repo"] == "app"
    assert client.get("/api/ticket-delivery/tickets/bad/repo").status_code == 400


def test_health_verifies_live_credentials(client, delivery_settings, monkeypatch):
    from app.clients.github_client import GithubClient
    monkeypatch.setattr(launcher, "run_version", lambda b: {"ok": True, "detail": "x"})
    monkeypatch.setattr(settings, "JIRA_BASE_URL", "https://j.atlassian.net")
    monkeypatch.setattr(settings, "JIRA_API_TOKEN", "t")
    monkeypatch.setattr(settings, "GITHUB_TOKEN", "g")

    async def me_ok(self):
        return 200, {"displayName": "Srinivasan"}, None, 1.0

    async def gh_ok(self):
        return 200, {"login": "srinivasan-fh"}, None, 1.0

    monkeypatch.setattr(JiraClient, "get_myself", me_ok)
    monkeypatch.setattr(GithubClient, "get_authenticated_user", gh_ok)
    health = client.get("/api/ticket-delivery/health").json()
    assert health["jira"] == {"ok": True, "detail": "Live - signed in as Srinivasan"}
    assert health["github"] == {"ok": True, "detail": "Live - signed in as srinivasan-fh"}

    async def unauthorized(self):
        return 401, {"message": "Bad credentials"}, "HTTP Error 401: Bad credentials", 1.0

    monkeypatch.setattr(JiraClient, "get_myself", unauthorized)
    monkeypatch.setattr(GithubClient, "get_authenticated_user", unauthorized)
    health = client.get("/api/ticket-delivery/health").json()
    assert health["jira"]["ok"] is False and "not working: HTTP Error 401" in health["jira"]["detail"]
    assert health["github"]["ok"] is False and "Bad credentials" in health["github"]["detail"]
