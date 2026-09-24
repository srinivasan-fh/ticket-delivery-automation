from pydantic import BaseModel, Field
from typing import List, Optional

class ITSMRequestCreate(BaseModel):
    title: str = Field(..., examples=["Software access request"])
    description: str = Field(..., examples=["Requesting developer license"])
    category: str = Field("Software", examples=["Hardware", "Software", "Access"])
    priority: str = Field("Medium", examples=["Low", "Medium", "High", "Critical"])

class ITSMRequestResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str
    priority: str
    status: str
    attachments: List[str] = []
    created_at: str

class ITSMDashboardResponse(BaseModel):
    open_requests: int
    pending_approvals: int
    closed_requests: int
    requests: List[ITSMRequestResponse]

class ITSMTicketSummary(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    created_at: str
    has_pending_approval: bool = False

class ITSMTicketsListResponse(BaseModel):
    tickets: List[ITSMTicketSummary]

class ITSMCommentRequest(BaseModel):
    body: str = Field(..., examples=["Approved, proceeding with provisioning."])
