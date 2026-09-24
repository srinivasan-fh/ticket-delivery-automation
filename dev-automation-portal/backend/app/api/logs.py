from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.database_models import APILog
from app.schemas.logs import SystemLogItem

router = APIRouter(prefix="/logs", tags=["Logs"])

@router.get("", response_model=List[SystemLogItem])
async def get_logs(
    service: Optional[str] = Query(None),
    status_code: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(APILog)
    if service:
        query = query.filter(APILog.service == service)
    if status_code:
        query = query.filter(APILog.status_code == status_code)
    
    logs = query.order_by(APILog.timestamp.desc()).limit(limit).all()
    
    res = []
    for log in logs:
        res.append(SystemLogItem(
            id=log.id,
            timestamp=log.timestamp.isoformat() + "Z",
            service=log.service,
            endpoint=log.endpoint,
            method=log.method,
            execution_time_ms=log.execution_time_ms,
            status_code=log.status_code,
            payload=log.payload,
            response_body=log.response_body,
            error_message=log.error_message,
            is_simulated=log.is_simulated
        ))
    return res
