import httpx
from typing import Any, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class CliqClient(BaseAPIClient):
    def __init__(self):
        super().__init__(
            service_name="zoho_cliq",
            base_url=f"https://{settings.ZOHO_CLIQ_DOMAIN}",
            default_headers={"Content-Type": "application/json"}
        )

    async def _get_access_token(self) -> str:
        # Self-client OAuth (client id/secret/refresh token) - same grant the org's zoho-cliq
        # MCP server already uses successfully, so a fresh access token is fetched per call
        # rather than caching one (Cliq access tokens are short-lived; refreshing is cheap).
        params = {
            "grant_type": "refresh_token",
            "client_id": settings.ZOHO_CLIENT_ID,
            "client_secret": settings.ZOHO_CLIENT_SECRET,
            "refresh_token": settings.ZOHO_REFRESH_TOKEN,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{settings.ZOHO_ACCOUNTS_URL}/oauth/v2/token", data=params)
        data = response.json()
        if response.status_code != 200 or "access_token" not in data:
            raise RuntimeError(f"Zoho token refresh failed: {data}")
        return data["access_token"]

    async def post_message_to_channel(self, channel_unique_name: str, text: str) -> Tuple[int, Any, Optional[str], float]:
        access_token = await self._get_access_token()
        return await self.post(
            f"/api/v2/channelsbyname/{channel_unique_name}/message",
            json_data={"text": text},
            headers={"Authorization": f"Zoho-oauthtoken {access_token}"}
        )

    async def post_message_to_user(self, email: str, text: str) -> Tuple[int, Any, Optional[str], float]:
        access_token = await self._get_access_token()
        return await self.post(
            f"/api/v2/buddies/{email}/message",
            json_data={"text": text},
            headers={"Authorization": f"Zoho-oauthtoken {access_token}"}
        )
