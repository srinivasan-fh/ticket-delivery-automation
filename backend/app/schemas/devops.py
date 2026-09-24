from pydantic import BaseModel
from typing import Dict, List, Optional

# Jenkins
class JenkinsJobInfo(BaseModel):
    name: str
    status: str  # e.g., 'SUCCESS', 'FAILURE', 'BUILDING', 'IDLE'
    last_build_number: Optional[int] = None
    last_build_time: Optional[str] = None
    in_queue: bool = False

class JenkinsBuildRequest(BaseModel):
    job_name: str
    parameters: Optional[dict] = None

class JenkinsTreeItem(BaseModel):
    name: str
    url: str
    is_folder: bool
    status: Optional[str] = None  # None for folders
    last_build_number: Optional[int] = None
    last_build_time: Optional[str] = None
    in_queue: bool = False

class JenkinsTreeResponse(BaseModel):
    path: str
    breadcrumbs: List[str]
    items: List[JenkinsTreeItem]

# Octopus
class OctopusDeploymentRequest(BaseModel):
    project_id: str
    environment_id: str
    release_version: str

class OctopusProjectInfo(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

class OctopusEnvironmentInfo(BaseModel):
    id: str
    name: str
    status: str = "Unknown"

class OctopusReleaseInfo(BaseModel):
    id: str
    version: str
    project_id: str
    created_at: str

# DevOps Unified Dashboard
class DevOpsDashboardResponse(BaseModel):
    jenkins_jobs: List[JenkinsJobInfo]
    octopus_projects: List[OctopusProjectInfo]
    octopus_environments: List[OctopusEnvironmentInfo]
    running_builds_count: int
    failed_builds_count: int
    queue_count: int

# Octopus - Projects overview grid (project groups x environments)
class OctopusDeploymentCell(BaseModel):
    state: Optional[str] = None
    version: Optional[str] = None
    completed_time: Optional[str] = None
    is_current: bool = False

class OctopusProjectRow(BaseModel):
    id: str
    name: str
    project_group_id: str
    environments: Dict[str, Optional[OctopusDeploymentCell]]

class OctopusProjectGroupSection(BaseModel):
    id: str
    name: str
    environment_ids: List[str]
    projects: List[OctopusProjectRow]

class OctopusProjectsOverviewResponse(BaseModel):
    project_groups: List[OctopusProjectGroupSection]
    environments: List[OctopusEnvironmentInfo]

# Octopus - Project Dashboard (releases x environments matrix)
class OctopusReleaseRow(BaseModel):
    id: str
    version: str
    channel_id: Optional[str] = None
    assembled: Optional[str] = None
    environments: Dict[str, Optional[OctopusDeploymentCell]]

class OctopusProjectDashboardResponse(BaseModel):
    project_id: str
    project_name: str
    environments: List[OctopusEnvironmentInfo]
    releases: List[OctopusReleaseRow]

# Octopus - lightweight id -> name/group resolver (for starred-project chips, without the full overview payload)
class OctopusProjectResolveItem(BaseModel):
    id: str
    name: str
    group_name: str
