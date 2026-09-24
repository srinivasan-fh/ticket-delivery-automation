from pydantic import BaseModel
from typing import List, Literal, Optional

class ReleaseCandidateResponse(BaseModel):
    github_release_tag: str
    github_reverting_tag: str

class ReleaseTicketRequest(BaseModel):
    repo: Literal["MS", "MSWEB", "FALCON-BOBCRM"]
    description: str
    environment: Literal["Pre-Prod", "Prod", "Prod-Beta", "PRODFALLBACK"]
    release_type: str
    channel: Optional[str] = None
    github_release_tag: str
    github_reverting_tag: str
    jira_issue_links: List[str] = []
    architect_review: Literal["Yes", "No"] = "No"
    notify_training_team: Literal["Yes", "No"] = "No"
    additional_logging_required: Literal["Yes", "No"] = "No"
    what_to_monitor: Optional[str] = None
    qa_signoff_received: Literal["Yes", "No"] = "Yes"
    qa_touch_url: Optional[str] = None
    dry_run: bool = False

class ReleaseTicketListItem(BaseModel):
    key: str
    summary: Optional[str] = None
    status: Optional[str] = None
    created: Optional[str] = None
    repo: Optional[str] = None
    environment: Optional[str] = None
    release_type: Optional[str] = None
    github_release_tag: Optional[str] = None
    github_reverting_tag: Optional[str] = None

class ReleaseTicketComment(BaseModel):
    id: Optional[str] = None
    author: Optional[str] = None
    body: Optional[str] = None
    created: Optional[str] = None

class ReleaseTicketApprover(BaseModel):
    display_name: Optional[str] = None
    decision: Optional[str] = None

class ReleaseTicketApproval(BaseModel):
    name: Optional[str] = None
    final_decision: Optional[str] = None
    approvers: List[ReleaseTicketApprover] = []

class ReleaseTicketDetail(BaseModel):
    key: str
    url: str
    summary: Optional[str] = None
    status: Optional[str] = None
    created: Optional[str] = None
    reporter: Optional[str] = None
    assignee: Optional[str] = None
    repo: Optional[str] = None
    environment: Optional[str] = None
    release_type: Optional[str] = None
    channel: Optional[str] = None
    github_release_tag: Optional[str] = None
    github_reverting_tag: Optional[str] = None
    jira_issue_links: Optional[str] = None
    architect_review: Optional[str] = None
    notify_training_team: Optional[str] = None
    additional_logging_required: Optional[str] = None
    what_to_monitor: Optional[str] = None
    qa_signoff_received: Optional[str] = None
    qa_touch_url: Optional[str] = None
    comments: List[ReleaseTicketComment] = []
    approvals: List[ReleaseTicketApproval] = []
