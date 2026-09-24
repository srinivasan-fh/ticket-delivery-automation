from datetime import datetime, timedelta
from typing import List, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.scheduler import scheduler
from app.clients.octopus_client import OctopusClient
from app.services.release_ticket_service import REPO_CONFIGS, PREPROD_ENV_ID
from app.services.devops_service import DevOpsService
from app.models.database_models import TagPromotionWatcher

ALLOWED_REPOS = ("MS", "MSWEB")
MAX_WATCH_DURATION_SECONDS = 30 * 60
NON_TERMINAL_STATUSES = ("running", "found", "deploying_sit_beta", "waiting_sit_beta", "promoting_preprod")

SIT_BETA_ENVIRONMENT_NAME = "SIT-\U0001D7AB"
SIMULATED_SIT_BETA_ENVIRONMENT_ID = "Env-1"
TERMINAL_TASK_STATES = {"Failed", "Canceled", "TimedOut"}
# Once the SIT-Beta deploy is triggered, switch to this fast fixed cadence rather than
# continuing to use the user's chosen tag-detection interval (which can be minutes long) -
# a deployment's actual completion usually resolves in well under a minute.
SIT_BETA_CHECK_INTERVAL_SECONDS = 15


def _job_id(watcher_id: int) -> str:
    return f"tagpromo-{watcher_id}"


def _tag_is_blocked(tag_name: str) -> bool:
    lname = tag_name.lower()
    return "sit" in lname or "stg" in lname


class TagPromotionService:
    def __init__(self):
        self.octopus_client = OctopusClient()
        self.devops_service = DevOpsService()

    def _schedule_job(self, watcher_id: int, interval_seconds: int) -> None:
        scheduler.add_job(
            _poll_tick,
            trigger="interval",
            seconds=interval_seconds,
            id=_job_id(watcher_id),
            args=[watcher_id],
            replace_existing=True,
        )

    def _unschedule_job(self, watcher_id: int) -> None:
        try:
            scheduler.remove_job(_job_id(watcher_id))
        except Exception:
            pass

    async def _resolve_sit_beta_environment_id(self) -> str:
        if not settings.octopus_configured:
            return SIMULATED_SIT_BETA_ENVIRONMENT_ID

        status_code, data, error, _ = await self.octopus_client.get("/api/environments", params={"take": 200})
        if status_code != 200:
            raise ValueError(f"Could not fetch Octopus environments: {error or status_code}")

        items = data.get("Items", []) if isinstance(data, dict) else (data or [])
        env = next((e for e in items if e.get("Name") == SIT_BETA_ENVIRONMENT_NAME), None)
        if not env:
            raise ValueError(f"Could not resolve the '{SIT_BETA_ENVIRONMENT_NAME}' environment in Octopus")
        return env["Id"]

    async def start_watch(self, repo: str, tag_name: str, interval_seconds: int) -> TagPromotionWatcher:
        if repo not in ALLOWED_REPOS:
            raise ValueError(f"Unsupported repo '{repo}' - only {ALLOWED_REPOS} are supported")
        if _tag_is_blocked(tag_name):
            raise ValueError("Tag name contains 'SIT' or 'STG' - those tags are not promoted to Pre-Prod via this pipeline. Use the Tag Sync Watcher card instead.")

        db = SessionLocal()
        try:
            existing = (
                db.query(TagPromotionWatcher)
                .filter(TagPromotionWatcher.repo == repo, TagPromotionWatcher.tag_name == tag_name, TagPromotionWatcher.status.in_(NON_TERMINAL_STATUSES))
                .first()
            )
            if existing:
                return existing

            octopus_project_id = REPO_CONFIGS[repo]["octopus_project_id"]
            sit_beta_environment_id = await self._resolve_sit_beta_environment_id()
            preprod_environment_id = PREPROD_ENV_ID if settings.octopus_configured else SIMULATED_SIT_BETA_ENVIRONMENT_ID

            watcher = TagPromotionWatcher(
                repo=repo,
                octopus_project_id=octopus_project_id,
                tag_name=tag_name,
                interval_seconds=interval_seconds,
                sit_beta_environment_id=sit_beta_environment_id,
                sit_beta_environment_name=SIT_BETA_ENVIRONMENT_NAME,
                preprod_environment_id=preprod_environment_id,
                preprod_environment_name="PREPROD",
                status="running",
                is_simulated=not settings.octopus_configured,
                poll_count=0,
                created_at=datetime.utcnow(),
            )
            db.add(watcher)
            db.commit()
            db.refresh(watcher)

            self._schedule_job(watcher.id, interval_seconds)
            return watcher
        finally:
            db.close()

    async def stop_watch(self, watcher_id: int) -> Optional[TagPromotionWatcher]:
        db = SessionLocal()
        try:
            watcher = db.query(TagPromotionWatcher).filter(TagPromotionWatcher.id == watcher_id).first()
            if not watcher:
                return None
            if watcher.status in NON_TERMINAL_STATUSES:
                watcher.status = "stopped"
                watcher.resolved_at = datetime.utcnow()
                db.commit()
                db.refresh(watcher)
            self._unschedule_job(watcher_id)
            return watcher
        finally:
            db.close()

    async def get_watch(self, watcher_id: int) -> Optional[TagPromotionWatcher]:
        db = SessionLocal()
        try:
            return db.query(TagPromotionWatcher).filter(TagPromotionWatcher.id == watcher_id).first()
        finally:
            db.close()

    async def list_watches(self, active_only: bool = False, limit: int = 20) -> List[TagPromotionWatcher]:
        db = SessionLocal()
        try:
            query = db.query(TagPromotionWatcher)
            if active_only:
                query = query.filter(TagPromotionWatcher.status.in_(NON_TERMINAL_STATUSES))
            return query.order_by(TagPromotionWatcher.created_at.desc()).limit(limit).all()
        finally:
            db.close()

    async def resume_active_watchers(self) -> int:
        db = SessionLocal()
        try:
            active = db.query(TagPromotionWatcher).filter(TagPromotionWatcher.status.in_(NON_TERMINAL_STATUSES)).all()
            for w in active:
                self._schedule_job(w.id, w.interval_seconds)
            return len(active)
        finally:
            db.close()


async def _poll_tick(watcher_id: int) -> None:
    service = TagPromotionService()
    db = SessionLocal()
    try:
        watcher = db.query(TagPromotionWatcher).filter(TagPromotionWatcher.id == watcher_id).first()
        if not watcher or watcher.status not in NON_TERMINAL_STATUSES:
            service._unschedule_job(watcher_id)
            return

        if datetime.utcnow() - watcher.created_at > timedelta(seconds=MAX_WATCH_DURATION_SECONDS):
            watcher.status = "timed_out"
            watcher.resolved_at = datetime.utcnow()
            db.commit()
            service._unschedule_job(watcher_id)
            return

        watcher.poll_count += 1
        watcher.last_checked_at = datetime.utcnow()
        db.commit()

        if watcher.status == "running":
            await _check_for_release(service, db, watcher)
        elif watcher.status == "waiting_sit_beta":
            await _check_sit_beta_task(service, db, watcher)
        # "found" / "deploying_sit_beta" / "promoting_preprod" are transient - they're always
        # advanced past within the same tick that sets them, so a tick should never observe them.

    except Exception as exc:
        db.rollback()
        watcher = db.query(TagPromotionWatcher).filter(TagPromotionWatcher.id == watcher_id).first()
        if watcher:
            watcher.status = "sit_beta_failed" if watcher.status in ("running", "found", "deploying_sit_beta") else "preprod_failed"
            watcher.error_message = str(exc)
            watcher.resolved_at = datetime.utcnow()
            db.commit()
        service._unschedule_job(watcher_id)
    finally:
        db.close()


async def _check_for_release(service: TagPromotionService, db, watcher: TagPromotionWatcher) -> None:
    matched_version = None
    if settings.octopus_configured:
        status_code, data, error, _ = await service.octopus_client.get_releases(watcher.octopus_project_id)
        if status_code == 200:
            items = data.get("Items", []) if isinstance(data, dict) else (data or [])
            match = next((r for r in items if r.get("Version") == watcher.tag_name), None)
            if match:
                matched_version = match["Version"]
    else:
        if watcher.poll_count >= 2:
            matched_version = watcher.tag_name

    if not matched_version:
        return

    watcher.status = "found"
    watcher.release_version = matched_version
    watcher.found_at = datetime.utcnow()
    db.commit()

    watcher.status = "deploying_sit_beta"
    db.commit()

    result = await service.devops_service.deploy_octopus_release(
        project_id=watcher.octopus_project_id,
        environment_id=watcher.sit_beta_environment_id,
        release_version=matched_version,
    )

    if not result.get("success"):
        watcher.status = "sit_beta_failed"
        watcher.error_message = result.get("error")
        watcher.resolved_at = datetime.utcnow()
        db.commit()
        service._unschedule_job(watcher.id)
        return

    dep_data = result.get("data") or {}
    watcher.sit_beta_deployment_id = dep_data.get("Id") or dep_data.get("deployment_id")
    watcher.sit_beta_task_id = dep_data.get("TaskId")

    if not watcher.is_simulated and watcher.sit_beta_task_id:
        watcher.status = "waiting_sit_beta"
        db.commit()
        # Switch to a fast cadence for the rest of this watch, and check right away instead of
        # waiting for the first fast tick - most deployments finish in seconds, so there's no
        # reason to sit idle until the next scheduled fire.
        service._schedule_job(watcher.id, SIT_BETA_CHECK_INTERVAL_SECONDS)
        await _check_sit_beta_task(service, db, watcher)
    else:
        # Simulated mode has no real Octopus task to poll - treat the SIT-Beta stage as
        # immediately successful and proceed straight to the Pre-Prod promotion.
        watcher.sit_beta_completed_at = datetime.utcnow()
        db.commit()
        await _promote_to_preprod(service, db, watcher)


async def _check_sit_beta_task(service: TagPromotionService, db, watcher: TagPromotionWatcher) -> None:
    status_code, data, error, _ = await service.octopus_client.get_tasks([watcher.sit_beta_task_id])
    if status_code != 200 or not isinstance(data, dict):
        return  # transient lookup failure - just retry next tick

    task = next((t for t in (data.get("Items") or []) if t.get("Id") == watcher.sit_beta_task_id), None)
    state = task.get("State") if task else None

    if state == "Success":
        watcher.sit_beta_completed_at = datetime.utcnow()
        db.commit()
        await _promote_to_preprod(service, db, watcher)
    elif state in TERMINAL_TASK_STATES:
        watcher.status = "sit_beta_failed"
        watcher.error_message = f"SIT-\U0001D7AB deployment task ended with state '{state}'"
        watcher.resolved_at = datetime.utcnow()
        db.commit()
        service._unschedule_job(watcher.id)
    # else: still Executing/Queued - keep polling next tick


async def _promote_to_preprod(service: TagPromotionService, db, watcher: TagPromotionWatcher) -> None:
    watcher.status = "promoting_preprod"
    db.commit()

    result = await service.devops_service.deploy_octopus_release(
        project_id=watcher.octopus_project_id,
        environment_id=watcher.preprod_environment_id,
        release_version=watcher.release_version,
    )

    if result.get("success"):
        dep_data = result.get("data") or {}
        watcher.preprod_deployment_id = dep_data.get("Id") or dep_data.get("deployment_id")
        watcher.preprod_task_id = dep_data.get("TaskId")
        watcher.status = "deployed"
    else:
        watcher.status = "preprod_failed"
        watcher.error_message = result.get("error")

    watcher.resolved_at = datetime.utcnow()
    db.commit()
    service._unschedule_job(watcher.id)
