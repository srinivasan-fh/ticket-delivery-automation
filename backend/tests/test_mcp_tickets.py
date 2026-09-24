import json

import pytest

from app.core import launcher
from app.core.config import settings
from app.services.ticket_delivery_service import DeliveryError, parse_ticket_list


def test_parse_ticket_list_extracts_and_cleans():
    reply = 'Here you go:\n[{"key": "RNMS-1", "summary": "Login", "status": "To Do", "story_points": 3, "url": "https://x.atlassian.net/browse/RNMS-1"},' \
            ' {"key": "not a key"}, {"key": "RNMS-2", "story_points": true, "url": "javascript:alert(1)"}, "junk"]\nDone.'
    tickets = parse_ticket_list(reply)
    assert [t["key"] for t in tickets] == ["RNMS-1", "RNMS-2"]
    assert tickets[0]["story_points"] == 3 and tickets[0]["url"].startswith("https://")
    assert tickets[1]["story_points"] is None and tickets[1]["url"] is None
    assert parse_ticket_list("[]") == []
    with pytest.raises(DeliveryError, match="did not return a ticket list"):
        parse_ticket_list("I could not access Jira.")
    with pytest.raises(DeliveryError, match="not valid JSON"):
        parse_ticket_list("[{bad json]")


def _fake_claude(tmp_path, stdout, code=0):
    script = tmp_path / "claude"
    (tmp_path / "out.txt").write_text(stdout)
    script.write_text(f'#!/bin/sh\nprintf "%s\\n" "$@" > "{tmp_path}/args.txt"\ncat "{tmp_path}/out.txt"\nexit {code}\n')
    script.chmod(0o755)
    return str(script)


def test_mcp_tickets_endpoint(client, monkeypatch, tmp_path):
    reply = json.dumps([{"key": "RNMS-7", "summary": "Saved addresses", "status": "Dev In Progress", "url": "https://fh.atlassian.net/browse/RNMS-7"}])
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, json.dumps({"type": "result", "is_error": False, "result": reply})))
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "RNMS")
    monkeypatch.setattr(settings, "CLAUDE_JIRA_MCP_SERVERS", "atlassian")
    body = client.post("/api/ticket-delivery/mcp-tickets?sprint=next").json()
    assert body["source"] == "claude-mcp" and body["tickets"][0]["key"] == "RNMS-7"
    assert body["jql"] == 'project in ("RNMS") AND sprint in futureSprints() AND assignee = currentUser() ORDER BY rank ASC'
    args = (tmp_path / "args.txt").read_text().splitlines()
    assert args[0] == "-p" and "sprint in futureSprints()" in "\n".join(args)
    allowed = args[args.index("--allowedTools") + 1].split(",")
    assert allowed == ["mcp__atlassian__searchJiraIssuesUsingJql", "mcp__atlassian__getAccessibleAtlassianResources", "mcp__atlassian__atlassianUserInfo"]


def test_mcp_tickets_errors(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, json.dumps({"is_error": True, "result": "MCP server not connected"})))
    r = client.post("/api/ticket-delivery/mcp-tickets")
    assert r.status_code == 502 and "MCP server not connected" in r.json()["detail"]

    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, "Invalid API key · Please run /login", code=1))
    assert "Invalid API key" in client.post("/api/ticket-delivery/mcp-tickets").json()["detail"]

    monkeypatch.setattr(settings, "CLAUDE_BIN", str(tmp_path / "missing"))
    assert "Could not run Claude Code" in client.post("/api/ticket-delivery/mcp-tickets").json()["detail"]

    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, "[1, 2]"))
    assert "unexpected response" in client.post("/api/ticket-delivery/mcp-tickets").json()["detail"]


def test_mcp_tickets_timeout(monkeypatch, tmp_path):
    slow = tmp_path / "slow"
    slow.write_text("#!/bin/sh\nsleep 5\n")
    slow.chmod(0o755)
    with pytest.raises(RuntimeError, match="did not answer within 1s"):
        launcher.run_claude_print(str(slow), "x", [], str(tmp_path), 1)


def test_mcp_tickets_rejects_non_local_host():
    from fastapi.testclient import TestClient
    from app.main import app
    assert TestClient(app, base_url="http://evil.example").post("/api/ticket-delivery/mcp-tickets").status_code == 403
