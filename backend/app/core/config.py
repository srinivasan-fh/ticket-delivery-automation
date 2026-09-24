import os
import re
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

# Example values from .env.example ("your-jira-api-token", "you@yourdomain.com", "/path/to/...").
# start.sh copies .env.example to backend/.env on first run; without this, those placeholders
# count as real credentials and every integration goes "live" against hosts that don't exist.
_PLACEHOLDER_RE = re.compile(r"your[-_]|yourdomain|your-domain|^/path/to/", re.IGNORECASE)


def is_placeholder(value: Optional[str]) -> bool:
    return bool(value) and bool(_PLACEHOLDER_RE.search(value))

class Settings(BaseSettings):
    # API configuration
    JIRA_BASE_URL: Optional[str] = None
    JIRA_EMAIL: Optional[str] = None
    JIRA_API_TOKEN: Optional[str] = None

    GITHUB_TOKEN: Optional[str] = None
    GITHUB_OWNER: Optional[str] = None
    GITHUB_REPO: Optional[str] = None

    JENKINS_URL: Optional[str] = None
    JENKINS_USER: Optional[str] = None
    JENKINS_TOKEN: Optional[str] = None

    OCTOPUS_URL: Optional[str] = None
    OCTOPUS_API_KEY: Optional[str] = None

    CRM_BASE_URL: Optional[str] = None
    CRM_API_KEY: Optional[str] = None

    ITSM_BASE_URL: Optional[str] = None
    ITSM_API_KEY: Optional[str] = None

    # OAuth self-client, not an Incoming Webhook - matches the org's existing zoho-cliq
    # MCP integration, which already has this workspace's Cliq access working this way.
    ZOHO_CLIENT_ID: Optional[str] = None
    ZOHO_CLIENT_SECRET: Optional[str] = None
    ZOHO_REFRESH_TOKEN: Optional[str] = None
    ZOHO_CLIQ_DOMAIN: str = "cliq.zoho.com"
    ZOHO_ACCOUNTS_URL: str = "https://accounts.zoho.com"

    # JIRA "Push to QA" always reassigns to this person for validation, and @-mentions them
    # in the Cliq notification - configurable rather than hardcoded so this stays a per-deployment setting.
    PUSH_TO_QA_ASSIGNEE_EMAIL: Optional[str] = None
    PUSH_TO_QA_ASSIGNEE_NAME: str = "QA"

    # QA_ASSIGNEE_{n}_NAME/EMAIL, APPROVAL_PEER_{n}_NAME/EMAIL, and PR_REVIEWER_NAME/EMAIL are
    # all managed dynamically via the Team Contacts page (app/core/team_contacts.py reads them
    # straight from .env, no fixed slot count) - not declared here as typed settings fields.

    # The PR reviewer's real GitHub login, as it appears in a PR's reviews list - used to tell
    # whether they've already approved. Kept as a plain setting (not part of the dynamic Team
    # Contacts list) since it rarely changes and isn't a Cliq-messaging identity.
    PR_REVIEWER_GITHUB_LOGIN: str = "sangesh-t2s"

    # Ticket Delivery - current/next sprint tickets handed off to Claude per delivery stage.
    # Comma-separated project keys to scope the sprint query (blank = every project on the sprint).
    DELIVERY_JIRA_PROJECT_KEYS: str = ""
    # Board id pins the exact active / next sprint; without it openSprints()/futureSprints() are used.
    DELIVERY_JIRA_BOARD_ID: Optional[str] = None
    DELIVERY_ONLY_MINE: bool = True
    # customfield_10010 is this instance's real "Sprint" field (see JiraService.get_ticket).
    DELIVERY_SPRINT_FIELD: str = "customfield_10010"
    DELIVERY_STORY_POINTS_FIELD: str = "customfield_10016"
    CLAUDE_BIN: str = "claude"
    CLAUDE_SKILL: str = "rn-ticket-delivery"
    CLAUDE_DESIGN_URL: str = "https://claude.ai"
    # Terminal for "Open in Claude Code"; "{cmd}" is replaced by the shell command,
    # e.g. "gnome-terminal -- bash -lc {cmd}". Blank = Terminal.app on macOS, x-terminal-emulator on Linux.
    DELIVERY_TERMINAL_CMD: Optional[str] = None
    # Local clone used when a project isn't in DELIVERY_REPO_MAP; GitHub repo falls back to GITHUB_OWNER/GITHUB_REPO.
    DELIVERY_REPO_PATH: Optional[str] = None
    # JSON per Jira project: {"RNMS": {"path": "/code/app", "owner": "uktech", "repo": "app", "sit_branch": "sit", "main_branch": "main"}}
    DELIVERY_REPO_MAP: str = ""
    # Prompts and background-run output are written here (relative to backend/).
    DELIVERY_DATA_DIR: str = "delivery_data"
    # My Tickets page: Claude Code (claude -p) lists sprint tickets through its Atlassian MCP.
    # Atlassian servers are detected from `claude mcp list`; names listed here are allowed too
    # (as tool prefixes, e.g. claude_ai_Atlassian_Rovo). Only read-only Jira search tools are allowed.
    CLAUDE_JIRA_MCP_SERVERS: str = "atlassian,Atlassian,claude_ai_Atlassian,claude_ai_Atlassian_Rovo,Atlassian_Rovo"
    CLAUDE_MCP_TIMEOUT_SECONDS: int = 240
    # Post "<stage> checklist complete" to the Code Red - Internal Cliq channel. Off by default.
    DELIVERY_CLIQ_NOTIFY: bool = False

    # General configuration
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8000
    HOST: str = "127.0.0.1"
    DATABASE_URL: str = "sqlite:///./dev_portal.db"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def _drop_placeholders(self):
        for name, value in list(self.__dict__.items()):
            if isinstance(value, str) and is_placeholder(value):
                setattr(self, name, self.model_fields[name].default)
        return self

    @property
    def jira_configured(self) -> bool:
        return bool(self.JIRA_BASE_URL and self.JIRA_API_TOKEN)

    @property
    def github_configured(self) -> bool:
        # Owner/repo are per-call parameters (a pasted PR link can point at any repo the
        # token has access to), not a prerequisite for "is GitHub live".
        return bool(self.GITHUB_TOKEN)

    @property
    def jenkins_configured(self) -> bool:
        return bool(self.JENKINS_URL and self.JENKINS_TOKEN)

    @property
    def octopus_configured(self) -> bool:
        return bool(self.OCTOPUS_URL and self.OCTOPUS_API_KEY)

    @property
    def crm_configured(self) -> bool:
        return bool(self.CRM_BASE_URL and self.CRM_API_KEY)

    @property
    def itsm_configured(self) -> bool:
        return bool(self.ITSM_BASE_URL and self.ITSM_API_KEY)

    @property
    def zoho_cliq_configured(self) -> bool:
        return bool(self.ZOHO_CLIENT_ID and self.ZOHO_CLIENT_SECRET and self.ZOHO_REFRESH_TOKEN)

settings = Settings()
