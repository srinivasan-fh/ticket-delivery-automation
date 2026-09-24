import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.config import settings
from app.api import jira, github, devops, crm, itsm, logs, release_ticket, tag_watcher, tag_promotion, team_contacts

router = APIRouter(prefix="/api")

# Include sub-routers
router.include_router(jira.router)
router.include_router(github.router)
router.include_router(devops.router)
router.include_router(crm.router)
router.include_router(itsm.router)
router.include_router(logs.router)
router.include_router(release_ticket.router)
router.include_router(tag_watcher.router)
router.include_router(tag_promotion.router)
router.include_router(team_contacts.router)

# Settings Schema
class SettingsUpdatePayload(BaseModel):
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

# Secret fields never round-trip their real (or masked) value to the client - a masked
# preview like "abc...xyz" looks identical to a real edit once merged with new keystrokes
# in a password input, so any partially-cleared field would silently corrupt the secret
# with literal "..." baked into it. The client only ever sees whether one is set.
SECRET_FIELDS = {"JIRA_API_TOKEN", "GITHUB_TOKEN", "JENKINS_TOKEN", "OCTOPUS_API_KEY", "CRM_API_KEY", "ITSM_API_KEY"}

@router.get("/settings", tags=["Settings"])
async def get_settings():
    return {
        "JIRA_BASE_URL": settings.JIRA_BASE_URL or "",
        "JIRA_EMAIL": settings.JIRA_EMAIL or "",
        "JIRA_API_TOKEN": "",
        "JIRA_API_TOKEN_configured": bool(settings.JIRA_API_TOKEN),
        "GITHUB_TOKEN": "",
        "GITHUB_TOKEN_configured": bool(settings.GITHUB_TOKEN),
        "GITHUB_OWNER": settings.GITHUB_OWNER or "",
        "GITHUB_REPO": settings.GITHUB_REPO or "",
        "JENKINS_URL": settings.JENKINS_URL or "",
        "JENKINS_USER": settings.JENKINS_USER or "",
        "JENKINS_TOKEN": "",
        "JENKINS_TOKEN_configured": bool(settings.JENKINS_TOKEN),
        "OCTOPUS_URL": settings.OCTOPUS_URL or "",
        "OCTOPUS_API_KEY": "",
        "OCTOPUS_API_KEY_configured": bool(settings.OCTOPUS_API_KEY),
        "CRM_BASE_URL": settings.CRM_BASE_URL or "",
        "CRM_API_KEY": "",
        "CRM_API_KEY_configured": bool(settings.CRM_API_KEY),
        "ITSM_BASE_URL": settings.ITSM_BASE_URL or "",
        "ITSM_API_KEY": "",
        "ITSM_API_KEY_configured": bool(settings.ITSM_API_KEY),
        "APP_ENV": settings.APP_ENV,
        "LOG_LEVEL": settings.LOG_LEVEL,
        "is_jira_configured": settings.jira_configured,
        "is_github_configured": settings.github_configured,
        "is_jenkins_configured": settings.jenkins_configured,
        "is_octopus_configured": settings.octopus_configured,
        "is_crm_configured": settings.crm_configured,
        "is_itsm_configured": settings.itsm_configured,
    }

@router.post("/settings", tags=["Settings"])
async def update_settings(payload: SettingsUpdatePayload):
    """
    Dynamically update `.env` file on disk and reload runtime config.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")

    # Read existing lines or start empty
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

    # Parse key-values from payload
    updates = payload.model_dump(exclude_unset=True)

    # Update config in settings object
    for k, v in updates.items():
        if v is not None:
            # Secret fields are never pre-filled with a real/masked value on the client, so a
            # blank submission always means "leave unchanged", never "clear it".
            if k in SECRET_FIELDS and v == "":
                continue
            setattr(settings, k, v)
            
            # Update lines in list
            key_found = False
            for idx, line in enumerate(lines):
                if line.strip().startswith(f"{k}="):
                    lines[idx] = f"{k}={v}\n"
                    key_found = True
                    break
            if not key_found:
                lines.append(f"{k}={v}\n")
                
    # Write back to file
    try:
        with open(env_path, "w") as f:
            f.writelines(lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write configuration: {str(e)}")
        
    return {"status": "success", "message": "Configuration updated and saved to .env"}
