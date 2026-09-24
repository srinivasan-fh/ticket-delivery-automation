import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
from app.services.itsm_service import ITSMService
from app.schemas.itsm import ITSMDashboardResponse, ITSMTicketsListResponse, ITSMCommentRequest
from app.schemas.common import APIExecutionResponse

router = APIRouter(prefix="/itsm", tags=["ITSM"])

# Create uploads directory under scratch
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/dashboard", response_model=ITSMDashboardResponse)
async def get_dashboard(db: Session = Depends(get_db)):
    service = ITSMService(db)
    return await service.get_dashboard()

@router.get("/tickets", response_model=ITSMTicketsListResponse)
async def get_recent_tickets(db: Session = Depends(get_db)):
    service = ITSMService(db)
    return await service.get_recent_tickets()

@router.post("/tickets/{ticket_id}/approve", response_model=APIExecutionResponse)
async def approve_ticket(ticket_id: str, db: Session = Depends(get_db)):
    service = ITSMService(db)
    res = await service.approve_ticket(ticket_id)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/tickets/{ticket_id}/comment", response_model=APIExecutionResponse)
async def add_ticket_comment(ticket_id: str, payload: ITSMCommentRequest, db: Session = Depends(get_db)):
    service = ITSMService(db)
    res = await service.add_comment_to_ticket(ticket_id, payload.body)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.post("/request", response_model=APIExecutionResponse)
async def raise_request(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form("General"),
    priority: str = Form("Medium"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    attachments = []
    if file:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            attachments.append(file.filename)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

    service = ITSMService(db)
    res = await service.raise_request(
        title=title,
        description=description,
        category=category,
        priority=priority,
        attachments=attachments
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
        
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )
