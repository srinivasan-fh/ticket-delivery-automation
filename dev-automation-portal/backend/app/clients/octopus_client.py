from typing import Any, Dict, List, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class OctopusClient(BaseAPIClient):
    def __init__(self):
        headers = {}
        if settings.OCTOPUS_API_KEY:
            headers["X-Octopus-ApiKey"] = settings.OCTOPUS_API_KEY

        super().__init__(
            service_name="octopus",
            base_url=settings.OCTOPUS_URL,
            default_headers=headers
        )
        self._space_id: Optional[str] = None

    async def _get_space_id(self) -> Optional[str]:
        """Octopus scopes most resources (dashboard, progression) under a space id.
        This instance only ever has a single space, so resolve and cache it once."""
        if self._space_id:
            return self._space_id

        status_code, data, error, _ = await self.get("/api/spaces")
        if status_code == 200 and data and data.get("Items"):
            self._space_id = data["Items"][0]["Id"]
        return self._space_id

    async def get_projects(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/api/projects")

    async def get_environments(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/api/environments")

    async def get_releases(self, project_id: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/api/projects/{project_id}/releases")

    async def create_deployment(self, project_id: str, environment_id: str, release_id: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "ProjectId": project_id,
            "EnvironmentId": environment_id,
            "ReleaseId": release_id
        }
        return await self.post("/api/deployments", json_data=payload)

    async def get_deployment_task(self, task_id: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/api/tasks/{task_id}")

    async def get_dashboard(self) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/dashboard")

    async def get_progression(self, project_id: str) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/progression/{project_id}")

    async def get_project(self, project_id: str) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/projects/{project_id}")

    async def get_project_group(self, group_id: str) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/projectgroups/{group_id}")

    async def get_deployments(self, project_id: str, environment_id: str, channel_id: Optional[str] = None, take: int = 10) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        params: Dict[str, Any] = {"projects": project_id, "environments": environment_id, "take": take}
        if channel_id:
            params["channels"] = channel_id
        return await self.get(f"/api/{space_id}/deployments", params=params)

    async def get_tasks(self, task_ids: List[str]) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/tasks", params={"ids": ",".join(task_ids)})

    async def get_channel_releases(self, project_id: str, channel_id: str, take: int = 1) -> Tuple[int, Any, Optional[str], float]:
        space_id = await self._get_space_id()
        if not space_id:
            return 0, None, "Could not resolve Octopus space id", 0.0
        return await self.get(f"/api/{space_id}/projects/{project_id}/channels/{channel_id}/releases", params={"take": take})
