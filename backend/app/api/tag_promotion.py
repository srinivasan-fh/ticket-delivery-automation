from typing import List
from fastapi import APIRouter, HTTPException
from app.services.tag_promotion_service import TagPromotionService
from app.schemas.tag_promotion import TagPromotionStartRequest, TagPromotionResponse

router = APIRouter(prefix="/tag-promotion", tags=["Tag Promotion Watcher"])


@router.post("", response_model=TagPromotionResponse)
async def start_watch(payload: TagPromotionStartRequest):
    service = TagPromotionService()
    try:
        return await service.start_watch(payload.repo, payload.tag_name, payload.interval_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[TagPromotionResponse])
async def list_watches(active_only: bool = False, limit: int = 20):
    return await TagPromotionService().list_watches(active_only=active_only, limit=limit)


@router.get("/{watcher_id}", response_model=TagPromotionResponse)
async def get_watch(watcher_id: int):
    watcher = await TagPromotionService().get_watch(watcher_id)
    if not watcher:
        raise HTTPException(status_code=404, detail="Watcher not found")
    return watcher


@router.post("/{watcher_id}/stop", response_model=TagPromotionResponse)
async def stop_watch(watcher_id: int):
    watcher = await TagPromotionService().stop_watch(watcher_id)
    if not watcher:
        raise HTTPException(status_code=404, detail="Watcher not found")
    return watcher
