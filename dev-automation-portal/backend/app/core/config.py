import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

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
