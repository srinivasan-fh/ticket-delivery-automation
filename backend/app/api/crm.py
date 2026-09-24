from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.crm_service import CRMService
from app.schemas.crm import (
    CRMFranchiseRequest,
    CRMResellerRequest,
    CRMOrderLookupRequest,
    CRMSocialPostRequest
)
from app.schemas.common import APIExecutionResponse

router = APIRouter(prefix="/crm", tags=["CRM"])

@router.post("/franchise", response_model=APIExecutionResponse)
async def create_franchise(payload: CRMFranchiseRequest, db: Session = Depends(get_db)):
    service = CRMService(db)
    res = await service.create_franchise(payload.model_dump())
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.post("/reseller", response_model=APIExecutionResponse)
async def create_reseller(payload: CRMResellerRequest, db: Session = Depends(get_db)):
    service = CRMService(db)
    res = await service.create_reseller(payload.model_dump())
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.post("/orders/lookup", response_model=APIExecutionResponse)
async def lookup_orders(payload: CRMOrderLookupRequest, db: Session = Depends(get_db)):
    service = CRMService(db)
    res = await service.lookup_orders(payload.order_numbers)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=200,
        data=res["data"]
    )

@router.post("/social/post", response_model=APIExecutionResponse)
async def raise_social_post(payload: CRMSocialPostRequest, db: Session = Depends(get_db)):
    service = CRMService(db)
    res = await service.raise_social_post(payload.model_dump())
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["error"])
    return APIExecutionResponse(
        success=True,
        execution_time_ms=res["execution_time_ms"],
        status_code=201,
        data=res["data"]
    )

@router.get("/meta", response_model=dict)
async def get_crm_metadata(db: Session = Depends(get_db)):
    service = CRMService(db)
    return await service.get_franchises_and_resellers()
