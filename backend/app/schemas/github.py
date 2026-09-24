from pydantic import BaseModel, Field
from typing import Optional, List

class GithubBranchRequest(BaseModel):
    branch_name: str = Field(..., examples=["feature/auth-dashboard"])
    source_branch: str = Field("main", examples=["main"])
    owner: Optional[str] = None
    repo: Optional[str] = None

class GithubRepoSummary(BaseModel):
    owner: str
    name: str
    full_name: str
    default_branch: str

class GithubTagRequest(BaseModel):
    tag_name: str = Field(..., examples=["v1.2.0"])
    owner: Optional[str] = None
    repo: Optional[str] = None
    source_branch: Optional[str] = Field(None, examples=["main"])
    target_commit_sha: Optional[str] = Field(None, examples=["a1b2c3d4"])
    release_notes_template: Optional[str] = Field(None, examples=["Standard changelog"])
    publish_release: bool = Field(False, description="Also publish a GitHub Release using release_notes_template as its body")

class GithubTagSuggestionResponse(BaseModel):
    suggested_tag: str
    basis: str

class GithubGenerateNotesRequest(BaseModel):
    tag_name: str = Field(..., examples=["v1.2.0"])
    owner: Optional[str] = None
    repo: Optional[str] = None
    target_commitish: Optional[str] = Field(None, examples=["main"])
    previous_tag_name: Optional[str] = None

class GithubGeneratedNotesResponse(BaseModel):
    name: str
    body: str

class GithubReviewComment(BaseModel):
    path: str
    line: int
    side: str = Field("RIGHT", description="RIGHT for added/context lines, LEFT for removed lines")
    body: str

class GithubApprovePRRequest(BaseModel):
    pr_number: int
    comment: Optional[str] = Field("Approved via DevPortal Dashboard")
    event: str = Field("APPROVE", description="APPROVE, REQUEST_CHANGES, or COMMENT")
    owner: Optional[str] = None
    repo: Optional[str] = None
    commit_id: Optional[str] = None
    comments: Optional[List[GithubReviewComment]] = None

class GithubPullRequestFile(BaseModel):
    filename: str
    status: str
    additions: int = 0
    deletions: int = 0
    changes: int = 0
    patch: Optional[str] = None

class GithubCompareRequest(BaseModel):
    base_tag: str
    head_tag: str
    owner: Optional[str] = None
    repo: Optional[str] = None

class GithubPullRequestResponse(BaseModel):
    number: int
    title: str
    state: str
    user: str
    html_url: str
    draft: bool
    mergeable: Optional[bool] = None
    commits: int = 0
    changed_files: int = 0
    additions: int = 0
    deletions: int = 0

class PRDashboardItem(BaseModel):
    number: int
    title: str
    branch: str
    base: str
    url: Optional[str] = None
    state: str
    author: Optional[str] = None
    approvers: List[str] = []
    reviewer_already_approved: bool = False
    updated_at: Optional[str] = None

class NotifyReviewerRequest(BaseModel):
    pr_url: str = Field(..., examples=["https://github.com/uktech/BOB-CRM/pull/123"])

class RequestApprovalRequest(BaseModel):
    pr_url: str = Field(..., examples=["https://github.com/uktech/BOB-CRM/pull/123"])
    repo: str = Field(..., examples=["BOB-CRM"])

class MergePRRequest(BaseModel):
    owner: str
    repo: str
    pr_number: int

class DeleteBranchRequest(BaseModel):
    owner: str
    repo: str
    branch: str
