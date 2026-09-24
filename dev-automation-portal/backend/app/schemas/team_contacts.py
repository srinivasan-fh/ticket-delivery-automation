from typing import List, Optional
from pydantic import BaseModel


class TeamContact(BaseModel):
    name: str
    email: str


class TeamContactsResponse(BaseModel):
    qa_assignees: List[TeamContact]
    approval_peers: List[TeamContact]
    pr_reviewer: Optional[TeamContact] = None


class TeamContactsUpdateRequest(BaseModel):
    qa_assignees: List[TeamContact]
    approval_peers: List[TeamContact]
    pr_reviewer: Optional[TeamContact] = None
