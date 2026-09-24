import os

from app.core import team_contacts
from app.core.config import Settings, is_placeholder

ENV_EXAMPLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env.example")


def test_is_placeholder():
    for value in ("your-jira-api-token", "https://your-domain.atlassian.net", "qa@yourdomain.com", "/path/to/your/local/clone", "YOUR_TOKEN"):
        assert is_placeholder(value), value
    for value in ("", None, "ATATT3xFfGF0abc", "https://foodhub.atlassian.net", "dev@foodhub.com", "/Users/me/code/app"):
        assert not is_placeholder(value), value


def test_placeholders_do_not_count_as_credentials(monkeypatch):
    for var in ("JIRA_BASE_URL", "JIRA_API_TOKEN", "GITHUB_TOKEN", "ZOHO_CLIENT_ID"):
        monkeypatch.delenv(var, raising=False)
    s = Settings(_env_file=None, JIRA_BASE_URL="https://your-domain.atlassian.net", JIRA_API_TOKEN="your-jira-api-token",
                 GITHUB_TOKEN="your-github-personal-access-token", PUSH_TO_QA_ASSIGNEE_EMAIL="qa-lead@yourdomain.com",
                 DELIVERY_REPO_PATH="/path/to/your/local/clone", PUSH_TO_QA_ASSIGNEE_NAME="your-name")
    assert not s.jira_configured and not s.github_configured
    assert s.JIRA_API_TOKEN is None and s.PUSH_TO_QA_ASSIGNEE_EMAIL is None and s.DELIVERY_REPO_PATH is None
    assert s.PUSH_TO_QA_ASSIGNEE_NAME == "QA"  # falls back to the field default
    real = Settings(_env_file=None, JIRA_BASE_URL="https://foodhub.atlassian.net", JIRA_API_TOKEN="ATATT3xFfGF0abc", GITHUB_TOKEN="ghp_abc")
    assert real.jira_configured and real.github_configured


def test_fresh_env_example_starts_fully_simulated(monkeypatch):
    # start.sh copies .env.example to backend/.env on first run.
    for var in list(os.environ):
        if var.split("_")[0] in {"JIRA", "GITHUB", "JENKINS", "OCTOPUS", "CRM", "ITSM", "ZOHO", "DELIVERY"}:
            monkeypatch.delenv(var)
    s = Settings(_env_file=ENV_EXAMPLE)
    assert not any([s.jira_configured, s.github_configured, s.jenkins_configured, s.octopus_configured,
                    s.crm_configured, s.itsm_configured, s.zoho_cliq_configured])
    assert not s.DELIVERY_REPO_PATH


def test_team_contacts_skip_placeholders(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("QA_ASSIGNEE_1_NAME=QA Lead One\nQA_ASSIGNEE_1_EMAIL=qa-lead-1@yourdomain.com\n"
                   "QA_ASSIGNEE_2_NAME=Priya\nQA_ASSIGNEE_2_EMAIL=priya@foodhub.com\n"
                   "PR_REVIEWER_NAME=Reviewer Name\nPR_REVIEWER_EMAIL=reviewer@yourdomain.com\n")
    monkeypatch.setattr(team_contacts, "_ENV_PATH", str(env))
    assert team_contacts.get_numbered_contacts("QA_ASSIGNEE") == [{"name": "Priya", "email": "priya@foodhub.com"}]
    assert team_contacts.get_single_contact("PR_REVIEWER") is None
