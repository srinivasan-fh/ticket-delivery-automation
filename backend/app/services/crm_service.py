import time
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.core.logging import log_api_call
from app.clients.crm_client import CRMClient
from app.models.database_models import CRMFranchise, CRMOrder, CRMReseller, CRMPost

class CRMService:
    def __init__(self, db: Session):
        self.db = db
        self.client = CRMClient()
        self._ensure_seed_data()

    def _ensure_seed_data(self):
        """Seed mock orders for lookup if table is empty."""
        if self.db.query(CRMOrder).count() == 0:
            orders = [
                CRMOrder(order_number="ORD-1001", customer_name="Alice Smith", total_amount=249.99, status="Shipped", items_count=3),
                CRMOrder(order_number="ORD-1002", customer_name="Bob Johnson", total_amount=1200.50, status="Processing", items_count=5),
                CRMOrder(order_number="ORD-1003", customer_name="Charlie Brown", total_amount=45.00, status="Delivered", items_count=1),
                CRMOrder(order_number="ORD-1004", customer_name="David Davis", total_amount=720.00, status="Cancelled", items_count=2),
                CRMOrder(order_number="ORD-1005", customer_name="Eve Evans", total_amount=89.90, status="Shipped", items_count=4)
            ]
            self.db.add_all(orders)
            
            resellers = [
                CRMReseller(company_name="Global Tech Distributors", email="resell@globaltech.com", phone="+1-800-555-0100", tax_id="TAX-998877"),
                CRMReseller(company_name="Superstore Retailers Inc", email="billing@superstore.com", phone="+1-800-555-0200", tax_id="TAX-665544")
            ]
            self.db.add_all(resellers)
            self.db.commit()

    async def create_franchise(self, data: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        # Validation checks
        name = data.get("name")
        email = data.get("email")
        
        # Check duplicate in local simulation
        existing = self.db.query(CRMFranchise).filter((CRMFranchise.name == name) | (CRMFranchise.email == email)).first()
        duration = (time.perf_counter() - start_time) * 1000
        
        if existing:
            error = f"Franchise with name '{name}' or email '{email}' already exists."
            log_api_call("crm", "/franchise/create", "POST", duration, 400, data, None, error, is_simulated=True)
            return {"success": False, "source": "simulated", "error": error, "execution_time_ms": duration}

        if settings.crm_configured:
            status_code, live_data, live_error, live_duration = await self.client.create_franchise(data)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": live_data, "execution_time_ms": live_duration}

        # Simulation Mode
        franchise = CRMFranchise(
            name=name,
            location=data.get("location"),
            email=email,
            phone=data.get("phone")
        )
        self.db.add(franchise)
        self.db.commit()

        res_data = {"id": franchise.id, "name": franchise.name, "location": franchise.location, "email": franchise.email, "phone": franchise.phone, "created_at": franchise.created_at.isoformat()}
        log_api_call("crm", "/franchise/create", "POST", duration, 201, data, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def create_reseller(self, data: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        comp_name = data.get("company_name")
        tax_id = data.get("tax_id")
        
        # Check duplicates in simulation
        existing = self.db.query(CRMReseller).filter((CRMReseller.company_name == comp_name) | (CRMReseller.tax_id == tax_id)).first()
        duration = (time.perf_counter() - start_time) * 1000

        if existing:
            error = f"Reseller with company name '{comp_name}' or Tax ID '{tax_id}' already exists."
            log_api_call("crm", "/reseller/create", "POST", duration, 400, data, None, error, is_simulated=True)
            return {"success": False, "source": "simulated", "error": error, "execution_time_ms": duration}

        if settings.crm_configured:
            status_code, live_data, live_error, live_duration = await self.client.create_reseller(data)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": live_data, "execution_time_ms": live_duration}

        # Simulation Mode
        reseller = CRMReseller(
            company_name=comp_name,
            email=data.get("email"),
            phone=data.get("phone"),
            tax_id=tax_id
        )
        self.db.add(reseller)
        self.db.commit()

        res_data = {"id": reseller.id, "company_name": reseller.company_name, "email": reseller.email, "phone": reseller.phone, "tax_id": reseller.tax_id, "created_at": reseller.created_at.isoformat()}
        log_api_call("crm", "/reseller/create", "POST", duration, 201, data, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def lookup_orders(self, order_numbers: List[str]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        if settings.crm_configured:
            status_code, live_data, live_error, live_duration = await self.client.lookup_orders(order_numbers)
            if status_code == 200:
                return {"success": True, "source": "live", "data": live_data, "execution_time_ms": live_duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        # Fetch from DB
        orders = self.db.query(CRMOrder).filter(CRMOrder.order_number.in_(order_numbers)).all()
        
        order_list = []
        for o in orders:
            order_list.append({
                "order_number": o.order_number,
                "customer_name": o.customer_name,
                "total_amount": o.total_amount,
                "status": o.status,
                "items_count": o.items_count,
                "created_at": o.created_at.isoformat()
            })

        log_api_call("crm", "/orders/lookup", "POST", duration, 200, {"order_numbers": order_numbers}, order_list, is_simulated=True)
        return {"success": True, "source": "simulated", "data": order_list, "execution_time_ms": duration}

    async def raise_social_post(self, data: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        if settings.crm_configured:
            status_code, live_data, live_error, live_duration = await self.client.post_social_media(data)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": live_data, "execution_time_ms": live_duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        post = CRMPost(
            platform=data.get("platform", "Twitter/X"),
            content=data.get("content"),
            scheduled_time=data.get("scheduled_time"),
            media_url=data.get("media_url"),
            status="Scheduled" if data.get("scheduled_time") else "Published"
        )
        self.db.add(post)
        self.db.commit()

        res_data = {
            "id": post.id,
            "platform": post.platform,
            "content": post.content,
            "scheduled_time": post.scheduled_time,
            "media_url": post.media_url,
            "status": post.status,
            "created_at": post.created_at.isoformat()
        }
        
        log_api_call("crm", "/social/post", "POST", duration, 201, data, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def get_franchises_and_resellers(self) -> Dict[str, Any]:
        franchises = self.db.query(CRMFranchise).order_by(CRMFranchise.created_at.desc()).all()
        resellers = self.db.query(CRMReseller).order_by(CRMReseller.created_at.desc()).all()
        posts = self.db.query(CRMPost).order_by(CRMPost.created_at.desc()).all()
        
        return {
            "franchises": [{"id": f.id, "name": f.name, "location": f.location, "email": f.email, "phone": f.phone, "created_at": f.created_at.isoformat()} for f in franchises],
            "resellers": [{"id": r.id, "company_name": r.company_name, "email": r.email, "phone": r.phone, "tax_id": r.tax_id, "created_at": r.created_at.isoformat()} for r in resellers],
            "posts": [{"id": p.id, "platform": p.platform, "content": p.content, "status": p.status, "scheduled_time": p.scheduled_time, "media_url": p.media_url, "created_at": p.created_at.isoformat()} for p in posts]
        }
