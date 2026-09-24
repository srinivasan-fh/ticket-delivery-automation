from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from app.core.database import get_db
from app.services.jira_service import JiraService
from app.schemas.jira import (
    JiraTicketResponse,
    JiraWorklogRequest,
    JiraCommentRequest,
    JiraUpdateRequest,
    JiraTimeTrackerResponse,
    JiraSprintBoardResponse,
    JiraTransitionOption,
    JiraTransitionRequest,
    JiraAssignableUser,
    JiraAssignRequest,
    JiraPushToQaRequest
)
from app.schemas.common import APIExecutionResponse
from app.schemas.team_contacts import TeamContact

router = APIRouter(prefix="/jira", tags=["Jira"])

@router.get("/ticket/{ticket_key}", response_model=APIExecutionResponse)
async def get_ticket(ticket_key: str, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.get_ticket(ticket_key)
    if not res["success"]:
        raise HTTPException(status_code=404, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/worklog", response_model=APIExecutionResponse)
async def add_worklog(payload: JiraWorklogRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.add_worklog(
        ticket_key=payload.ticket_key,
        time_spent=payload.time_spent,
        comment=payload.comment,
        started=payload.started
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.delete("/worklog/{ticket_key}/{worklog_id}", response_model=APIExecutionResponse)
async def delete_worklog(ticket_key: str, worklog_id: int, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.delete_worklog(ticket_key, worklog_id)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/comment", response_model=APIExecutionResponse)
async def add_comment(payload: JiraCommentRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.add_comment(payload.ticket_key, payload.body)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.put("/ticket", response_model=APIExecutionResponse)
async def update_ticket(payload: JiraUpdateRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    fields = {}
    if payload.status:
        fields["status"] = payload.status
    if payload.assignee:
        fields["assignee"] = payload.assignee
    if payload.priority:
        fields["priority"] = payload.priority
    if payload.labels is not None:
        fields["labels"] = payload.labels

    res = await service.update_ticket(payload.ticket_key, fields)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/ticket/{ticket_key}/transitions", response_model=List[JiraTransitionOption])
async def get_transitions(ticket_key: str, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.get_transitions(ticket_key)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.post("/ticket/{ticket_key}/transition", response_model=APIExecutionResponse)
async def transition_ticket(ticket_key: str, payload: JiraTransitionRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.transition_ticket(ticket_key, payload.transition_id)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/ticket/{ticket_key}/assignable-users", response_model=List[JiraAssignableUser])
async def get_assignable_users(ticket_key: str, query: str = Query(""), db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.get_assignable_users(ticket_key, query)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return res["data"]

@router.post("/ticket/{ticket_key}/assignee", response_model=APIExecutionResponse)
async def assign_ticket(ticket_key: str, payload: JiraAssignRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.assign_ticket(ticket_key, payload.account_id, payload.display_name)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/qa-assignees", response_model=List[TeamContact])
async def list_qa_assignees(db: Session = Depends(get_db)):
    service = JiraService(db)
    return await service.list_qa_assignees()

@router.post("/push-to-qa", response_model=APIExecutionResponse)
async def push_to_qa(payload: JiraPushToQaRequest, db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.push_to_qa(payload.ticket_key, payload.ticket_url, payload.environment, payload.assignee_email)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/my-open-tickets", response_model=APIExecutionResponse)
async def get_my_open_tickets(db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.get_my_open_tickets()
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/monthly-report", response_model=APIExecutionResponse)
async def get_monthly_report(db: Session = Depends(get_db)):
    service = JiraService(db)
    res = await service.get_monthly_report()
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.get("/time-tracker", response_model=JiraTimeTrackerResponse)
async def get_time_tracker(db: Session = Depends(get_db)):
    service = JiraService(db)
    return await service.get_time_tracker()

@router.get("/sprint-board", response_model=JiraSprintBoardResponse)
async def get_sprint_board(db: Session = Depends(get_db)):
    service = JiraService(db)
    return await service.get_sprint_board()
