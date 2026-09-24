import base64
from typing import Any, Dict, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class JiraClient(BaseAPIClient):
    def __init__(self):
        headers = {}
        if settings.JIRA_EMAIL and settings.JIRA_API_TOKEN:
            auth_str = f"{settings.JIRA_EMAIL}:{settings.JIRA_API_TOKEN}"
            encoded_auth = base64.b64encode(auth_str.encode()).decode()
            headers["Authorization"] = f"Basic {encoded_auth}"
        
        super().__init__(
            service_name="jira",
            base_url=settings.JIRA_BASE_URL,
            default_headers=headers
        )

    async def get_ticket(self, ticket_key: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/rest/api/3/issue/{ticket_key}")

    async def add_worklog(self, ticket_key: str, time_spent: str, comment: Optional[str] = None, started: Optional[str] = None) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "timeSpent": time_spent
        }
        if comment:
            payload["comment"] = {
                "version": 1,
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": comment
                            }
                        ]
                    }
                ]
            }
        if started:
            payload["started"] = started
            
        return await self.post(f"/rest/api/3/issue/{ticket_key}/worklog", json_data=payload)

    async def delete_worklog(self, ticket_key: str, worklog_id: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.delete(f"/rest/api/3/issue/{ticket_key}/worklog/{worklog_id}")

    async def add_comment(self, ticket_key: str, body: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "body": {
                "version": 1,
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": body
                            }
                        ]
                    }
                ]
            }
        }
        return await self.post(f"/rest/api/3/issue/{ticket_key}/comment", json_data=payload)

    async def update_ticket(self, ticket_key: str, fields: Dict[str, Any]) -> Tuple[int, Any, Optional[str], float]:
        # Formulate Jira payload
        # fields can be status transitions, assignee, labels, etc.
        payload = {
            "fields": fields
        }
        return await self.put(f"/rest/api/3/issue/{ticket_key}", json_data=payload)

    async def transition_ticket(self, ticket_key: str, transition_id: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "transition": {
                "id": transition_id
            }
        }
        return await self.post(f"/rest/api/3/issue/{ticket_key}/transitions", json_data=payload)

    async def get_transitions(self, ticket_key: str) -> Tuple[int, Any, Optional[str], float]:
        # Jira only returns transitions the calling user is actually permitted to perform on
        # this issue in its current status - an empty list is a real permission signal, not a bug.
        return await self.get(f"/rest/api/3/issue/{ticket_key}/transitions")

    async def search_assignable_users(self, ticket_key: str, query: str = "") -> Tuple[int, Any, Optional[str], float]:
        # Scoped to this issue (not a blind global user search) so results already respect
        # project permissions - who's actually allowed to be assigned this specific ticket.
        params: Dict[str, Any] = {"issueKey": ticket_key}
        if query:
            params["query"] = query
        return await self.get("/rest/api/3/user/assignable/search", params=params)

    async def create_issue(self, fields: Dict[str, Any]) -> Tuple[int, Any, Optional[str], float]:
        return await self.post("/rest/api/3/issue", json_data={"fields": fields})

    async def create_service_desk_request(self, service_desk_id: str, request_type_id: str, request_field_values: Dict[str, Any]) -> Tuple[int, Any, Optional[str], float]:
        # Creating via the plain issue API (create_issue) produces a real Jira issue but never
        # registers the JSM "Request Type" association (serviceDeskId/requestTypeId) - that only
        # happens through this dedicated Service Desk request-creation endpoint, matching what a
        # customer filing the request through the actual portal produces.
        payload = {
            "serviceDeskId": service_desk_id,
            "requestTypeId": request_type_id,
            "requestFieldValues": request_field_values,
        }
        return await self.post("/rest/servicedeskapi/request", json_data=payload)

    async def get_approvals(self, ticket_key: str) -> Tuple[int, Any, Optional[str], float]:
        # JSM-specific API (not the generic issue endpoint) - approval workflow data for a
        # customer request, e.g. "Waiting Product Owner Approval" style statuses.
        return await self.get(f"/rest/servicedeskapi/request/{ticket_key}/approval")

    async def search_issues(self, jql: str, max_results: int = 100, next_page_token: Optional[str] = None, fields: Optional[str] = None) -> Tuple[int, Any, Optional[str], float]:
        # /rest/api/3/search was removed by Atlassian in favor of /search/jql (cursor-paginated via
        # nextPageToken/isLast, no `total` field - callers needing every match must page through it).
        params = {
            "jql": jql,
            "maxResults": max_results,
            "fields": fields or "summary,status,priority,issuetype,updated,assignee,customfield_10010"
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token
        return await self.get("/rest/api/3/search/jql", params=params)
