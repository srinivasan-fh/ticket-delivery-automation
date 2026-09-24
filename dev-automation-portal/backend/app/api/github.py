from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.github_service import GithubService
from app.schemas.github import (
    GithubBranchRequest,
    GithubTagRequest,
    GithubApprovePRRequest,
    GithubCompareRequest,
    GithubRepoSummary,
    GithubTagSuggestionResponse,
    GithubGenerateNotesRequest,
    GithubGeneratedNotesResponse,
    PRDashboardItem,
    NotifyReviewerRequest,
    RequestApprovalRequest,
    MergePRRequest,
    DeleteBranchRequest
)
from app.schemas.common import APIExecutionResponse

router = APIRouter(prefix="/github", tags=["GitHub"])

@router.get("/pr/{pr_number}", response_model=APIExecutionResponse)
async def get_pull_request(pr_number: int, owner: Optional[str] = None, repo: Optional[str] = None):
    service = GithubService()
    res = await service.get_pull_request(pr_number, owner=owner, repo=repo)
    if not res["success"]:
        status_code = 404 if res["source"] == "simulated" else 400
        raise HTTPException(status_code=status_code, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/pr/{pr_number}/files", response_model=APIExecutionResponse)
async def get_pull_request_files(pr_number: int, owner: Optional[str] = None, repo: Optional[str] = None):
    service = GithubService()
    res = await service.get_pull_request_files(pr_number, owner=owner, repo=repo)
    if not res["success"]:
        status_code = 404 if res["source"] == "simulated" else 400
        raise HTTPException(status_code=status_code, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/pr/approve", response_model=APIExecutionResponse)
async def approve_pull_request(payload: GithubApprovePRRequest):
    service = GithubService()
    res = await service.approve_pull_request(
        payload.pr_number,
        payload.comment,
        payload.event,
        owner=payload.owner,
        repo=payload.repo,
        commit_id=payload.commit_id,
        comments=[c.model_dump() for c in payload.comments] if payload.comments else None
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.post("/branch", response_model=APIExecutionResponse)
async def create_branch(payload: GithubBranchRequest):
    service = GithubService()
    res = await service.create_branch(payload.branch_name, payload.source_branch, owner=payload.owner, repo=payload.repo)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.get("/repos", response_model=List[GithubRepoSummary])
async def list_repos():
    service = GithubService()
    res = await service.list_repos()
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.get("/repos/{owner}/{repo}/branches", response_model=List[str])
async def list_branches(owner: str, repo: str):
    service = GithubService()
    res = await service.list_branches(owner=owner, repo=repo)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.post("/tag", response_model=APIExecutionResponse)
async def create_tag(payload: GithubTagRequest):
    service = GithubService()
    res = await service.create_tag(
        tag_name=payload.tag_name,
        owner=payload.owner,
        repo=payload.repo,
        source_branch=payload.source_branch,
        target_sha=payload.target_commit_sha,
        notes_template=payload.release_notes_template,
        publish_release=payload.publish_release
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.post("/releases/generate-notes", response_model=GithubGeneratedNotesResponse)
async def generate_release_notes(payload: GithubGenerateNotesRequest):
    service = GithubService()
    res = await service.generate_release_notes(
        owner=payload.owner,
        repo=payload.repo,
        tag_name=payload.tag_name,
        target_commitish=payload.target_commitish,
        previous_tag_name=payload.previous_tag_name
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.post("/compare", response_model=APIExecutionResponse)
async def compare_tags(payload: GithubCompareRequest):
    service = GithubService()
    res = await service.compare_tags(payload.base_tag, payload.head_tag, owner=payload.owner, repo=payload.repo)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/repos/{owner}/{repo}/tags", response_model=List[str])
async def list_tags(owner: str, repo: str):
    service = GithubService()
    res = await service.list_tags(owner=owner, repo=repo)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.get("/repos/{owner}/{repo}/tags/suggest", response_model=GithubTagSuggestionResponse)
async def suggest_next_tag(owner: str, repo: str, environment: str, source_branch: Optional[str] = None):
    service = GithubService()
    res = await service.suggest_next_tag(environment, owner=owner, repo=repo, source_branch=source_branch)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.get("/repos/{owner}/{repo}/pulls", response_model=List[PRDashboardItem])
async def list_pull_requests_dashboard(owner: str, repo: str, state: str = "open"):
    service = GithubService()
    res = await service.get_pr_dashboard(owner, repo, state=state)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.post("/pr/notify-reviewer", response_model=APIExecutionResponse)
async def notify_reviewer(payload: NotifyReviewerRequest):
    service = GithubService()
    res = await service.notify_reviewer(payload.pr_url)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/pr/request-approval", response_model=APIExecutionResponse)
async def request_approval(payload: RequestApprovalRequest):
    service = GithubService()
    res = await service.request_approval(payload.pr_url, payload.repo)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/pr/merge", response_model=APIExecutionResponse)
async def merge_pull_request(payload: MergePRRequest):
    service = GithubService()
    res = await service.merge_pull_request(payload.owner, payload.repo, payload.pr_number)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/pr/delete-branch", response_model=APIExecutionResponse)
async def delete_branch(payload: DeleteBranchRequest):
    service = GithubService()
    res = await service.delete_branch(payload.owner, payload.repo, payload.branch)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )
