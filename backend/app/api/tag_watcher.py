from typing import List
from fastapi import APIRouter, HTTPException
from app.services.tag_watcher_service import TagWatcherService
from app.schemas.tag_watcher import TagWatcherStartRequest, TagWatcherResponse

router = APIRouter(prefix="/tag-watcher", tags=["Tag Sync Watcher"])


@router.post("", response_model=TagWatcherResponse)
async def start_watch(payload: TagWatcherStartRequest):
    service = TagWatcherService()
    try:
        return await service.start_watch(payload.repo, payload.tag_name, payload.interval_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[TagWatcherResponse])
async def list_watches(active_only: bool = False, limit: int = 20):
    return await TagWatcherService().list_watches(active_only=active_only, limit=limit)


@router.get("/{watcher_id}", response_model=TagWatcherResponse)
async def get_watch(watcher_id: int):
    watcher = await TagWatcherService().get_watch(watcher_id)
    if not watcher:
        raise HTTPException(status_code=404, detail="Watcher not found")
    return watcher


@router.post("/{watcher_id}/stop", response_model=TagWatcherResponse)
async def stop_watch(watcher_id: int):
    watcher = await TagWatcherService().stop_watch(watcher_id)
    if not watcher:
        raise HTTPException(status_code=404, detail="Watcher not found")
    return watcher
