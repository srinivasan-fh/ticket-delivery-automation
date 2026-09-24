from datetime import datetime, timedelta
from typing import List, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.scheduler import scheduler
from app.clients.octopus_client import OctopusClient
from app.services.release_ticket_service import REPO_CONFIGS
from app.services.devops_service import DevOpsService
from app.models.database_models import TagWatcher

ALLOWED_REPOS = ("MS", "MSWEB")
MAX_WATCH_DURATION_SECONDS = 30 * 60  # give up after 30 minutes of no match
NON_TERMINAL_STATUSES = ("running", "found", "deploying")

# The simulated Octopus environment fixture's SIT entry (DevOpsService._sim_octopus_environments).
SIMULATED_SIT_ENVIRONMENT_ID = "Env-1"


def _job_id(watcher_id: int) -> str:
    return f"tagwatch-{watcher_id}"


class TagWatcherService:
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

    async def _resolve_sit_environment_id(self) -> str:
        if not settings.octopus_configured:
            return SIMULATED_SIT_ENVIRONMENT_ID

        status_code, data, error, _ = await self.octopus_client.get_environments()
        if status_code != 200:
            raise ValueError(f"Could not fetch Octopus environments: {error or status_code}")

        items = data.get("Items", []) if isinstance(data, dict) else (data or [])
        env = next((e for e in items if str(e.get("Name", "")).lower() == "sit"), None)
        if not env:
            raise ValueError("Could not resolve a 'SIT' environment in Octopus")
        return env["Id"]

    async def start_watch(self, repo: str, tag_name: str, interval_seconds: int) -> TagWatcher:
        if repo not in ALLOWED_REPOS:
            raise ValueError(f"Unsupported repo '{repo}' - only {ALLOWED_REPOS} are supported")

        db = SessionLocal()
        try:
            existing = (
                db.query(TagWatcher)
                .filter(TagWatcher.repo == repo, TagWatcher.tag_name == tag_name, TagWatcher.status.in_(NON_TERMINAL_STATUSES))
                .first()
            )
            if existing:
                return existing

            octopus_project_id = REPO_CONFIGS[repo]["octopus_project_id"]
            environment_id = await self._resolve_sit_environment_id()

            watcher = TagWatcher(
                repo=repo,
                octopus_project_id=octopus_project_id,
                tag_name=tag_name,
                interval_seconds=interval_seconds,
                environment_id=environment_id,
                environment_name="SIT",
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

    async def stop_watch(self, watcher_id: int) -> Optional[TagWatcher]:
        db = SessionLocal()
        try:
            watcher = db.query(TagWatcher).filter(TagWatcher.id == watcher_id).first()
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

    async def get_watch(self, watcher_id: int) -> Optional[TagWatcher]:
        db = SessionLocal()
        try:
            return db.query(TagWatcher).filter(TagWatcher.id == watcher_id).first()
        finally:
            db.close()

    async def list_watches(self, active_only: bool = False, limit: int = 20) -> List[TagWatcher]:
        db = SessionLocal()
        try:
            query = db.query(TagWatcher)
            if active_only:
                query = query.filter(TagWatcher.status.in_(NON_TERMINAL_STATUSES))
            return query.order_by(TagWatcher.created_at.desc()).limit(limit).all()
        finally:
            db.close()

    async def resume_active_watchers(self) -> int:
        db = SessionLocal()
        try:
            active = db.query(TagWatcher).filter(TagWatcher.status == "running").all()
            for w in active:
                self._schedule_job(w.id, w.interval_seconds)
            return len(active)
        finally:
            db.close()


async def _poll_tick(watcher_id: int) -> None:
    """APScheduler job body - one recurring check for a single watcher. Opens its own
    short-lived session per tick rather than holding one across the network calls below."""
    service = TagWatcherService()
    db = SessionLocal()
    try:
        watcher = db.query(TagWatcher).filter(TagWatcher.id == watcher_id).first()
        if not watcher or watcher.status != "running":
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

        matched_version = None
        if settings.octopus_configured:
            status_code, data, error, _ = await service.octopus_client.get_releases(watcher.octopus_project_id)
            if status_code == 200:
                items = data.get("Items", []) if isinstance(data, dict) else (data or [])
                match = next((r for r in items if r.get("Version") == watcher.tag_name), None)
                if match:
                    matched_version = match["Version"]
        else:
            # Simulated mode: deterministically "find" the tag after a couple of ticks so the
            # full found -> deploy flow is demonstrable without real Octopus credentials.
            if watcher.poll_count >= 2:
                matched_version = watcher.tag_name

        if not matched_version:
            return  # nothing to do, next tick will check again

        watcher.status = "found"
        watcher.release_version = matched_version
        watcher.found_at = datetime.utcnow()
        db.commit()

        watcher.status = "deploying"
        db.commit()

        result = await service.devops_service.deploy_octopus_release(
            project_id=watcher.octopus_project_id,
            environment_id=watcher.environment_id,
            release_version=matched_version,
        )

        if result.get("success"):
            watcher.status = "deployed"
            dep_data = result.get("data") or {}
            watcher.deployment_id = dep_data.get("Id") or dep_data.get("deployment_id")
            watcher.deployment_task_id = dep_data.get("TaskId")
        else:
            watcher.status = "failed"
            watcher.error_message = result.get("error")

        watcher.resolved_at = datetime.utcnow()
        db.commit()
        service._unschedule_job(watcher_id)
    except Exception as exc:
        db.rollback()
        watcher = db.query(TagWatcher).filter(TagWatcher.id == watcher_id).first()
        if watcher:
            watcher.status = "failed"
            watcher.error_message = str(exc)
            watcher.resolved_at = datetime.utcnow()
            db.commit()
        service._unschedule_job(watcher_id)
    finally:
        db.close()
