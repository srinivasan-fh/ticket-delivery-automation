import time
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Literal, Optional
from app.core.config import settings
from app.core.logging import log_api_call
from app.clients.jira_client import JiraClient
from app.services.cliq_service import CliqService
from app.core.team_contacts import get_numbered_contacts
from app.models.database_models import JiraTicket, JiraWorklog, JiraComment

QA_ASSIGNEE_PREFIX = "QA_ASSIGNEE"

def extract_text_from_adf(node: Any) -> str:
    if not node:
        return ""
    if isinstance(node, list):
        return "".join(extract_text_from_adf(child) for child in node)
    if isinstance(node, dict):
        node_type = node.get("type")
        if node_type == "text":
            return node.get("text", "")
        if node_type == "hardBreak":
            return "\n"
        if node_type == "inlineCard" or node_type == "blockCard":
            # Jira "smart link" embeds - leaf nodes with the URL in attrs, no content to recurse into
            return (node.get("attrs") or {}).get("url", "")
        if node_type == "mention":
            return "@" + (node.get("attrs") or {}).get("text", "")

        content = node.get("content")
        content_text = extract_text_from_adf(content) if content else ""
        
        if node_type == "paragraph":
            return content_text + "\n"
        elif node_type == "heading":
            return "\n" + content_text + "\n"
        elif node_type == "listItem":
            return "• " + content_text
        elif node_type == "bulletList" or node_type == "orderedList":
            return content_text + "\n"
        elif node_type == "codeBlock":
            return "```\n" + content_text + "\n```\n"
            
        return content_text
    return ""

class JiraService:
    def __init__(self, db: Session):
        self.db = db
        self.client = JiraClient()
        self.cliq_service = CliqService()
        self._ensure_seed_data()

    def _ensure_seed_data(self):
        """Seed simulated tickets if the database is empty."""
        if self.db.query(JiraTicket).count() == 0:
            tickets = [
                JiraTicket(key="PROJ-101", summary="Implement dashboard main layout", description="Design and build the left sidebar and main grids", assignee="Jane Doe", reporter="John Smith", status="In Progress", priority="High", story_points=5, sprint="Sprint 1", labels="frontend,ui"),
                JiraTicket(key="PROJ-102", summary="Integrate Jira REST API Client", description="Develop Jira API client classes and connect backend with frontend", assignee="Jane Doe", reporter="Alice Adams", status="In Progress", priority="High", story_points=8, sprint="Sprint 1", labels="backend,jira"),
                JiraTicket(key="PROJ-103", summary="Setup ITSM request form", description="Build dynamic form rendering for ITSM portal requests", assignee="Unassigned", reporter="Bob Builder", status="To Do", priority="Medium", story_points=3, sprint="Sprint 1", labels="frontend"),
                JiraTicket(key="PROJ-104", summary="Fix Jenkins build webhook latency", description="Investigate Jenkins event queue latency in release cycles", assignee="John Smith", reporter="Jane Doe", status="Done", priority="Low", story_points=2, sprint="Sprint 1", labels="devops"),
                JiraTicket(key="PROJ-105", summary="Franchise creation schema validation", description="Add validation checks on franchise and order search CSV parses", assignee="Alice Adams", reporter="Bob Builder", status="To Do", priority="Medium", story_points=5, sprint="Sprint 1", labels="crm,backend"),
                JiraTicket(key="RNMS-26235", summary="Resolve routing service connection timeout", description="Investigate connection timeout issues in the routing modules during peak load.", assignee="Jane Doe", reporter="Alice Adams", status="In Progress", priority="Critical", story_points=5, sprint="Sprint 1", labels="routing,network")
            ]
            self.db.add_all(tickets)
            
            # Initial worklog
            worklogs = [
                JiraWorklog(ticket_key="PROJ-101", time_spent="3h", comment="Initial mockup design and layout scaffolded", started="2026-07-17T10:00:00.000+0000"),
                JiraWorklog(ticket_key="PROJ-102", time_spent="4h", comment="Coded OAuth structure and API base routes", started="2026-07-17T14:30:00.000+0000"),
                JiraWorklog(ticket_key="RNMS-26235", time_spent="2h 15m", comment="Analyzed routing tables and reproduced timeout on stage env.", started="2026-07-17T09:15:00.000+0000")
            ]
            self.db.add_all(worklogs)

            # Initial comments
            comments = [
                JiraComment(ticket_key="PROJ-101", body="UI looks clean! Make sure dark mode is smooth.", author="John Smith"),
                JiraComment(ticket_key="PROJ-102", body="Base client implementation is done, working on Jira client subclass now.", author="Jane Doe"),
                JiraComment(ticket_key="RNMS-26235", body="Suspecting connection pool exhaustion. Increasing max connections to 50.", author="Jane Doe")
            ]
            self.db.add_all(comments)
            self.db.commit()
        else:
            # Ensure RNMS-26235 exists specifically, even if database was already seeded
            rnms_ticket = self.db.query(JiraTicket).filter(JiraTicket.key == "RNMS-26235").first()
            if not rnms_ticket:
                rnms_ticket = JiraTicket(
                    key="RNMS-26235",
                    summary="Resolve routing service connection timeout",
                    description="Investigate connection timeout issues in the routing modules during peak load.",
                    assignee="Jane Doe",
                    reporter="Alice Adams",
                    status="In Progress",
                    priority="Critical",
                    story_points=5,
                    sprint="Sprint 1",
                    labels="routing,network"
                )
                self.db.add(rnms_ticket)
                
                # Check and add some worklog and comments for RNMS-26235
                rnms_worklog = self.db.query(JiraWorklog).filter(JiraWorklog.ticket_key == "RNMS-26235").first()
                if not rnms_worklog:
                    self.db.add(JiraWorklog(
                        ticket_key="RNMS-26235",
                        time_spent="2h 15m",
                        comment="Analyzed routing tables and reproduced timeout on stage env.",
                        started="2026-07-17T09:15:00.000+0000"
                    ))
                rnms_comment = self.db.query(JiraComment).filter(JiraComment.ticket_key == "RNMS-26235").first()
                if not rnms_comment:
                    self.db.add(JiraComment(
                        ticket_key="RNMS-26235",
                        body="Suspecting connection pool exhaustion. Increasing max connections to 50.",
                        author="Jane Doe"
                    ))
                self.db.commit()

    async def get_ticket(self, ticket_key: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        if settings.jira_configured:
            # Live Mode
            status_code, data, error, duration = await self.client.get_ticket(ticket_key)
            if status_code == 200 and isinstance(data, dict):
                # Normalize Live JIRA response to match simulation schema
                fields = data.get("fields", {})
                
                assignee = fields.get("assignee")
                assignee_name = assignee.get("displayName") if assignee else "Unassigned"
                
                reporter = fields.get("reporter")
                reporter_name = reporter.get("displayName") if reporter else "Unassigned"
                
                status = fields.get("status")
                status_name = status.get("name") if status else "To Do"
                
                priority = fields.get("priority")
                priority_name = priority.get("name") if priority else "Medium"
                
                story_points = fields.get("customfield_10016") or fields.get("customfield_10002") or 0
                
                # customfield_10010 is this instance's real "Sprint" field (verified via
                # /rest/api/3/field - customfield_10020 doesn't hold sprint data here). An issue can
                # list several closed sprints alongside the current one, so prefer the active entry.
                sprint = None
                sprint_field = fields.get("customfield_10010")
                if sprint_field and isinstance(sprint_field, list) and len(sprint_field) > 0:
                    active_sprint = next((s for s in sprint_field if isinstance(s, dict) and s.get("state") == "active"), None)
                    sprint = (active_sprint or sprint_field[-1]).get("name")
                
                desc_text = ""
                desc = fields.get("description")
                if desc:
                    if isinstance(desc, str):
                        desc_text = desc
                    elif isinstance(desc, dict):
                        desc_text = extract_text_from_adf(desc).strip()
                
                comments_data = fields.get("comment", {}).get("comments", [])
                comments = []
                for c in comments_data:
                    author_name = c.get("author", {}).get("displayName", "Unknown")
                    body_text = ""
                    c_body = c.get("body")
                    if isinstance(c_body, str):
                        body_text = c_body
                    elif isinstance(c_body, dict):
                        body_text = extract_text_from_adf(c_body).strip()
                    comments.append({
                        "id": c.get("id"),
                        "body": body_text,
                        "author": author_name,
                        "created": c.get("created")
                    })
                
                worklogs_data = fields.get("worklog", {}).get("worklogs", [])
                worklogs = []
                for w in worklogs_data:
                    w_comment = ""
                    w_comm_obj = w.get("comment")
                    if isinstance(w_comm_obj, str):
                        w_comment = w_comm_obj
                    elif isinstance(w_comm_obj, dict):
                        w_comment = extract_text_from_adf(w_comm_obj).strip()
                    worklogs.append({
                        "id": w.get("id"),
                        "time_spent": w.get("timeSpent"),
                        "comment": w_comment,
                        "started": w.get("started"),
                        "author": w.get("author", {}).get("displayName", "Unknown")
                    })

                issue_type = fields.get("issuetype")
                issue_type_name = issue_type.get("name") if issue_type else None

                normalized_data = {
                    "key": data.get("key"),
                    "summary": fields.get("summary", ""),
                    "issue_type": issue_type_name,
                    "description": desc_text or "No description",
                    "assignee": assignee_name,
                    "reporter": reporter_name,
                    "status": status_name,
                    "priority": priority_name,
                    "story_points": story_points,
                    "sprint": sprint,
                    "labels": fields.get("labels", []),
                    "comments": comments,
                    "worklogs": worklogs,
                    "url": f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{data.get('key')}"
                }
                return {"success": True, "source": "live", "data": normalized_data, "execution_time_ms": duration}
            elif status_code == 200:
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}
            # Fallback to simulation with error log if live API fails
            log_api_call("jira", f"/rest/api/3/issue/{ticket_key}", "GET", (time.perf_counter() - start_time)*1000, status_code, None, None, error)

        # Simulation Mode
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        duration = (time.perf_counter() - start_time) * 1000
        
        if not ticket:
            log_api_call("jira", f"/issue/{ticket_key}", "GET", duration, 404, None, None, f"Ticket {ticket_key} not found", is_simulated=True)
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}

        # Fetch comments & worklogs
        comments = self.db.query(JiraComment).filter(JiraComment.ticket_key == ticket_key).all()
        worklogs = self.db.query(JiraWorklog).filter(JiraWorklog.ticket_key == ticket_key).all()
        
        ticket_data = {
            "key": ticket.key,
            "summary": ticket.summary,
            "issue_type": "Task",
            "description": ticket.description,
            "assignee": ticket.assignee,
            "reporter": ticket.reporter,
            "status": ticket.status,
            "priority": ticket.priority,
            "story_points": ticket.story_points,
            "sprint": ticket.sprint,
            "labels": [l.strip() for l in ticket.labels.split(",") if l.strip()] if ticket.labels else [],
            "comments": [{"id": c.id, "body": c.body, "author": c.author, "created": c.created.isoformat()} for c in comments],
            "worklogs": [{"id": w.id, "time_spent": w.time_spent, "comment": w.comment, "started": w.started, "author": w.author} for w in worklogs]
        }
        
        log_api_call("jira", f"/issue/{ticket_key}", "GET", duration, 200, None, ticket_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": ticket_data, "execution_time_ms": duration}

    async def add_worklog(self, ticket_key: str, time_spent: str, comment: Optional[str], started: Optional[str]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.add_worklog(ticket_key, time_spent, comment, started)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        # Check ticket exists
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}

        worklog = JiraWorklog(
            ticket_key=ticket_key,
            time_spent=time_spent,
            comment=comment,
            started=started or datetime.utcnow().isoformat()
        )
        self.db.add(worklog)
        self.db.commit()

        res_data = {"id": worklog.id, "ticket_key": ticket_key, "time_spent": time_spent, "comment": comment, "started": worklog.started}
        log_api_call("jira", f"/issue/{ticket_key}/worklog", "POST", duration, 201, {"time_spent": time_spent, "comment": comment}, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def delete_worklog(self, ticket_key: str, worklog_id: int) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.delete_worklog(ticket_key, str(worklog_id))
            if status_code in (200, 204):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        worklog = self.db.query(JiraWorklog).filter(JiraWorklog.id == worklog_id, JiraWorklog.ticket_key == ticket_key).first()
        if not worklog:
            return {"success": False, "source": "simulated", "error": f"Worklog {worklog_id} not found", "execution_time_ms": duration}

        self.db.delete(worklog)
        self.db.commit()

        log_api_call("jira", f"/issue/{ticket_key}/worklog/{worklog_id}", "DELETE", duration, 200, None, {"status": "deleted"}, is_simulated=True)
        return {"success": True, "source": "simulated", "data": {"status": "deleted"}, "execution_time_ms": duration}

    async def add_comment(self, ticket_key: str, body: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.add_comment(ticket_key, body)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}

        comment = JiraComment(
            ticket_key=ticket_key,
            body=body
        )
        self.db.add(comment)
        self.db.commit()

        res_data = {"id": comment.id, "ticket_key": ticket_key, "body": body, "created": comment.created.isoformat(), "author": comment.author}
        log_api_call("jira", f"/issue/{ticket_key}/comment", "POST", duration, 201, {"body": body}, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def update_ticket(self, ticket_key: str, update_fields: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.update_ticket(ticket_key, update_fields)
            if status_code in (200, 204):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}

        # Apply simulation updates
        if "status" in update_fields:
            ticket.status = update_fields["status"]
        if "assignee" in update_fields:
            ticket.assignee = update_fields["assignee"]
        if "priority" in update_fields:
            ticket.priority = update_fields["priority"]
        if "labels" in update_fields:
            ticket.labels = ",".join(update_fields["labels"])
        
        self.db.commit()
        res_data = {"key": ticket.key, "status": ticket.status, "assignee": ticket.assignee, "priority": ticket.priority, "labels": ticket.labels}
        log_api_call("jira", f"/issue/{ticket_key}", "PUT", duration, 200, update_fields, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    _SIM_STATUSES = ["To Do", "In Progress", "Done", "Reopened"]

    async def get_transitions(self, ticket_key: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.get_transitions(ticket_key)
            if status_code == 200 and isinstance(data, dict):
                transitions = [
                    {"id": t["id"], "name": (t.get("to") or {}).get("name") or t.get("name", "")}
                    for t in data.get("transitions", [])
                ]
                return {"success": True, "source": "live", "data": transitions, "execution_time_ms": duration}
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode - any status other than the current one is selectable, matching the
        # freedom the simulated update_ticket already gives (no real workflow restrictions here)
        duration = (time.perf_counter() - start_time) * 1000
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}
        transitions = [{"id": s, "name": s} for s in self._SIM_STATUSES if s != ticket.status]
        return {"success": True, "source": "simulated", "data": transitions, "execution_time_ms": duration}

    async def transition_ticket(self, ticket_key: str, transition_id: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.transition_ticket(ticket_key, transition_id)
            if status_code in (200, 204):
                return {"success": True, "source": "live", "data": {"key": ticket_key}, "execution_time_ms": duration}
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode - transition_id doubles as the target status name (see get_transitions above)
        duration = (time.perf_counter() - start_time) * 1000
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}
        ticket.status = transition_id
        self.db.commit()
        res_data = {"key": ticket.key, "status": ticket.status}
        log_api_call("jira", f"/issue/{ticket_key}/transitions", "POST", duration, 200, {"transition_id": transition_id}, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    _SIM_ASSIGNABLE_USERS = ["Jane Doe", "John Smith", "Alice Adams", "Bob Builder"]

    async def get_assignable_users(self, ticket_key: str, query: str = "") -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            status_code, data, error, duration = await self.client.search_assignable_users(ticket_key, query)
            if status_code == 200 and isinstance(data, list):
                users = [
                    {
                        "account_id": u.get("accountId"),
                        "display_name": u.get("displayName", ""),
                        "avatar_url": (u.get("avatarUrls") or {}).get("24x24"),
                    }
                    for u in data
                ]
                return {"success": True, "source": "live", "data": users, "execution_time_ms": duration}
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        q = query.lower()
        users = [{"account_id": name, "display_name": name, "avatar_url": None} for name in self._SIM_ASSIGNABLE_USERS if q in name.lower()]
        return {"success": True, "source": "simulated", "data": users, "execution_time_ms": duration}

    async def assign_ticket(self, ticket_key: str, account_id: str, display_name: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            # Assignee must be set via {"accountId": ...} - Jira Cloud dropped username/display-name
            # based identification, so a raw string here would silently fail against the real API.
            status_code, data, error, duration = await self.client.update_ticket(ticket_key, {"assignee": {"accountId": account_id}})
            if status_code in (200, 204):
                return {"success": True, "source": "live", "data": {"key": ticket_key, "assignee": display_name}, "execution_time_ms": duration}
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        ticket = self.db.query(JiraTicket).filter(JiraTicket.key == ticket_key).first()
        if not ticket:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_key} not found", "execution_time_ms": duration}
        ticket.assignee = display_name
        self.db.commit()
        res_data = {"key": ticket.key, "assignee": ticket.assignee}
        log_api_call("jira", f"/issue/{ticket_key}/assignee", "PUT", duration, 200, {"account_id": account_id}, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    _OPEN_STATUSES = ["Backlog", "To Do", "Dev In Progress"]
    # Simulated data has no auth/user concept - "Jane Doe" is the most-seeded assignee, standing in for "me"
    _SIM_CURRENT_USER = "Jane Doe"
    _SIM_STATUS_TO_BUCKET = {"To Do": "Backlog", "In Progress": "Dev In Progress"}

    async def get_my_open_tickets(self) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jira_configured:
            statuses_jql = ", ".join(f'"{s}"' for s in self._OPEN_STATUSES)
            jql = f'assignee = currentUser() AND status in ({statuses_jql}) ORDER BY status ASC, updated DESC'

            # /search/jql is cursor-paginated (nextPageToken/isLast, no `total`) - a single page
            # silently truncates whenever the combined match count crosses the page size, so page
            # through everything (capped as a backstop, mirroring the GitHub tag-listing pattern).
            issues: List[Dict[str, Any]] = []
            next_token = None
            total_duration = 0.0
            status_code, data, error = 0, None, None
            for _ in range(20):
                status_code, data, error, duration = await self.client.search_issues(jql, next_page_token=next_token)
                total_duration += duration
                if status_code != 200 or not isinstance(data, dict):
                    break
                issues.extend(data.get("issues", []))
                if data.get("isLast", True):
                    break
                next_token = data.get("nextPageToken")
                if not next_token:
                    break

            if status_code == 200 and isinstance(data, dict):
                tickets = []
                current_sprint_name = None
                for issue in issues:
                    fields = issue.get("fields", {})
                    status = fields.get("status") or {}
                    priority = fields.get("priority") or {}
                    issue_type = fields.get("issuetype") or {}

                    # The "Sprint" field (customfield_10010) can list several sprints per issue
                    # (closed ones plus the active one) - only the "active" entry is the current
                    # sprint. This team names it "CodeRed-Sprint ..." so require that too, in case
                    # a non-CodeRed active sprint ever ends up on the same field.
                    sprint_field = fields.get("customfield_10010") or []
                    active_sprint = next((s for s in sprint_field if isinstance(s, dict) and s.get("state") == "active"), None)
                    in_current_sprint = bool(active_sprint and "codered" in (active_sprint.get("name") or "").lower())
                    if in_current_sprint and not current_sprint_name:
                        current_sprint_name = active_sprint.get("name")

                    tickets.append({
                        "key": issue.get("key"),
                        "summary": fields.get("summary", ""),
                        "status": status.get("name", ""),
                        "priority": priority.get("name"),
                        "issue_type": issue_type.get("name"),
                        "updated": fields.get("updated"),
                        "url": f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{issue.get('key')}",
                        "in_current_sprint": in_current_sprint,
                    })
                # Jira instances can have near-duplicate statuses differing only by case
                # (e.g. "Dev In Progress" vs "DEV IN PROGRESS") - match case-insensitively so
                # tickets don't silently vanish from every bucket over a casing mismatch.
                grouped = {s: [t for t in tickets if t["status"].strip().lower() == s.lower()] for s in self._OPEN_STATUSES}
                return {
                    "success": True,
                    "source": "live",
                    "data": {
                        "statuses": self._OPEN_STATUSES,
                        "grouped": grouped,
                        "tickets": tickets,
                        "current_sprint_name": current_sprint_name,
                    },
                    "execution_time_ms": total_duration,
                }
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": total_duration}

        # Simulation Mode - seed data has no "Backlog"/"Dev In Progress" statuses, so map the
        # nearest simulated equivalents onto the real bucket names the user actually asked for
        duration = (time.perf_counter() - start_time) * 1000
        tickets_qs = self.db.query(JiraTicket).filter(JiraTicket.assignee == self._SIM_CURRENT_USER).all()
        tickets = []
        for t in tickets_qs:
            bucket = self._SIM_STATUS_TO_BUCKET.get(t.status)
            if not bucket:
                continue
            tickets.append({
                "key": t.key,
                "summary": t.summary,
                "status": bucket,
                "priority": t.priority,
                "issue_type": "Task",
                "updated": None,
                "url": None,
                "in_current_sprint": t.sprint == "Sprint 1",
            })
        grouped = {s: [t for t in tickets if t["status"] == s] for s in self._OPEN_STATUSES}
        return {
            "success": True,
            "source": "simulated",
            "data": {
                "statuses": self._OPEN_STATUSES,
                "grouped": grouped,
                "tickets": tickets,
                "current_sprint_name": "Sprint 1" if any(t["in_current_sprint"] for t in tickets) else None,
            },
            "execution_time_ms": duration,
        }

    # "Flow" buckets measure monthly throughput - only counts if the ticket actually
    # TRANSITIONED into this status this month (via "status changed to X after startOfMonth()"),
    # so an unrelated field edit (e.g. QA updating a bug-count field) can't inflate the count.
    _REPORT_FLOW_STATUS_BUCKETS = {
        "completed": "Done",
        "released": "Released",
    }
    # "Snapshot" buckets measure current ongoing work - just whatever is in that status right
    # now, regardless of when it got there, since being "in progress" naturally spans months.
    _REPORT_SNAPSHOT_STATUS_BUCKETS = {
        "ready_for_testing": "Ready For Testing",
        # "Re-opened" (with a hyphen) is not a real status in this Jira instance - verified via
        # GET /rest/api/3/status, which lists "Reopened" (no hyphen) instead, among other unused
        # near-duplicates ("Reopen", "REOPEN", "Reopen for dev"). The hyphenated version never
        # matched a single real ticket.
        "reopened": "Reopened",
        "blocked": "Blocked",
        "dev_in_progress": "Dev In Progress",
    }
    _REPORT_STATUS_BUCKETS = {**_REPORT_FLOW_STATUS_BUCKETS, **_REPORT_SNAPSHOT_STATUS_BUCKETS}
    # Issue TYPE (Defect/Bug) is not a reliable signal for where an issue was found - verified
    # against a real ticket (a "Defect" whose actual Environment Found field was "Prod", not
    # SIT). The real, authoritative signal is the "Environment Found" radio-button custom field
    # (customfield_10192, JQL clause `cf[10192]`), whose real allowed values are: Dev, QA, D2A,
    # SIT, Pre-Prod, Prod Internal, Prod. Counted by creation date this month (issues *raised*
    # this month), not current status.
    ENVIRONMENT_FOUND_FIELD = "customfield_10192"
    _REPORT_ENVIRONMENT_BUCKETS = {
        "sit_issues": ["SIT"],
        "production_issues": ["Prod", "Prod Internal"],
    }
    _REPORT_BUCKET_LABELS = {
        "completed": "Completed",
        "released": "Released",
        "ready_for_testing": "Ready For Testing",
        "reopened": "Reopened",
        "blocked": "Blocked",
        "dev_in_progress": "Dev In Progress",
        "sit_issues": "SIT Issues",
        "production_issues": "Production Issues",
    }

    @staticmethod
    def _parse_jira_datetime(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            # Jira's format: "2026-08-03T10:15:00.000+0000"
            return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f%z")
        except ValueError:
            return None

    async def get_monthly_report(self) -> Dict[str, Any]:
        start_time = time.perf_counter()
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_label = month_start.strftime("%Y-%m")
        bucket_keys = list(self._REPORT_STATUS_BUCKETS) + list(self._REPORT_ENVIRONMENT_BUCKETS)

        if settings.jira_configured:
            # Flow buckets (Completed/Released) only count a ticket if it actually TRANSITIONED
            # into that status this month - `updated >= startOfMonth()` was wrong here, since any
            # unrelated field edit (e.g. QA filling in a bug-count field) also bumps `updated`
            # without a status change. `status CHANGED TO "X" AFTER startOfMonth()` tracks the
            # real transition. Snapshot buckets (Blocked/Dev In Progress/etc) want whatever is
            # currently in that status AND was actually touched this month - without the date
            # bound, years-old stale tickets nobody has looked at recently flood the report.
            flow_clauses = " OR ".join(
                f'(status = "{s}" AND status changed to "{s}" after startOfMonth())'
                for s in self._REPORT_FLOW_STATUS_BUCKETS.values()
            )
            snapshot_statuses_jql = ", ".join(f'"{s}"' for s in self._REPORT_SNAPSHOT_STATUS_BUCKETS.values())
            env_values_jql = ", ".join(
                f'"{v}"' for values in self._REPORT_ENVIRONMENT_BUCKETS.values() for v in values
            )
            jql = (
                f'assignee = currentUser() AND ('
                f'{flow_clauses} OR '
                f'(status in ({snapshot_statuses_jql}) AND updated >= startOfMonth()) OR '
                f'(cf[10192] in ({env_values_jql}) AND created >= startOfMonth())'
                f') ORDER BY updated DESC'
            )

            issues: List[Dict[str, Any]] = []
            next_token = None
            total_duration = 0.0
            status_code, data, error = 0, None, None
            for _ in range(20):
                status_code, data, error, duration = await self.client.search_issues(
                    jql, next_page_token=next_token,
                    fields=f"summary,status,issuetype,updated,created,{self.ENVIRONMENT_FOUND_FIELD}"
                )
                total_duration += duration
                if status_code != 200 or not isinstance(data, dict):
                    break
                issues.extend(data.get("issues", []))
                if data.get("isLast", True):
                    break
                next_token = data.get("nextPageToken")
                if not next_token:
                    break

            if status_code != 200 or not isinstance(data, dict):
                error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
                return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": total_duration}

            tickets = []
            for issue in issues:
                fields = issue.get("fields", {})
                status = fields.get("status") or {}
                issue_type = fields.get("issuetype") or {}
                env_found = fields.get(self.ENVIRONMENT_FOUND_FIELD) or {}
                tickets.append({
                    "key": issue.get("key"),
                    "summary": fields.get("summary", ""),
                    "status": status.get("name", ""),
                    "issue_type": issue_type.get("name"),
                    "environment_found": env_found.get("value") if isinstance(env_found, dict) else None,
                    "updated": fields.get("updated"),
                    "created": fields.get("created"),
                    "url": f"{settings.JIRA_BASE_URL.rstrip('/')}/browse/{issue.get('key')}",
                })

            buckets: Dict[str, List[Dict[str, Any]]] = {k: [] for k in bucket_keys}
            for t in tickets:
                status_l = (t["status"] or "").strip().lower()
                env_found_l = (t["environment_found"] or "").strip().lower()
                created_dt = self._parse_jira_datetime(t["created"])

                # Each status disjunct in the JQL above requires an exact current-status match,
                # and a ticket only ever has one current status - so if it's present here with
                # status X, it can only have qualified via the "X" disjunct, which already
                # guarantees the transition-to-X happened this month. No extra date check needed.
                for key, target_status in self._REPORT_STATUS_BUCKETS.items():
                    if status_l == target_status.lower():
                        buckets[key].append(t)
                for key, target_envs in self._REPORT_ENVIRONMENT_BUCKETS.items():
                    if env_found_l in [v.lower() for v in target_envs] and created_dt and created_dt >= month_start:
                        buckets[key].append(t)

            return {
                "success": True,
                "source": "live",
                "data": {
                    "month": month_label,
                    "is_simulated": False,
                    "buckets": {
                        key: {"label": self._REPORT_BUCKET_LABELS[key], "count": len(buckets[key]), "tickets": buckets[key]}
                        for key in bucket_keys
                    },
                },
                "execution_time_ms": total_duration,
            }

        # Simulation Mode - seed data has no timestamps or issue-type concept, so this is a
        # best-effort approximation: status-based buckets only, no date bounding, no SIT/Prod counts.
        duration = (time.perf_counter() - start_time) * 1000
        tickets_qs = self.db.query(JiraTicket).filter(JiraTicket.assignee == self._SIM_CURRENT_USER).all()
        buckets = {k: [] for k in bucket_keys}
        for t in tickets_qs:
            status_l = (t.status or "").strip().lower()
            for key, target_status in self._REPORT_STATUS_BUCKETS.items():
                if status_l == target_status.lower():
                    buckets[key].append({
                        "key": t.key, "summary": t.summary, "status": t.status,
                        "issue_type": "Task", "updated": None, "created": None, "url": None,
                    })

        return {
            "success": True,
            "source": "simulated",
            "data": {
                "month": month_label,
                "is_simulated": True,
                "buckets": {
                    key: {"label": self._REPORT_BUCKET_LABELS[key], "count": len(buckets[key]), "tickets": buckets[key]}
                    for key in bucket_keys
                },
            },
            "execution_time_ms": duration,
        }

    async def get_time_tracker(self) -> Dict[str, Any]:
        # Track daily/weekly/monthly hours in simulation or mock logic
        worklogs = self.db.query(JiraWorklog).all()
        # Parse hours
        total_hours = 0.0
        for w in worklogs:
            # Parse '2h 30m' or similar
            time_str = w.time_spent.lower()
            parts = time_str.split()
            w_hours = 0.0
            for part in parts:
                if 'h' in part:
                    w_hours += float(part.replace('h', '').strip() or 0)
                elif 'm' in part:
                    w_hours += float(part.replace('m', '').strip() or 0) / 60.0
            total_hours += w_hours

        # Return tracker hours
        return {
            "today_hours": round(total_hours * 0.4, 1),
            "week_hours": round(total_hours * 0.8, 1),
            "month_hours": round(total_hours, 1),
            "remaining_hours": max(0.0, round(40.0 - total_hours * 0.8, 1)),
            "target_daily": 8.0
        }

    # PROD is intentionally excluded - no status change requested for that environment.
    _PUSH_TO_QA_STATUS_MAP = {
        "SIT": "Ready For Testing",
        "Pre-Prod": "Pre Prod",
    }

    async def list_qa_assignees(self) -> List[Dict[str, str]]:
        return get_numbered_contacts(QA_ASSIGNEE_PREFIX)

    async def push_to_qa(self, ticket_key: str, ticket_url: str, environment: Literal["SIT", "Pre-Prod", "PROD"], assignee_email: Optional[str] = None) -> Dict[str, Any]:
        start_time = time.perf_counter()
        qa_assignees = get_numbered_contacts(QA_ASSIGNEE_PREFIX)
        assignee_email = assignee_email or settings.PUSH_TO_QA_ASSIGNEE_EMAIL or (qa_assignees[0]["email"] if qa_assignees else None)
        assignee_display_name = next(
            (c["name"] for c in qa_assignees if c["email"] == assignee_email),
            settings.PUSH_TO_QA_ASSIGNEE_NAME,
        )

        if settings.jira_configured:
            if not assignee_email:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": "PUSH_TO_QA_ASSIGNEE_EMAIL is not configured", "execution_time_ms": duration}
            assignable = await self.get_assignable_users(ticket_key, query=assignee_email)
            if not assignable["success"]:
                return assignable
            matches = assignable["data"]
            if not matches:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": f"No assignable user found for {assignee_email} on this ticket", "execution_time_ms": duration}
            account_id = matches[0]["account_id"]
            display_name = matches[0]["display_name"]
        else:
            # Simulated data has no real Jira users - assign directly by name, mirroring how
            # assign_ticket's own simulation branch already works (display_name is all it needs).
            account_id = assignee_email or settings.PUSH_TO_QA_ASSIGNEE_NAME
            display_name = assignee_display_name

        comment_res = await self.add_comment(ticket_key, f"Changes pushed to {environment}. Kindly validate")
        if not comment_res["success"]:
            return comment_res

        target_status = self._PUSH_TO_QA_STATUS_MAP.get(environment)
        transition_res = None
        if target_status:
            if settings.jira_configured:
                transitions_res = await self.get_transitions(ticket_key)
                if not transitions_res["success"]:
                    return transitions_res
                match = next((t for t in transitions_res["data"] if t["name"].strip().lower() == target_status.lower()), None)
                if not match:
                    duration = (time.perf_counter() - start_time) * 1000
                    return {"success": False, "source": "live", "error": f"No transition to '{target_status}' status found for {ticket_key}", "execution_time_ms": duration}
                transition_target = match["id"]
            else:
                # Simulated transition_ticket treats the id as the target status name directly.
                transition_target = target_status
            transition_res = await self.transition_ticket(ticket_key, transition_target)
            if not transition_res["success"]:
                return transition_res

        assign_res = await self.assign_ticket(ticket_key, account_id, display_name)
        if not assign_res["success"]:
            return assign_res

        # The Jira-side actions above already succeeded - a Cliq failure here is reported
        # alongside them, not treated as a reason to roll anything back.
        # {@email} is Cliq's real mention syntax - plain "@name" text is never a mention, just letters.
        cliq_res = await self.cliq_service.send_message(f"{{@{assignee_email}}} {ticket_url} - Changes pushed to {environment}, Kindly validate")

        duration = (time.perf_counter() - start_time) * 1000
        return {
            "success": True,
            "source": comment_res["source"],
            "data": {
                "ticket_key": ticket_key,
                "environment": environment,
                "comment": comment_res["data"],
                "status": target_status,
                "assignee": assign_res["data"],
                "cliq_notification": {
                    "success": cliq_res["success"],
                    "source": cliq_res["source"],
                    "error": cliq_res.get("error"),
                },
            },
            "execution_time_ms": duration,
        }

    async def get_sprint_board(self) -> Dict[str, Any]:
        tickets = self.db.query(JiraTicket).all()
        backlog = [t for t in tickets if t.status == "To Do"]
        in_progress = [t for t in tickets if t.status == "In Progress"]
        done = [t for t in tickets if t.status == "Done"]
        
        sp_done = sum([t.story_points for t in done if t.story_points])
        sp_total = sum([t.story_points for t in tickets if t.story_points])

        return {
            "sprint_name": "Sprint 1 (Active)",
            "sprint_status": "active",
            "backlog_count": len(backlog),
            "in_progress_count": len(in_progress),
            "done_count": len(done),
            "story_points_total": sp_total,
            "story_points_done": sp_done,
            "burndown_summary": f"On track: {sp_done}/{sp_total} SP completed ({int(sp_done/sp_total*100) if sp_total else 0}%)"
        }
