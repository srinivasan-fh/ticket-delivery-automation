from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional

class CRMFranchiseRequest(BaseModel):
    name: str = Field(..., min_length=2, examples=["Franchise Alpha"])
    location: str = Field(..., examples=["New York, USA"])
    email: str = Field(..., examples=["franchise@alpha.com"])
    phone: str = Field(..., examples=["+1-555-0199"])

class CRMResellerRequest(BaseModel):
    company_name: str = Field(..., min_length=2, examples=["Reseller Corp"])
    email: str = Field(..., examples=["info@resellercorp.com"])
    phone: str = Field(..., examples=["+1-555-0288"])
    tax_id: str = Field(..., min_length=5, examples=["TX-987654321"])

class CRMOrderLookupRequest(BaseModel):
    order_numbers: List[str] = Field(..., examples=[["ORD-1001", "ORD-1002"]])

class CRMOrderInfo(BaseModel):
    order_number: str
    customer_name: str
    total_amount: float
    status: str
    items_count: int
    created_at: str

class CRMSocialPostRequest(BaseModel):
    platform: str = Field("Twitter/X", examples=["LinkedIn", "Twitter/X"])
    content: str = Field(..., max_length=280, examples=["We are happy to launch our franchise portal!"])
    scheduled_time: Optional[str] = Field(None, examples=["2026-07-18T12:00:00Z"])
    media_url: Optional[str] = Field(None, examples=["https://example.com/assets/banner.png"])
