import os
import tempfile

# Must be set before app modules import settings / create the engine.
_TMP = tempfile.mkdtemp(prefix="portal-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'test.db')}"
os.environ["DELIVERY_DATA_DIR"] = os.path.join(_TMP, "delivery_data")
for var in ("JIRA_BASE_URL", "JIRA_API_TOKEN", "GITHUB_TOKEN", "ZOHO_CLIENT_ID"):
    os.environ[var] = ""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def client():
    # Launch endpoints only answer localhost Host headers.
    return TestClient(app, base_url="http://127.0.0.1:8000")


@pytest.fixture
def delivery_settings(monkeypatch, tmp_path):
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    monkeypatch.setattr(settings, "DELIVERY_REPO_PATH", str(repo))
    monkeypatch.setattr(settings, "GITHUB_OWNER", "uktech")
    monkeypatch.setattr(settings, "GITHUB_REPO", "app")
    monkeypatch.setattr(settings, "DELIVERY_JIRA_PROJECT_KEYS", "")
    return repo
