from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.services.release_ticket_service import ReleaseTicketService
from app.schemas.release_ticket import (
    ReleaseCandidateResponse,
    ReleaseTicketRequest,
    ReleaseTicketListItem,
    ReleaseTicketDetail,
)
from app.schemas.common import APIExecutionResponse

router = APIRouter(prefix="/release-ticket", tags=["Release Ticket"])

@router.get("/candidate", response_model=ReleaseCandidateResponse)
async def get_release_candidate(repo: str, channel: Optional[str] = Query(None)):
    service = ReleaseTicketService()
    try:
        return await service.get_release_candidate(repo, channel)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/my-tickets", response_model=List[ReleaseTicketListItem])
async def list_my_tickets():
    service = ReleaseTicketService()
    return await service.list_my_tickets()

@router.get("/my-tickets/{ticket_key}", response_model=ReleaseTicketDetail)
async def get_ticket_detail(ticket_key: str):
    service = ReleaseTicketService()
    try:
        return await service.get_ticket_detail(ticket_key)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("", response_model=APIExecutionResponse)
async def create_release_ticket(payload: ReleaseTicketRequest):
    service = ReleaseTicketService()
    res = await service.create_release_ticket(
        repo=payload.repo,
        description=payload.description,
        environment=payload.environment,
        release_type=payload.release_type,
        channel=payload.channel,
        github_release_tag=payload.github_release_tag,
        github_reverting_tag=payload.github_reverting_tag,
        jira_issue_links=payload.jira_issue_links,
        architect_review=payload.architect_review,
        notify_training_team=payload.notify_training_team,
        additional_logging_required=payload.additional_logging_required,
        what_to_monitor=payload.what_to_monitor,
        qa_signoff_received=payload.qa_signoff_received,
        qa_touch_url=payload.qa_touch_url,
        dry_run=payload.dry_run,
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res.get("execution_time_ms", 0.0),
        status_code=201,
        data=res["data"]
    )
