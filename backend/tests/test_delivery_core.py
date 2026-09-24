import os
import subprocess
import time

import pytest

from app.core import launcher
from app.core.delivery_checklist import ACCESS_CHECKLIST, STAGE_CHECKLISTS
from app.core.delivery_stages import STAGES, build_prompt, get_stage
from app.services.ticket_delivery_service import DeliveryError, build_jql, project_keys, repo_for, require_ticket_key
from app.core.config import settings
from scripts.generate_checklist import CHECKLIST_PATH, render


def test_checklist_md_is_up_to_date():
    with open(CHECKLIST_PATH, encoding="utf-8") as f:
        assert f.read() == render(), "Run `python -m scripts.generate_checklist` from backend/"


def test_stages_have_unique_checklists():
    assert [s["id"] for s in STAGES] == list(STAGE_CHECKLISTS)
    for s in STAGES:
        ids = [c["id"] for c in s["checklist"]]
        assert ids and len(ids) == len(set(ids)), s["id"]
    access_ids = [i["id"] for g in ACCESS_CHECKLIST for i in g["items"]]
    assert len(access_ids) == len(set(access_ids))
    assert [s["id"] for s in STAGES if s["headless"]] == ["understand"]
    assert "--chrome" in get_stage("test")["args"]
    assert get_stage("deliver-sit")["portal"] == "sit" and get_stage("deliver-production")["portal"] == "main"
    assert get_stage("nope") is None


def test_build_prompt():
    ticket = {"key": "RNMS-1", "summary": "Login", "issue_type": "Story", "status": "To Do", "priority": "High",
              "story_points": 0, "url": "https://j/browse/RNMS-1", "description": "AC1"}
    p = build_prompt(get_stage("develop"), ticket, "rn-ticket-delivery")
    assert p.startswith("Use the rn-ticket-delivery skill for Jira ticket RNMS-1. Stage: Develop + Unit Tests.")
    assert "- [ ] Unit tests written" in p
    assert "First read RNMS-1 from Jira with the Atlassian MCP" in p
    assert "Points: -" in p and "Link: https://j/browse/RNMS-1" in p
    assert p.endswith("Description:\nAC1\n")
    p2 = build_prompt(get_stage("design"), {**ticket, "url": None, "description": "No description"}, "s")
    assert "Link:" not in p2 and "Description:" not in p2


def test_build_jql():
    assert build_jql(["A", "B"], "sprint in openSprints()", True) == \
        'project in ("A", "B") AND sprint in openSprints() AND assignee = currentUser() ORDER BY rank ASC'
    assert build_jql([], "sprint = 1", False) == "sprint = 1 ORDER BY rank ASC"
    assert build_jql(["RNMS"], "sprint in openSprints()", True, True) == \
        'project in ("RNMS") AND sprint in openSprints() AND assignee = currentUser() AND issuetype not in subTaskIssueTypes() ORDER BY rank ASC'


def test_project_keys_and_ticket_keys(monkeypatch):
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "rnms, man")
    assert project_keys() == ["RNMS", "MAN"]
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", 'A") OR 1=1')
    with pytest.raises(DeliveryError):
        project_keys()
    assert require_ticket_key("RNMS-12") == "RNMS-12"
    for bad in ("RNMS-1; rm -rf", "../etc", ""):
        with pytest.raises(DeliveryError):
            require_ticket_key(bad)


def test_repo_for(monkeypatch):
    monkeypatch.setattr(settings, "DELIVERY_REPO_PATH", "/d")
    monkeypatch.setattr(settings, "GITHUB_OWNER", "o")
    monkeypatch.setattr(settings, "GITHUB_REPO", "d")
    monkeypatch.setattr(settings, "DELIVERY_REPO_MAP", '{"MAN": {"path": "/m", "repo": "m", "sit_branch": "develop"}}')
    assert repo_for("MAN-1") == {"path": "/m", "owner": "o", "repo": "m", "sit_branch": "develop", "main_branch": "main"}
    assert repo_for("RNMS-1")["path"] == "/d"
    monkeypatch.setattr(settings, "DELIVERY_REPO_MAP", "{bad")
    with pytest.raises(DeliveryError, match="valid JSON"):
        repo_for("RNMS-1")


def test_shell_command_never_executes_ticket_text(tmp_path):
    prompt_file = tmp_path / "p.md"
    prompt_file.write_text("Summary: $(touch pwned) `id` it's")
    cmd = launcher.build_shell_command(str(tmp_path), "printf", ["%s"], str(prompt_file))
    assert subprocess.run(["sh", "-c", cmd], capture_output=True, text=True).stdout == "Summary: $(touch pwned) `id` it's"
    assert not (tmp_path / "pwned").exists()


def test_terminal_invocation():
    assert launcher.terminal_invocation("linux", "c") == ["x-terminal-emulator", "-e", "bash", "-lc", "c"]
    mac = launcher.terminal_invocation("darwin", 'cd \'a\' && x "$(cat \'p\')"')
    assert mac[0] == "osascript" and mac[2] == 'tell application "Terminal" to do script "cd \'a\' && x \\"$(cat \'p\')\\""'
    assert launcher.terminal_invocation("win32", "c") is None
    assert launcher.terminal_invocation("win32", "c d", "kitty  bash -lc {cmd}") == ["kitty", "bash", "-lc", "c d"]


def _wait_for(path, text):
    for _ in range(100):
        if os.path.exists(path) and text in open(path).read():
            return open(path).read()
        time.sleep(0.05)
    raise AssertionError(open(path).read() if os.path.exists(path) else "no output file")


def test_run_headless_and_version(tmp_path):
    out = tmp_path / "out.md"
    # `echo -p <prompt>` stands in for `claude -p <prompt>`
    launcher.run_headless("echo", ["--flag"], "hello", str(tmp_path), str(out)).join(5)
    text = _wait_for(out, "Exited with code 0")
    assert "-p hello --flag" in text
    launcher.run_headless(str(tmp_path / "missing"), [], "x", str(tmp_path), str(out)).join(5)
    assert "Failed to start" in _wait_for(out, "Failed to start")

    assert launcher.run_version("true")["ok"] is True
    assert launcher.run_version("false")["ok"] is False
    assert launcher.run_version(str(tmp_path / "missing"))["ok"] is False
