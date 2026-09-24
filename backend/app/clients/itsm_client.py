import base64
from typing import Any, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class ITSMClient(BaseAPIClient):
    def __init__(self):
        headers = {}
        # Since JSM is on Atlassian Cloud, it uses Basic Auth (email + API Token)
        email = settings.JIRA_EMAIL
        api_token = settings.ITSM_API_KEY or settings.JIRA_API_TOKEN
        
        if email and api_token:
            auth_str = f"{email}:{api_token}"
            encoded_auth = base64.b64encode(auth_str.encode()).decode()
            headers["Authorization"] = f"Basic {encoded_auth}"
            headers["Accept"] = "application/json"

        super().__init__(
            service_name="itsm",
            base_url=settings.ITSM_BASE_URL or "https://touch2success.atlassian.net",
            default_headers=headers
        )

    async def get_requests(self) -> Tuple[int, Any, Optional[str], float]:
        # Standard JSM customer portal endpoint to list requests
        return await self.get("/rest/servicedeskapi/request")

    async def raise_request(self, request_data: dict) -> Tuple[int, Any, Optional[str], float]:
        # Standard JSM customer portal endpoint to create requests
        return await self.post("/rest/servicedeskapi/request", json_data=request_data)

    async def search_requests(self, jql: str, max_results: int = 20) -> Tuple[int, Any, Optional[str], float]:
        # /rest/api/2/search and the old /rest/api/3/search were both retired (HTTP 410) in
        # favour of /rest/api/3/search/jql - description comes back in ADF (not plain text).
        params = {
            "jql": jql,
            "maxResults": str(max_results),
            "fields": "summary,description,status,created,priority,issuetype,reporter"
        }
        return await self.get("/rest/api/3/search/jql", params=params)
