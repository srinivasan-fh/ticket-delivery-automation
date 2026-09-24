import time
import httpx
import asyncio
from typing import Any, Dict, Optional, Tuple
from app.core.logging import log_api_call, logger

class BaseAPIClient:
    def __init__(self, service_name: str, base_url: Optional[str], default_headers: Optional[Dict[str, str]] = None, timeout: float = 10.0):
        self.service_name = service_name
        self.base_url = base_url
        self.default_headers = default_headers or {}
        self.timeout = timeout

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        files: Optional[Dict[str, Any]] = None,
        retries: int = 2,
        backoff_factor: float = 0.5
    ) -> Tuple[int, Any, Optional[str], float]:
        """
        Generic HTTP request method with retry logic, timings, and DB logging.
        Returns: Tuple[status_code, response_data_or_dict, error_msg, execution_time_ms]
        """
        if not self.base_url:
            # Client not configured, execution failed or simulation fallback
            return 0, None, f"Client {self.service_name} base_url is not configured.", 0.0

        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        req_headers = {**self.default_headers, **(headers or {})}
        
        start_time = time.perf_counter()
        status_code = 0
        response_data = None
        error_msg = None

        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(
                        method=method,
                        url=url,
                        params=params,
                        json=json_data,
                        headers=req_headers,
                        files=files
                    )
                    status_code = response.status_code
                    try:
                        response_data = response.json()
                    except ValueError:
                        response_data = response.text
                    
                    if 200 <= status_code < 300:
                        break
                    else:
                        error_msg = f"HTTP Error {status_code}: {response.text}"
            except httpx.RequestError as exc:
                error_msg = f"Network Exception: {str(exc)}"
                status_code = 500
            
            # If failed, retry with backoff
            if attempt < retries:
                sleep_time = backoff_factor * (2 ** attempt)
                logger.warning(f"[{self.service_name}] Request failed: {error_msg}. Retrying in {sleep_time}s...")
                await asyncio.sleep(sleep_time)

        execution_time_ms = (time.perf_counter() - start_time) * 1000.0

        # Log details to SQLite audit log
        log_api_call(
            service=self.service_name,
            endpoint=url,
            method=method,
            execution_time_ms=execution_time_ms,
            status_code=status_code,
            payload={"params": params, "json": json_data} if json_data or params else None,
            response_body=response_data,
            error_message=error_msg,
            is_simulated=False
        )

        return status_code, response_data, error_msg, execution_time_ms

    async def get(self, path: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any, Optional[str], float]:
        return await self._request("GET", path, params=params, headers=headers)

    async def post(self, path: str, json_data: Optional[Any] = None, headers: Optional[Dict[str, str]] = None, files: Optional[Dict[str, Any]] = None) -> Tuple[int, Any, Optional[str], float]:
        return await self._request("POST", path, json_data=json_data, headers=headers, files=files)

    async def put(self, path: str, json_data: Optional[Any] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any, Optional[str], float]:
        return await self._request("PUT", path, json_data=json_data, headers=headers)

    async def delete(self, path: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Any, Optional[str], float]:
        return await self._request("DELETE", path, params=params, headers=headers)
