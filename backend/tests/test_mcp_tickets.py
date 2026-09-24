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


MCP_LIST = """Checking MCP server health...

claude.ai Atlassian Rovo: https://mcp.atlassian.com/v1/mcp - ✓ Connected
github: npx -y @modelcontextprotocol/server-github - ✓ Connected
"""


def _fake_claude(tmp_path, stdout, code=0, mcp_list=MCP_LIST):
    script = tmp_path / "claude"
    (tmp_path / "out.txt").write_text(stdout)
    (tmp_path / "mcp.txt").write_text(mcp_list)
    script.write_text(
        '#!/bin/sh\n'
        f'if [ "$1" = "mcp" ]; then cat "{tmp_path}/mcp.txt"; exit 0; fi\n'
        f'printf "%s\\n" "$@" > "{tmp_path}/args.txt"\ncat "{tmp_path}/out.txt"\nexit {code}\n')
    script.chmod(0o755)
    return str(script)


def _envelope(result, **extra):
    return json.dumps({"type": "result", "is_error": False, "result": result, **extra})


def test_mcp_tickets_endpoint(client, monkeypatch, tmp_path):
    reply = json.dumps([{"key": "RNMS-7", "summary": "Saved addresses", "status": "Dev In Progress", "url": "https://fh.atlassian.net/browse/RNMS-7"}])
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, _envelope(reply)))
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "RNMS")
    monkeypatch.setattr(settings, "CLAUDE_JIRA_MCP_SERVERS", "atlassian")
    body = client.post("/api/ticket-delivery/mcp-tickets?sprint=next").json()
    assert body["source"] == "claude-mcp" and body["tickets"][0]["key"] == "RNMS-7"
    assert body["jql"] == 'project in ("RNMS") AND sprint in futureSprints() AND assignee = currentUser() AND issuetype not in subTaskIssueTypes() ORDER BY rank ASC'
    args = (tmp_path / "args.txt").read_text().splitlines()
    assert args[0] == "-p" and "sprint in futureSprints()" in "\n".join(args)
    allowed = args[args.index("--allowedTools") + 1].split(",")
    # detected from `claude mcp list` first, then the configured names - read-only tools only
    assert allowed == [f"mcp__{server}__{tool}" for server in ("claude_ai_Atlassian_Rovo", "atlassian")
                       for tool in ("searchJiraIssuesUsingJql", "getAccessibleAtlassianResources", "atlassianUserInfo")]
    assert body["mcp_servers"] == ["claude_ai_Atlassian_Rovo", "atlassian"]


def test_object_reply_and_real_empty_sprint(client, monkeypatch, tmp_path):
    reply = json.dumps({"error": None, "tickets": [{"key": "RNMS-28293", "summary": "Create MS store", "status": "To Do"}]})
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, _envelope("```json\n" + reply + "\n```")))
    assert [t["key"] for t in client.post("/api/ticket-delivery/mcp-tickets").json()["tickets"]] == ["RNMS-28293"]
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, _envelope('{"error": null, "tickets": []}')))
    r = client.post("/api/ticket-delivery/mcp-tickets")
    assert r.status_code == 200 and r.json()["tickets"] == []


def test_blocked_jira_tool_is_an_error_not_an_empty_list(client, monkeypatch, tmp_path):
    # The bug users hit: Claude was denied the Jira tool, replied "[]", and the page showed nothing.
    denied = [{"tool_name": "mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql", "tool_use_id": "t1", "tool_input": {}}]
    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, _envelope("[]", permission_denials=denied), mcp_list="No MCP servers configured."))
    monkeypatch.setattr(settings, "CLAUDE_JIRA_MCP_SERVERS", "atlassian")
    detail = client.post("/api/ticket-delivery/mcp-tickets").json()["detail"]
    assert "not allowed to use mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql" in detail
    assert "Allowed MCP servers: atlassian" in detail and "CLAUDE_JIRA_MCP_SERVERS" in detail

    monkeypatch.setattr(settings, "CLAUDE_BIN", _fake_claude(tmp_path, _envelope('{"error": "No Jira MCP tools are available", "tickets": []}')))
    r = client.post("/api/ticket-delivery/mcp-tickets")
    assert r.status_code == 502 and "No Jira MCP tools are available" in r.json()["detail"]


def test_discover_and_prefix():
    assert launcher.mcp_tool_prefix("claude.ai Atlassian Rovo") == "claude_ai_Atlassian_Rovo"
    assert launcher.mcp_tool_prefix("claude.ai Atlassian Rovo (2)") == "claude_ai_Atlassian_Rovo_2"
    assert launcher.mcp_tool_prefix(" jira-cloud ") == "jira-cloud"
    assert launcher.discover_jira_mcp_servers("/no/such/claude", "/") == []


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


def test_retries_once_with_the_server_named_in_the_denial(client, monkeypatch, tmp_path):
    # The user's case: detection/config didn't produce the exact name (claude_ai_Atlassian_Rovo_2).
    ok = _envelope(json.dumps({"error": None, "tickets": [{"key": "RNMS-28293", "summary": "Create MS store"}]}))
    denied = _envelope("[]", permission_denials=[
        {"tool_name": "mcp__claude_ai_Atlassian_Rovo_2__getAccessibleAtlassianResources"},
        {"tool_name": "mcp__claude_ai_Atlassian_Rovo_2__searchJiraIssuesUsingJql"},
        {"tool_name": "mcp__claude_ai_Atlassian_Rovo_2__createJiraIssue"},
    ])
    (tmp_path / "ok.txt").write_text(ok)
    (tmp_path / "denied.txt").write_text(denied)
    script = tmp_path / "claude"
    script.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = "mcp" ]; then echo "No MCP servers configured."; exit 0; fi\n'
        f'echo run >> "{tmp_path}/runs.txt"\n'
        f'printf "%s\\n" "$@" > "{tmp_path}/args.txt"\n'
        f'case "$*" in *mcp__claude_ai_Atlassian_Rovo_2__searchJiraIssuesUsingJql*) cat "{tmp_path}/ok.txt";; *) cat "{tmp_path}/denied.txt";; esac\n')
    script.chmod(0o755)
    monkeypatch.setattr(settings, "CLAUDE_BIN", str(script))
    monkeypatch.setattr(settings, "CLAUDE_JIRA_MCP_SERVERS", "claude_ai_Atlassian_Rovo")
    body = client.post("/api/ticket-delivery/mcp-tickets").json()
    assert [t["key"] for t in body["tickets"]] == ["RNMS-28293"]
    assert body["mcp_servers"] == ["claude_ai_Atlassian_Rovo", "claude_ai_Atlassian_Rovo_2"]
    assert (tmp_path / "runs.txt").read_text().count("run") == 2
    args = (tmp_path / "args.txt").read_text()
    assert "createJiraIssue" not in args  # write tools are never allowed, even when denied


def test_subtasks_are_dropped_from_claude_reply():
    reply = json.dumps({"error": None, "tickets": [
        {"key": "RNMS-23793", "summary": "Enable Menu File Upload", "type": "Story"},
        {"key": "RNMS-23794", "summary": "Development", "type": "Sub-task"},
        {"key": "RNMS-28321", "summary": "Database Alter Updates", "type": "Subtask"},
        {"key": "RNMS-28352", "summary": "API Development and Deployments", "type": "Dev Task", "subtask": True},
    ]})
    assert [t["key"] for t in parse_ticket_list(reply)] == ["RNMS-23793"]
