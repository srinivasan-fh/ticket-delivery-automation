import time
from typing import Any, Dict
from app.core.config import settings
from app.core.logging import log_api_call
from app.clients.cliq_client import CliqClient

# The Push to QA notification always targets this one channel - not user-configurable.
CODE_RED_INTERNAL_CHANNEL = "coderedinternal"

class CliqService:
    def __init__(self):
        self.client = CliqClient()

    async def send_message(self, text: str, channel: str = CODE_RED_INTERNAL_CHANNEL) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.zoho_cliq_configured:
            try:
                status_code, data, error, duration = await self.client.post_message_to_channel(channel, text)
            except RuntimeError as exc:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": str(exc), "execution_time_ms": duration}
            if status_code in (200, 201, 204):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}
            return {"success": False, "source": "live", "error": error or f"Cliq returned HTTP {status_code}", "execution_time_ms": duration}

        # Simulation Mode - no OAuth credentials configured, log what would have been posted
        duration = (time.perf_counter() - start_time) * 1000
        log_api_call("zoho_cliq", f"channelsbyname/{channel}/message", "POST", duration, 200, {"text": text}, {"status": "simulated"}, is_simulated=True)
        return {"success": True, "source": "simulated", "data": {"status": "simulated", "text": text}, "execution_time_ms": duration}

    async def send_message_to_user(self, email: str, text: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.zoho_cliq_configured:
            try:
                status_code, data, error, duration = await self.client.post_message_to_user(email, text)
            except RuntimeError as exc:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": str(exc), "execution_time_ms": duration}
            if status_code in (200, 201, 204):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}
            return {"success": False, "source": "live", "error": error or f"Cliq returned HTTP {status_code}", "execution_time_ms": duration}

        # Simulation Mode - no OAuth credentials configured, log what would have been posted
        duration = (time.perf_counter() - start_time) * 1000
        log_api_call("zoho_cliq", f"buddies/{email}/message", "POST", duration, 200, {"text": text}, {"status": "simulated"}, is_simulated=True)
        return {"success": True, "source": "simulated", "data": {"status": "simulated", "text": text}, "execution_time_ms": duration}
