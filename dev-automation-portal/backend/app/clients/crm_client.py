from typing import Any, List, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class CRMClient(BaseAPIClient):
    def __init__(self):
        headers = {}
        if settings.CRM_API_KEY:
            headers["Authorization"] = f"Bearer {settings.CRM_API_KEY}"

        super().__init__(
            service_name="crm",
            base_url=settings.CRM_BASE_URL,
            default_headers=headers
        )

    async def create_franchise(self, franchise_data: dict) -> Tuple[int, Any, Optional[str], float]:
        return await self.post("/api/franchises", json_data=franchise_data)

    async def lookup_orders(self, order_ids: List[str]) -> Tuple[int, Any, Optional[str], float]:
        return await self.post("/api/orders/lookup", json_data={"order_numbers": order_ids})

    async def create_reseller(self, reseller_data: dict) -> Tuple[int, Any, Optional[str], float]:
        return await self.post("/api/resellers", json_data=reseller_data)

    async def post_social_media(self, post_data: dict) -> Tuple[int, Any, Optional[str], float]:
        return await self.post("/api/social/post", json_data=post_data)
