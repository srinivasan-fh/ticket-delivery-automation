from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.services.devops_service import DevOpsService
from app.schemas.devops import (
    JenkinsBuildRequest,
    JenkinsTreeResponse,
    OctopusDeploymentRequest,
    DevOpsDashboardResponse,
    OctopusProjectsOverviewResponse,
    OctopusProjectDashboardResponse,
    OctopusProjectResolveItem
)
from app.schemas.common import APIExecutionResponse

router = APIRouter(prefix="/devops", tags=["DevOps"])

@router.get("/dashboard", response_model=DevOpsDashboardResponse)
async def get_dashboard():
    service = DevOpsService()
    return await service.get_dashboard()

@router.get("/jenkins/tree", response_model=JenkinsTreeResponse)
async def get_jenkins_tree(path: Optional[str] = None):
    service = DevOpsService()
    try:
        return await service.get_jenkins_tree(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/jenkins/build", response_model=APIExecutionResponse)
async def restart_jenkins_build(payload: JenkinsBuildRequest):
    service = DevOpsService()
    res = await service.restart_jenkins_build(payload.job_name)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.get("/octopus/releases/{project_id}")
async def get_octopus_releases(project_id: str):
    service = DevOpsService()
    return await service.get_octopus_releases(project_id)

@router.get("/octopus/overview", response_model=OctopusProjectsOverviewResponse)
async def get_octopus_projects_overview():
    service = DevOpsService()
    return await service.get_octopus_projects_overview()

@router.get("/octopus/projects/resolve", response_model=List[OctopusProjectResolveItem])
async def resolve_octopus_projects(ids: str = Query(..., description="Comma-separated Octopus project IDs")):
    service = DevOpsService()
    project_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
    return await service.resolve_octopus_projects(project_ids)

@router.get("/octopus/project/{project_id}/dashboard", response_model=OctopusProjectDashboardResponse)
async def get_octopus_project_dashboard(project_id: str):
    service = DevOpsService()
    return await service.get_octopus_project_dashboard(project_id)

@router.post("/octopus/deploy", response_model=APIExecutionResponse)
async def deploy_octopus_release(payload: OctopusDeploymentRequest):
    service = DevOpsService()
    res = await service.deploy_octopus_release(
        project_id=payload.project_id,
        environment_id=payload.environment_id,
        release_version=payload.release_version
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.get("/octopus/progress/{deployment_id}")
async def get_octopus_deployment_progress(deployment_id: str):
    service = DevOpsService()
    return await service.get_deployment_progress(deployment_id)
