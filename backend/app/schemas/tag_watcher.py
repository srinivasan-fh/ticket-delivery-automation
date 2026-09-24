from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict


class TagWatcherStartRequest(BaseModel):
    repo: Literal["MS", "MSWEB"]
    tag_name: str
    interval_seconds: Literal[30, 60, 120, 300]


class TagWatcherResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repo: str
    octopus_project_id: str
    tag_name: str
    interval_seconds: int
    environment_id: Optional[str] = None
    environment_name: Optional[str] = None
    status: str
    release_id: Optional[str] = None
    release_version: Optional[str] = None
    deployment_id: Optional[str] = None
    deployment_task_id: Optional[str] = None
    is_simulated: bool
    error_message: Optional[str] = None
    poll_count: int
    created_at: datetime
    last_checked_at: Optional[datetime] = None
    found_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
