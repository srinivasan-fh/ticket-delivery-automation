import time
import os
import json
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.core.logging import log_api_call
from app.clients.itsm_client import ITSMClient
from app.clients.jira_client import JiraClient
from app.models.database_models import ITSMRequest

class ITSMService:
    def __init__(self, db: Session):
        self.db = db
        self.client = ITSMClient()
        # ITSM tickets are regular Jira issues underneath - "approve" is implemented as a
        # workflow transition and comments use the classic issue API, both via JiraClient,
        # rather than JSM's native servicedeskapi (which this account has no portal access to).
        self.jira_client = JiraClient()
        self._ensure_seed_data()

    def _ensure_seed_data(self):
        """Seed simulated ITSM requests if empty."""
        if self.db.query(ITSMRequest).count() == 0:
            reqs = [
                ITSMRequest(id="REQ-1001", title="MacBook Pro battery replacement", description="Battery drains in less than 1 hour. Requesting hardware diagnostic.", category="Hardware", priority="Medium", status="Open", attachments=json.dumps(["battery_report.pdf"])),
                ITSMRequest(id="REQ-1002", title="Datadog admin permission", description="Need admin access to configure dashboards for production monitoring.", category="Access", priority="High", status="Pending Approval", attachments=json.dumps([])),
                ITSMRequest(id="REQ-1003", title="GitHub CoPilot license renewal", description="License expired. Requesting developer renewal.", category="Software", priority="Low", status="Closed", attachments=json.dumps([]))
            ]
            self.db.add_all(reqs)
            self.db.commit()

    async def get_dashboard(self) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        if settings.itsm_configured:
            status_code, live_data, live_error, live_duration = await self.client.get_requests()
            if status_code == 200:
                # Map live JSM requests to the dashboard schema
                requests_list = []
                open_count = 0
                pending_count = 0
                closed_count = 0
                
                values = live_data.get("values", []) if isinstance(live_data, dict) else []
                for item in values:
                    req_id = item.get("issueKey", f"REQ-{item.get('issueId', '1000')}")
                    status_obj = item.get("currentStatus", {})
                    status = status_obj.get("status", "Open") if isinstance(status_obj, dict) else "Open"
                    
                    status_lower = status.lower()
                    if "closed" in status_lower or "done" in status_lower or "resolved" in status_lower:
                        closed_count += 1
                    elif "pending" in status_lower or "approval" in status_lower:
                        pending_count += 1
                    else:
                        open_count += 1
                        
                    title = "JSM Request"
                    description = "No description provided."
                    for field in item.get("requestFieldValues", []):
                        field_id = field.get("fieldId")
                        if field_id == "summary":
                            title = field.get("value") or title
                        elif field_id == "description":
                            description = field.get("value") or description
                            
                    requests_list.append({
                        "id": req_id,
                        "title": title,
                        "description": description,
                        "category": item.get("requestTypeId", "General"),
                        "priority": "Medium",
                        "status": status,
                        "attachments": [],
                        "created_at": item.get("createdDate", {}).get("iso8601", datetime.utcnow().isoformat()) if isinstance(item.get("createdDate"), dict) else datetime.utcnow().isoformat()
                    })
                    
                dashboard_data = {
                    "open_requests": open_count,
                    "pending_approvals": pending_count,
                    "closed_requests": closed_count,
                    "requests": requests_list
                }
                log_api_call("itsm", "/dashboard", "GET", live_duration, 200, None, dashboard_data)
                return dashboard_data

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        requests = self.db.query(ITSMRequest).order_by(ITSMRequest.created_at.desc()).all()
        
        open_count = len([r for r in requests if r.status == "Open"])
        pending_count = len([r for r in requests if r.status in ("Pending Approval", "Pending")])
        closed_count = len([r for r in requests if r.status == "Closed"])
 
        request_list = []
        for r in requests:
            attachments_list = []
            if r.attachments:
                try:
                    attachments_list = json.loads(r.attachments)
                except Exception:
                    attachments_list = [r.attachments]
            
            request_list.append({
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "category": r.category,
                "priority": r.priority,
                "status": r.status,
                "attachments": attachments_list,
                "created_at": r.created_at.isoformat()
            })
 
        dashboard_data = {
            "open_requests": open_count,
            "pending_approvals": pending_count,
            "closed_requests": closed_count,
            "requests": request_list
        }
        
        log_api_call("itsm", "/dashboard", "GET", duration, 200, None, dashboard_data, is_simulated=True)
        return dashboard_data
 
    async def raise_request(
        self,
        title: str,
        description: str,
        category: str,
        priority: str,
        attachments: List[str] = None
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        # Let's map JSM fields
        request_type_id = category # category is JSM Request Type ID from frontend dropdown
        if not request_type_id or not request_type_id.isdigit():
            request_type_id = "359" # Default: AWS Access Request
            
        req_field_values = {
            "summary": title,
            "description": description
        }
        
        # Add required custom fields for specific request types from the Postman collection
        if request_type_id == "359":
            req_field_values["customfield_10266"] = {"id": "10665"}  # AWS Account ID
            req_field_values["customfield_10245"] = [{"id": "10623"}]  # Environment ID
            req_field_values["customfield_10258"] = settings.JIRA_EMAIL or "user@foodhub.com"
            if attachments:
                req_field_values["attachment"] = ", ".join(attachments)
 
        jsm_payload = {
            "serviceDeskId": "34",
            "requestTypeId": request_type_id,
            "requestFieldValues": req_field_values
        }
 
        if settings.itsm_configured:
            status_code, live_data, live_error, live_duration = await self.client.raise_request(jsm_payload)
            if status_code in (200, 201) and isinstance(live_data, dict):
                # Map JSM request details to frontend display format
                mapped_data = {
                    "id": live_data.get("issueKey", f"REQ-{live_data.get('issueId')}"),
                    "title": title,
                    "description": description,
                    "category": f"Request Type {request_type_id}",
                    "priority": priority,
                    "status": live_data.get("currentStatus", {}).get("status", "Open") if isinstance(live_data.get("currentStatus"), dict) else "Open",
                    "attachments": attachments or [],
                    "created_at": live_data.get("createdDate", {}).get("iso8601", datetime.utcnow().isoformat()) if isinstance(live_data.get("createdDate"), dict) else datetime.utcnow().isoformat()
                }
                log_api_call("itsm", "/requests", "POST", live_duration, status_code, jsm_payload, mapped_data)
                return {"success": True, "source": "live", "data": mapped_data, "execution_time_ms": live_duration}
            else:
                err_detail = live_error or (live_data.get("errorMessage") if isinstance(live_data, dict) else "Unknown JSM error")
                raise Exception(err_detail)

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        req_id = f"REQ-{self.db.query(ITSMRequest).count() + 1001}"
        
        new_request = ITSMRequest(
            id=req_id,
            title=title,
            description=description,
            category=category,
            priority=priority,
            status="Open",
            attachments=json.dumps(attachments or [])
        )
        self.db.add(new_request)
        self.db.commit()

        res_data = {
            "id": new_request.id,
            "title": new_request.title,
            "description": new_request.description,
            "category": new_request.category,
            "priority": new_request.priority,
            "status": new_request.status,
            "attachments": attachments or [],
            "created_at": new_request.created_at.isoformat()
        }

        log_api_call("itsm", "/requests", "POST", duration, 201, req_data, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    @staticmethod
    def _flatten_adf(description: Any) -> Optional[str]:
        """Jira's v3 APIs return descriptions as Atlassian Document Format (a nested content
        tree), not plain text. Walk it and join the text nodes into a readable string."""
        if description is None:
            return None
        if isinstance(description, str):
            return description
        if not isinstance(description, dict):
            return None

        parts: List[str] = []

        def walk(node: Any):
            if isinstance(node, dict):
                if node.get("type") == "text" and node.get("text"):
                    parts.append(node["text"])
                for child in node.get("content", []) or []:
                    walk(child)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(description)
        return " ".join(parts) if parts else None

    async def _find_approve_transition(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """Jira only returns transitions the calling user can actually perform on this issue
        in its current status - an "approve"-named transition being absent/present here IS
        the real per-user, per-ticket approval availability (workflow-condition gated)."""
        status_code, data, error, duration = await self.jira_client.get_transitions(ticket_id)
        if status_code != 200 or not isinstance(data, dict):
            return None
        for transition in data.get("transitions", []):
            if "approve" in (transition.get("name") or "").lower():
                return transition
        return None

    async def get_recent_tickets(self, max_results: int = 20) -> Dict[str, Any]:
        start_time = time.perf_counter()

        if settings.itsm_configured:
            status_code, data, error, duration = await self.client.search_requests(
                'project = "ITSM" ORDER BY created DESC', max_results=max_results
            )
            if status_code == 200 and isinstance(data, dict):
                issues = data.get("issues", [])

                async def build_ticket(issue: Dict[str, Any]) -> Dict[str, Any]:
                    fields = issue.get("fields", {}) or {}
                    status_name = (fields.get("status") or {}).get("name", "Open")
                    priority_name = (fields.get("priority") or {}).get("name", "Medium")
                    approve_transition = await self._find_approve_transition(issue["key"])
                    return {
                        "id": issue["key"],
                        "title": fields.get("summary", ""),
                        "description": self._flatten_adf(fields.get("description")),
                        "status": status_name,
                        "priority": priority_name,
                        "created_at": fields.get("created", datetime.utcnow().isoformat()),
                        "has_pending_approval": approve_transition is not None,
                    }

                # Transitions are checked per-ticket (no bulk endpoint for it) - run these
                # concurrently so total latency is the slowest single call, not the sum.
                tickets = await asyncio.gather(*(build_ticket(issue) for issue in issues))
                log_api_call("itsm", "/rest/api/2/search", "GET", duration, 200, None, {"count": len(tickets)})
                return {"tickets": list(tickets)}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        requests = self.db.query(ITSMRequest).order_by(ITSMRequest.created_at.desc()).limit(max_results).all()
        tickets = [{
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "status": r.status,
            "priority": r.priority,
            "created_at": r.created_at.isoformat(),
            "has_pending_approval": r.status in ("Pending Approval", "Pending"),
        } for r in requests]
        log_api_call("itsm", "/tickets", "GET", duration, 200, None, {"count": len(tickets)}, is_simulated=True)
        return {"tickets": tickets}

    async def approve_ticket(self, ticket_id: str) -> Dict[str, Any]:
        start_time = time.perf_counter()

        if settings.itsm_configured:
            transition = await self._find_approve_transition(ticket_id)
            if not transition:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": "No approval action available for this ticket - it may not need approval, or you may not be the assigned approver.", "execution_time_ms": duration}

            st_code, st_data, st_err, st_dur = await self.jira_client.transition_ticket(ticket_id, transition["id"])
            duration = (time.perf_counter() - start_time) * 1000
            if st_code in (200, 201, 204):
                return {"success": True, "source": "live", "data": {"id": ticket_id, "transition": transition.get("name")}, "execution_time_ms": duration}

            error_detail = st_err or (st_data.get("errorMessages", [None])[0] if isinstance(st_data, dict) else None) or f"Jira returned HTTP {st_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        req = self.db.query(ITSMRequest).filter(ITSMRequest.id == ticket_id).first()
        if not req:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_id} not found", "execution_time_ms": duration}
        if req.status not in ("Pending Approval", "Pending"):
            return {"success": False, "source": "simulated", "error": "No pending approval found for this ticket", "execution_time_ms": duration}

        req.status = "Approved"
        self.db.commit()
        log_api_call("itsm", f"/tickets/{ticket_id}/approve", "POST", duration, 200, None, {"status": req.status}, is_simulated=True)
        return {"success": True, "source": "simulated", "data": {"id": req.id, "status": req.status}, "execution_time_ms": duration}

    async def add_comment_to_ticket(self, ticket_id: str, body: str) -> Dict[str, Any]:
        start_time = time.perf_counter()

        if settings.itsm_configured:
            status_code, data, error, duration = await self.jira_client.add_comment(ticket_id, body)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}
            error_detail = error or (data.get("errorMessages", [None])[0] if isinstance(data, dict) else None) or f"Jira returned HTTP {status_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        req = self.db.query(ITSMRequest).filter(ITSMRequest.id == ticket_id).first()
        if not req:
            return {"success": False, "source": "simulated", "error": f"Ticket {ticket_id} not found", "execution_time_ms": duration}

        log_api_call("itsm", f"/tickets/{ticket_id}/comment", "POST", duration, 201, {"body": body}, {"id": req.id}, is_simulated=True)
        return {"success": True, "source": "simulated", "data": {"id": req.id, "comment": body}, "execution_time_ms": duration}
