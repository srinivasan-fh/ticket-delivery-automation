import base64
from typing import Any, Dict, List, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class JenkinsClient(BaseAPIClient):
    def __init__(self):
        headers = {}
        if settings.JENKINS_USER and settings.JENKINS_TOKEN:
            auth_str = f"{settings.JENKINS_USER}:{settings.JENKINS_TOKEN}"
            encoded_auth = base64.b64encode(auth_str.encode()).decode()
            headers["Authorization"] = f"Basic {encoded_auth}"

        super().__init__(
            service_name="jenkins",
            base_url=settings.JENKINS_URL,
            default_headers=headers
        )

    async def get_jobs_and_builds(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/api/json?tree=jobs[name,color,url,inQueue,lastBuild[number,building,result,timestamp]]")

    async def get_folder_items(self, path_segments: List[str]) -> Tuple[int, Any, Optional[str], float]:
        prefix = "".join(f"/job/{seg}" for seg in path_segments)
        return await self.get(
            f"{prefix}/api/json",
            params={"tree": "jobs[name,url,_class,color,inQueue,lastBuild[number,building,result,timestamp]]"}
        )

    async def trigger_build(self, job_name: str, parameters: Optional[Dict[str, Any]] = None) -> Tuple[int, Any, Optional[str], float]:
        path = f"/job/{job_name}/build"
        if parameters:
            path = f"/job/{job_name}/buildWithParameters"
        return await self.post(path, json_data=parameters)

    async def get_queue(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/queue/api/json")

    async def get_build_info(self, job_name: str, build_number: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/job/{job_name}/{build_number}/api/json")
