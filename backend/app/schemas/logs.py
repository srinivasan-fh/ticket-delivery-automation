from pydantic import BaseModel
from typing import Optional, List

class SystemLogItem(BaseModel):
    id: int
    timestamp: str
    service: str
    endpoint: str
    method: str
    execution_time_ms: float
    status_code: int
    payload: Optional[str] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None
    is_simulated: bool
