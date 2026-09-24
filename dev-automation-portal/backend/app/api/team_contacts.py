from fastapi import APIRouter
from app.core.team_contacts import (
    get_numbered_contacts,
    get_single_contact,
    write_numbered_contacts,
    write_single_contact,
)
from app.schemas.team_contacts import TeamContactsResponse, TeamContactsUpdateRequest

router = APIRouter(prefix="/team-contacts", tags=["Team Contacts"])

QA_ASSIGNEE_PREFIX = "QA_ASSIGNEE"
APPROVAL_PEER_PREFIX = "APPROVAL_PEER"
PR_REVIEWER_PREFIX = "PR_REVIEWER"


@router.get("", response_model=TeamContactsResponse)
async def get_team_contacts():
    return TeamContactsResponse(
        qa_assignees=get_numbered_contacts(QA_ASSIGNEE_PREFIX),
        approval_peers=get_numbered_contacts(APPROVAL_PEER_PREFIX),
        pr_reviewer=get_single_contact(PR_REVIEWER_PREFIX),
    )


@router.post("", response_model=TeamContactsResponse)
async def update_team_contacts(payload: TeamContactsUpdateRequest):
    write_numbered_contacts(QA_ASSIGNEE_PREFIX, [c.model_dump() for c in payload.qa_assignees])
    write_numbered_contacts(APPROVAL_PEER_PREFIX, [c.model_dump() for c in payload.approval_peers])
    write_single_contact(PR_REVIEWER_PREFIX, payload.pr_reviewer.model_dump() if payload.pr_reviewer else None)
    return TeamContactsResponse(
        qa_assignees=get_numbered_contacts(QA_ASSIGNEE_PREFIX),
        approval_peers=get_numbered_contacts(APPROVAL_PEER_PREFIX),
        pr_reviewer=get_single_contact(PR_REVIEWER_PREFIX),
    )
