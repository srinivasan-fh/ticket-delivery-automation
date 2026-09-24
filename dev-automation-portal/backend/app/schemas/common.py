from pydantic import BaseModel
from typing import Any, Optional, List

class APILogItem(BaseModel):
    timestamp: str
    endpoint: str
    method: str
    payload: Optional[str] = None
    response: Optional[str] = None
    execution_time_ms: float
    status: int
    error: Optional[str] = None

class APIExecutionResponse(BaseModel):
    success: bool
    execution_time_ms: float
    status_code: int
    data: Optional[Any] = None
    error: Optional[str] = None
    logs: List[APILogItem] = []
