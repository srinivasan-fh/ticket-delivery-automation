import time
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.clients.octopus_client import OctopusClient
from app.clients.jira_client import JiraClient
from app.services.jira_service import extract_text_from_adf

# Verified against Jira's own createmeta API (GET /rest/api/3/issue/createmeta/ITSM/issuetypes/10835)
# and cross-checked against jira-analyser-mcp's already-working hardcoded mapping for the same
# request (portal 34, request type 375, "CloudSecOps - ITSM Release Management").
RELEASE_MGMT_PROJECT_KEY = "ITSM"
RELEASE_MGMT_ISSUE_TYPE_ID = "10835"
RELEASE_MGMT_SERVICE_DESK_ID = "34"
RELEASE_MGMT_REQUEST_TYPE_ID = "375"

PREPROD_ENV_ID = "Environments-2"
PROD_ENV_ID = "Environments-3"

ENVIRONMENT_OPTIONS = {
    "Pre-Prod": {"id": "10733", "children": {"N/A": "10741"}},
    "Prod": {"id": "10734", "children": {"Normal Release": "11818", "Exception Release": "10735", "HotFix Release": "10737"}},
    "Prod-Beta": {"id": "11825", "children": {"Normal Release": "11826", "Exception Release": "11827"}},
    "PRODFALLBACK": {"id": "13718", "children": {"Normal Release": "13719", "Exception Release": "13720", "HotFix Release": "14152"}},
}

YES_NO = {
    "architect_review": {"Yes": "10761", "No": "10762"},
    "notify_training_team": {"Yes": "10724", "No": "10725"},
    "additional_logging_required": {"Yes": "10754", "No": "10755"},
    "qa_signoff_received": {"Yes": "10728", "No": "10729"},
}

DEFAULT_QA_TOUCH_URL = "https://foodhub.qatouch.com/v2#/overview/p/8vek"

# customfield_10277 ("Github Repository Name", labeled "Octopus Project Name" on the portal)
REPO_CONFIGS = {
    "MS": {"jira_project_option_id": "10684", "octopus_project_id": "Projects-6"},
    "MSWEB": {"jira_project_option_id": "10687", "octopus_project_id": "Projects-381"},
    "FALCON-BOBCRM": {"jira_project_option_id": "13403", "octopus_project_id": "Projects-881"},
}

# customfield_12232 ("Octopus Channel Name") - flat select, only relevant for FALCON-BOBCRM.
# Placeholder list of the 9 known channels pending the user's final list/order.
FALCON_BOBCRM_CHANNELS = {
    "falcon-bobcrm-specs-service": {"jira_option_id": "13405", "octopus_channel_id": "Channels-1446"},
    "falcon-bobcrm-bing-service": {"jira_option_id": "13406", "octopus_channel_id": "Channels-1441"},
    "falcon-bobcrm-common-infra-service": {"jira_option_id": "13407", "octopus_channel_id": "Channels-1442"},
    "falcon-bobcrm-extras-service": {"jira_option_id": "13408", "octopus_channel_id": "Channels-1443"},
    "falcon-bobcrm-reseller-service": {"jira_option_id": "13409", "octopus_channel_id": "Channels-1444"},
    "falcon-bobcrm-sms-campaign-service": {"jira_option_id": "13410", "octopus_channel_id": "Channels-1445"},
    "falcon-bobcrm-zoho-service": {"jira_option_id": "13411", "octopus_channel_id": "Channels-1447"},
    "falcon-bobcrm-billing-automation-service": {"jira_option_id": "13412", "octopus_channel_id": "Channels-1381"},
    "falcon-bobcrm-billing-service": {"jira_option_id": "13413", "octopus_channel_id": "Channels-1382"},
}


def _text_or_adf(value: Any) -> Optional[str]:
    """A handful of the release-ticket text fields are rich-text (ADF) rather than
    plain strings on real, already-created tickets - normalize either shape to plain text."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return extract_text_from_adf(value).strip()
    return None


class ReleaseTicketService:
    def __init__(self):
        self.octopus_client = OctopusClient()
        self.jira_client = JiraClient()

    async def _resolve_last_deployed(self, project_id: str, environment_id: str, channel_id: Optional[str] = None) -> Optional[str]:
        """Newest deployment to this environment (optionally scoped to a channel) whose
        underlying task succeeded. Mirrors jira-analyser-mcp's proven resolveReleaseCandidate
        deployments+tasks lookup (deployments alone don't carry success/failure state)."""
        status_code, data, error, _ = await self.octopus_client.get_deployments(project_id, environment_id, channel_id, take=10)
        if status_code != 200 or not isinstance(data, dict):
            return None
        deployments = data.get("Items") or []
        if not deployments:
            return None

        task_ids = [d.get("TaskId") for d in deployments if d.get("TaskId")]
        if not task_ids:
            return None
        t_status, t_data, t_error, _ = await self.octopus_client.get_tasks(task_ids)
        if t_status != 200 or not isinstance(t_data, dict):
            return None
        state_by_task = {t.get("Id"): t.get("State") for t in (t_data.get("Items") or [])}

        for d in deployments:
            if state_by_task.get(d.get("TaskId")) == "Success":
                changes = d.get("Changes") or []
                if changes and changes[0].get("Version"):
                    return changes[0]["Version"]
        return None

    async def get_release_candidate(self, repo: str, channel: Optional[str] = None) -> Dict[str, str]:
        repo_cfg = REPO_CONFIGS.get(repo)
        if not repo_cfg:
            raise ValueError(f"Unknown repo '{repo}'")

        channel_id = None
        if repo == "FALCON-BOBCRM":
            if not channel:
                raise ValueError("channel is required for FALCON-BOBCRM")
            channel_cfg = FALCON_BOBCRM_CHANNELS.get(channel)
            if not channel_cfg:
                raise ValueError(f"Unknown FALCON-BOBCRM channel '{channel}'")
            channel_id = channel_cfg["octopus_channel_id"]

        project_id = repo_cfg["octopus_project_id"]
        github_release_tag = await self._resolve_last_deployed(project_id, PREPROD_ENV_ID, channel_id)
        github_reverting_tag = await self._resolve_last_deployed(project_id, PROD_ENV_ID, channel_id)

        if not github_release_tag:
            raise ValueError(f"No successful deployment found for {repo} in Pre-Prod")
        if not github_reverting_tag:
            raise ValueError(f"No successful deployment found for {repo} in Prod")

        return {"github_release_tag": github_release_tag, "github_reverting_tag": github_reverting_tag}

    async def create_release_ticket(
        self,
        repo: str,
        description: str,
        environment: str,
        release_type: str,
        channel: Optional[str] = None,
        github_release_tag: str = "",
        github_reverting_tag: str = "",
        jira_issue_links: Optional[List[str]] = None,
        architect_review: str = "No",
        notify_training_team: str = "No",
        additional_logging_required: str = "No",
        what_to_monitor: Optional[str] = None,
        qa_signoff_received: str = "Yes",
        qa_touch_url: Optional[str] = None,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()

        if not settings.jira_configured:
            return {"success": False, "error": "Jira is not configured"}
        if not settings.octopus_configured:
            return {"success": False, "error": "Octopus is not configured"}

        repo_cfg = REPO_CONFIGS.get(repo)
        if not repo_cfg:
            return {"success": False, "error": f"Unknown repo '{repo}'"}

        env_cfg = ENVIRONMENT_OPTIONS.get(environment)
        if not env_cfg:
            return {"success": False, "error": f"Unknown environment '{environment}'"}
        release_type_id = env_cfg["children"].get(release_type)
        if not release_type_id:
            valid = ", ".join(env_cfg["children"].keys())
            return {"success": False, "error": f'"{release_type}" is not a valid release type for environment "{environment}". Valid options: {valid}'}

        # Built via the Service Desk request-creation API (serviceDeskId/requestTypeId below),
        # not the plain issue-create API - the plain API produces a real issue but never
        # registers the JSM "Request Type" association a portal-filed request gets, and its
        # textarea fields require ADF instead of plain strings that this endpoint accepts directly.
        request_field_values: Dict[str, Any] = {
            "summary": description,
            "customfield_10292": {"id": env_cfg["id"], "child": {"id": release_type_id}},
            "customfield_10277": {"id": repo_cfg["jira_project_option_id"]},
            "customfield_10282": github_release_tag,
            "customfield_10316": github_reverting_tag,
            "customfield_10283": "\n".join(jira_issue_links or []),
            "customfield_10301": {"id": YES_NO["architect_review"][architect_review]},
            "customfield_10280": {"id": YES_NO["notify_training_team"][notify_training_team]},
        }
        # customfield_10293 (Additional Logging Required), customfield_10284 (QA Sign off
        # Received), customfield_10294 (What to Monitor), and customfield_10295 (QA Touch URL)
        # were removed from this request type's screen config on Jira's side - verified live via
        # GET /rest/servicedeskapi/servicedesk/{id}/requesttype/{id}/field, which no longer lists
        # any of them. Sending them causes a 400 ("not valid for this request type").
        if repo == "FALCON-BOBCRM" and channel:
            channel_cfg = FALCON_BOBCRM_CHANNELS.get(channel)
            if channel_cfg:
                request_field_values["customfield_12232"] = {"id": channel_cfg["jira_option_id"]}

        duration = (time.perf_counter() - start_time) * 1000
        if dry_run:
            return {"success": True, "data": {"requestFieldValues": request_field_values}, "execution_time_ms": duration}

        status_code, data, error, api_duration = await self.jira_client.create_service_desk_request(
            RELEASE_MGMT_SERVICE_DESK_ID, RELEASE_MGMT_REQUEST_TYPE_ID, request_field_values
        )
        if status_code in (200, 201):
            issue_key = data.get("issueKey") if isinstance(data, dict) else None
            issue_url = f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{issue_key}" if issue_key else None
            return {"success": True, "data": {"key": issue_key, "url": issue_url}, "execution_time_ms": api_duration}
        error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
        return {"success": False, "error": error_detail, "execution_time_ms": api_duration}

    _MY_TICKETS_JQL = f'project = {RELEASE_MGMT_PROJECT_KEY} AND issuetype = {RELEASE_MGMT_ISSUE_TYPE_ID} AND reporter = currentUser() ORDER BY created DESC'
    _LIST_FIELDS = "summary,status,created,customfield_10292,customfield_10277,customfield_12232,customfield_10282,customfield_10316"

    async def list_my_tickets(self) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        next_token = None
        for _ in range(20):
            status_code, data, error, _ = await self.jira_client.search_issues(
                self._MY_TICKETS_JQL, max_results=100, next_page_token=next_token, fields=self._LIST_FIELDS
            )
            if status_code != 200 or not isinstance(data, dict):
                break
            issues.extend(data.get("issues", []))
            if data.get("isLast", True):
                break
            next_token = data.get("nextPageToken")
            if not next_token:
                break

        tickets = []
        for issue in issues:
            f = issue.get("fields", {})
            env_field = f.get("customfield_10292") or {}
            project_field = f.get("customfield_10277") or {}
            tickets.append({
                "key": issue.get("key"),
                "summary": f.get("summary"),
                "status": (f.get("status") or {}).get("name"),
                "created": f.get("created"),
                "repo": project_field.get("value"),
                "environment": env_field.get("value"),
                "release_type": (env_field.get("child") or {}).get("value"),
                "github_release_tag": f.get("customfield_10282"),
                "github_reverting_tag": f.get("customfield_10316"),
            })
        return tickets

    async def get_ticket_detail(self, ticket_key: str) -> Dict[str, Any]:
        status_code, data, error, _ = await self.jira_client.get_ticket(ticket_key)
        if status_code != 200 or not isinstance(data, dict):
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            raise ValueError(error_detail)

        f = data.get("fields", {})
        env_field = f.get("customfield_10292") or {}
        project_field = f.get("customfield_10277") or {}
        channel_field = f.get("customfield_12232")

        comments = []
        for c in (f.get("comment") or {}).get("comments", []):
            comments.append({
                "id": c.get("id"),
                "author": (c.get("author") or {}).get("displayName"),
                "body": _text_or_adf(c.get("body")),
                "created": c.get("created"),
            })

        approvals = []
        appr_status, appr_data, _appr_error, _ = await self.jira_client.get_approvals(ticket_key)
        if appr_status == 200 and isinstance(appr_data, dict):
            for a in appr_data.get("values", []):
                approvals.append({
                    "name": a.get("name"),
                    "final_decision": a.get("finalDecision"),
                    "approvers": [
                        {
                            "display_name": (ap.get("approver") or {}).get("displayName"),
                            "decision": ap.get("approverDecision"),
                        }
                        for ap in a.get("approvers", [])
                    ],
                })

        return {
            "key": data.get("key"),
            "url": f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{data.get('key')}",
            "summary": f.get("summary"),
            "status": (f.get("status") or {}).get("name"),
            "created": f.get("created"),
            "reporter": (f.get("reporter") or {}).get("displayName"),
            "assignee": (f.get("assignee") or {}).get("displayName"),
            "repo": project_field.get("value"),
            "environment": env_field.get("value"),
            "release_type": (env_field.get("child") or {}).get("value"),
            "channel": (channel_field or {}).get("value") if channel_field else None,
            "github_release_tag": f.get("customfield_10282"),
            "github_reverting_tag": f.get("customfield_10316"),
            "jira_issue_links": _text_or_adf(f.get("customfield_10283")),
            "architect_review": (f.get("customfield_10301") or {}).get("value"),
            "notify_training_team": (f.get("customfield_10280") or {}).get("value"),
            "additional_logging_required": (f.get("customfield_10293") or {}).get("value"),
            "what_to_monitor": _text_or_adf(f.get("customfield_10294")),
            "qa_signoff_received": (f.get("customfield_10284") or {}).get("value"),
            "qa_touch_url": f.get("customfield_10295"),
            "comments": comments,
            "approvals": approvals,
        }
