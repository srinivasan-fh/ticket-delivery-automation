from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.ticket_delivery import DeliveryAccessRequest, DeliveryCheckRequest, DeliveryStageRequest, DeliveryStageResponse
from app.services.ticket_delivery_service import DeliveryError, TicketDeliveryService

router = APIRouter(prefix="/ticket-delivery", tags=["Ticket Delivery"])

LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]"}


def require_local_host(request: Request) -> None:
    # Launch endpoints start processes on this machine - only answer requests addressed to
    # localhost (blocks DNS-rebinding pages from reaching them through the browser).
    host = (request.headers.get("host") or "").rsplit(":", 1)[0]
    if host not in LOCAL_HOSTS:
        raise HTTPException(status_code=403, detail="Ticket Delivery launch endpoints only accept localhost requests")


def _raise(exc: DeliveryError):
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/config")
async def get_config(db: Session = Depends(get_db)):
    return TicketDeliveryService(db).config()


@router.get("/health")
async def get_health(db: Session = Depends(get_db)):
    return await TicketDeliveryService(db).health()


@router.get("/tickets")
async def get_sprint_tickets(sprint: Literal["current", "next"] = "current", db: Session = Depends(get_db)):
    try:
        return await TicketDeliveryService(db).get_sprint_tickets(sprint)
    except DeliveryError as exc:
        _raise(exc)


@router.get("/checks")
async def get_checks(keys: str = Query("", description="Comma-separated ticket keys"), db: Session = Depends(get_db)):
    return TicketDeliveryService(db).get_checks([k for k in keys.split(",") if k])


@router.put("/checks")
async def set_check(payload: DeliveryCheckRequest, db: Session = Depends(get_db)):
    try:
        return await TicketDeliveryService(db).set_check(payload.ticket_key, payload.stage, payload.item_id, payload.done)
    except DeliveryError as exc:
        _raise(exc)


@router.put("/access")
async def set_access(payload: DeliveryAccessRequest, db: Session = Depends(get_db)):
    try:
        return TicketDeliveryService(db).set_access(payload.item_id, payload.done)
    except DeliveryError as exc:
        _raise(exc)


@router.get("/tickets/{ticket_key}/repo")
async def get_ticket_repo(ticket_key: str, db: Session = Depends(get_db)):
    try:
        return TicketDeliveryService(db).ticket_repo(ticket_key)
    except DeliveryError as exc:
        _raise(exc)


@router.post("/tickets/{ticket_key}/stages/{stage_id}", response_model=DeliveryStageResponse, dependencies=[Depends(require_local_host)])
async def start_stage(ticket_key: str, stage_id: str, payload: DeliveryStageRequest, db: Session = Depends(get_db)):
    try:
        return await TicketDeliveryService(db).start_stage(ticket_key, stage_id, payload.mode)
    except DeliveryError as exc:
        _raise(exc)


@router.get("/tickets/{ticket_key}/stages/{stage_id}/output")
async def get_stage_output(ticket_key: str, stage_id: str, db: Session = Depends(get_db)):
    try:
        return {"output": TicketDeliveryService(db).get_output(ticket_key, stage_id)}
    except DeliveryError as exc:
        _raise(exc)
