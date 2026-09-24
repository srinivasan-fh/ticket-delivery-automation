from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict

class JiraTicketResponse(BaseModel):
    key: str
    summary: str
    issue_type: Optional[str] = None
    description: Optional[str] = None
    assignee: Optional[str] = None
    reporter: Optional[str] = None
    status: str
    priority: str
    story_points: Optional[int] = None
    sprint: Optional[str] = None
    labels: List[str] = []
    comments: List[dict] = []
    attachments: List[dict] = []
    development: Optional[dict] = None

class JiraWorklogRequest(BaseModel):
    ticket_key: str = Field(..., examples=["PROJ-123"])
    time_spent: str = Field(..., examples=["2h 30m"])
    comment: Optional[str] = Field(None, examples=["Working on integration dashboard"])
    started: Optional[str] = Field(None, examples=["2026-07-17T22:00:00.000+0000"])

class JiraCommentRequest(BaseModel):
    ticket_key: str
    body: str

class JiraUpdateRequest(BaseModel):
    ticket_key: str
    status: Optional[str] = None
    assignee: Optional[str] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None

class JiraTransitionOption(BaseModel):
    id: str
    name: str

class JiraTransitionRequest(BaseModel):
    transition_id: str

class JiraAssignableUser(BaseModel):
    account_id: str
    display_name: str
    avatar_url: Optional[str] = None

class JiraAssignRequest(BaseModel):
    account_id: str
    display_name: str

class JiraTimeTrackerResponse(BaseModel):
    today_hours: float
    week_hours: float
    month_hours: float
    remaining_hours: float
    target_daily: float = 8.0

class JiraPushToQaRequest(BaseModel):
    ticket_key: str = Field(..., examples=["RNMS-1234"])
    ticket_url: str = Field(..., examples=["https://your-domain.atlassian.net/browse/RNMS-1234"])
    environment: Literal["SIT", "Pre-Prod", "PROD"]
    assignee_email: Optional[str] = None

class JiraPushToQaResponse(BaseModel):
    ticket_key: str
    environment: str
    comment: dict
    assignee: dict
    cliq_notification: dict

class JiraSprintBoardResponse(BaseModel):
    sprint_name: str
    sprint_status: str
    backlog_count: int
    in_progress_count: int
    done_count: int
    story_points_total: int
    story_points_done: int
    burndown_summary: str

class MonthlyReportTicket(BaseModel):
    key: str
    summary: str
    status: str
    issue_type: Optional[str] = None
    updated: Optional[str] = None
    created: Optional[str] = None
    url: Optional[str] = None

class MonthlyReportBucket(BaseModel):
    label: str
    count: int
    tickets: List[MonthlyReportTicket]

class MonthlyReportResponse(BaseModel):
    month: str
    is_simulated: bool
    buckets: Dict[str, MonthlyReportBucket]
