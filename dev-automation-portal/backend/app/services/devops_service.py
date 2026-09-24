import time
import random
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.core.config import settings
from app.core.logging import log_api_call
from app.clients.jenkins_client import JenkinsClient
from app.clients.octopus_client import OctopusClient
from app.schemas.devops import (
    OctopusDeploymentCell,
    OctopusEnvironmentInfo,
    OctopusProjectDashboardResponse,
    OctopusProjectGroupSection,
    OctopusProjectResolveItem,
    OctopusProjectRow,
    OctopusProjectsOverviewResponse,
    OctopusReleaseRow,
)

class DevOpsService:
    # Simulator static data
    _sim_jenkins_jobs = [
        {"name": "Frontend-Build-Deploy", "status": "SUCCESS", "last_build_number": 128, "last_build_time": "2026-07-17T18:45:00Z", "in_queue": False},
        {"name": "Backend-Integration-Tests", "status": "FAILURE", "last_build_number": 84, "last_build_time": "2026-07-17T20:12:00Z", "in_queue": False},
        {"name": "Database-Migrations-SIT", "status": "IDLE", "last_build_number": 43, "last_build_time": "2026-07-16T12:00:00Z", "in_queue": False},
        {"name": "Nightly-Regression-Suite", "status": "BUILDING", "last_build_number": 90, "last_build_time": "2026-07-17T21:30:00Z", "in_queue": True}
    ]

    _sim_octopus_project_groups = [
        {"id": "ProjGroup-1", "name": "API"},
        {"id": "ProjGroup-2", "name": "UI"},
    ]

    _sim_octopus_projects = [
        {"id": "Proj-1", "name": "Retail-Storefront", "description": "Core customer-facing shopping application", "project_group_id": "ProjGroup-1"},
        {"id": "Proj-2", "name": "BOB-CRM-Service", "description": "Franchise and reseller database system", "project_group_id": "ProjGroup-1"},
        {"id": "Proj-3", "name": "Payment-Gateway-Integration", "description": "Credit card and banking transaction broker", "project_group_id": "ProjGroup-2"}
    ]

    _sim_octopus_environments = [
        {"id": "Env-1", "name": "SIT", "status": "Healthy"},
        {"id": "Env-2", "name": "UAT", "status": "Healthy"},
        {"id": "Env-3", "name": "PROD", "status": "Healthy"}
    ]

    _sim_octopus_releases = {
        "Proj-1": [
            {"id": "Rel-10", "version": "1.2.0", "project_id": "Proj-1", "created_at": "2026-07-01T10:00:00Z"},
            {"id": "Rel-11", "version": "1.3.0-rc1", "project_id": "Proj-1", "created_at": "2026-07-15T16:40:00Z"}
        ],
        "Proj-2": [
            {"id": "Rel-4", "version": "0.9.5", "project_id": "Proj-2", "created_at": "2026-06-20T08:00:00Z"},
            {"id": "Rel-5", "version": "1.0.0", "project_id": "Proj-2", "created_at": "2026-07-10T11:30:00Z"}
        ],
        "Proj-3": [
            {"id": "Rel-20", "version": "2.0.1", "project_id": "Proj-3", "created_at": "2026-07-17T09:15:00Z"}
        ]
    }

    # Simulated latest-deployment-per-environment, mirroring Octopus's real dashboard "Items"
    # shape closely enough to demo progressive rollout (later envs left undeployed).
    _sim_octopus_dashboard_items = {
        "Proj-1": {"Env-1": ("Success", "1.3.0-rc1", "2026-07-15T16:55:00Z"), "Env-2": ("Success", "1.2.0", "2026-07-02T09:00:00Z")},
        "Proj-2": {"Env-1": ("Success", "1.0.0", "2026-07-10T11:45:00Z"), "Env-2": ("Success", "1.0.0", "2026-07-11T08:20:00Z"), "Env-3": ("Failed", "0.9.5", "2026-06-21T10:00:00Z")},
        "Proj-3": {"Env-1": ("Success", "2.0.1", "2026-07-17T09:30:00Z")},
    }

    _sim_deployments = []

    # project_id -> environment_id -> (version, completed_time) for deploys triggered via the
    # simulated "Deploy..." button, layered on top of the static fixtures above so the Projects
    # overview and Project Dashboard reflect a deploy the user just triggered.
    _sim_manual_deployments: Dict[str, Dict[str, tuple]] = {}

    def __init__(self):
        self.jenkins_client = JenkinsClient()
        self.octopus_client = OctopusClient()

    async def get_dashboard(self) -> Dict[str, Any]:
        start_time = time.perf_counter()
        
        # Pull live if configured
        live_jobs = []
        if settings.jenkins_configured:
            status_code, data, error, duration = await self.jenkins_client.get_jobs_and_builds()
            if status_code == 200 and "jobs" in data:
                for job in data["jobs"]:
                    color = job.get("color", "blue")
                    status = "SUCCESS"
                    if "anime" in color:
                        status = "BUILDING"
                    elif "red" in color:
                        status = "FAILURE"
                    elif "disabled" in color or "aborted" in color:
                        status = "IDLE"
                    
                    last_build = job.get("lastBuild")
                    live_jobs.append({
                        "name": job["name"],
                        "status": status,
                        "last_build_number": last_build["number"] if last_build else None,
                        "last_build_time": datetime.fromtimestamp(last_build["timestamp"]/1000).isoformat() if last_build else None,
                        "in_queue": job.get("inQueue", False)
                    })

        # Base DevOps details
        jobs = live_jobs if live_jobs else self._sim_jenkins_jobs
        running_builds = len([j for j in jobs if j["status"] == "BUILDING"])
        failed_builds = len([j for j in jobs if j["status"] == "FAILURE"])
        queue_count = len([j for j in jobs if j["in_queue"]])

        duration = (time.perf_counter() - start_time) * 1000
        
        dashboard_data = {
            "jenkins_jobs": jobs,
            "octopus_projects": self._sim_octopus_projects,
            "octopus_environments": self._sim_octopus_environments,
            "running_builds_count": running_builds,
            "failed_builds_count": failed_builds,
            "queue_count": queue_count
        }
        
        log_api_call("devops", "/dashboard", "GET", duration, 200, None, dashboard_data, is_simulated=not settings.jenkins_configured)
        return dashboard_data

    _CONTAINER_CLASS_MARKERS = ("Folder", "MultiBranchProject", "OrganizationFolder")

    @staticmethod
    def _jenkins_status_from_color(color: Optional[str]) -> str:
        c = color or ""
        if "anime" in c:
            return "BUILDING"
        if c.startswith("red"):
            return "FAILURE"
        if c.startswith("yellow"):
            return "UNSTABLE"
        if c.startswith("aborted"):
            return "ABORTED"
        if c in ("disabled", "notbuilt", "grey", "gray"):
            return "IDLE"
        if c.startswith("blue") or c.startswith("green"):
            return "SUCCESS"
        return "UNKNOWN"

    async def get_jenkins_tree(self, path: Optional[str] = None) -> Dict[str, Any]:
        segments = [s for s in (path or "").split("/") if s]

        if not settings.jenkins_configured:
            # No token configured - simulated mode is a single flat "folder" of jobs, so any
            # nested path just falls back to the same fixture list.
            items = [
                {
                    "name": job["name"],
                    "url": "",
                    "is_folder": False,
                    "status": job["status"],
                    "last_build_number": job["last_build_number"],
                    "last_build_time": job["last_build_time"],
                    "in_queue": job["in_queue"],
                }
                for job in self._sim_jenkins_jobs
            ] if not segments else []
            return {"path": "/".join(segments), "breadcrumbs": segments, "items": items}

        status_code, data, error, duration = await self.jenkins_client.get_folder_items(segments)
        if status_code != 200 or not isinstance(data, dict):
            error_detail = error or (data.get("message") if isinstance(data, dict) else None) or f"Jenkins returned HTTP {status_code}"
            raise ValueError(error_detail)

        items = []
        for job in data.get("jobs", []):
            job_class = job.get("_class", "")
            is_folder = any(marker in job_class for marker in self._CONTAINER_CLASS_MARKERS)
            last_build = job.get("lastBuild")
            items.append({
                "name": job["name"],
                "url": job.get("url", ""),
                "is_folder": is_folder,
                "status": None if is_folder else self._jenkins_status_from_color(job.get("color")),
                "last_build_number": last_build["number"] if last_build else None,
                "last_build_time": datetime.fromtimestamp(last_build["timestamp"] / 1000, tz=timezone.utc).isoformat() if last_build else None,
                "in_queue": job.get("inQueue", False),
            })

        log_api_call("jenkins", f"/{'/'.join(segments)}/api/json", "GET", duration, 200, None, {"count": len(items)})
        return {"path": "/".join(segments), "breadcrumbs": segments, "items": items}

    async def restart_jenkins_build(self, job_name: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.jenkins_configured:
            status_code, data, error, duration = await self.jenkins_client.trigger_build(job_name)
            if status_code in (200, 201):
                return {"success": True, "source": "live", "data": data, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        job_found = False
        for job in self._sim_jenkins_jobs:
            if job["name"] == job_name:
                job["status"] = "BUILDING"
                job["last_build_number"] = (job["last_build_number"] or 0) + 1
                job["last_build_time"] = "Just now"
                job_found = True
                break

        if not job_found:
            return {"success": False, "source": "simulated", "error": f"Job {job_name} not found", "execution_time_ms": duration}

        res_data = {"status": "triggered", "job_name": job_name, "build_number": 99}
        log_api_call("jenkins", f"/job/{job_name}/build", "POST", duration, 201, None, res_data, is_simulated=True)
        return {"success": True, "source": "simulated", "data": res_data, "execution_time_ms": duration}

    async def get_octopus_releases(self, project_id: str) -> List[Dict[str, Any]]:
        if settings.octopus_configured:
            status_code, data, error, duration = await self.octopus_client.get_releases(project_id)
            if status_code == 200:
                # Real endpoint returns a paginated wrapper ({"Items": [...]}), not a bare
                # list - unwrap it so callers get the same shape as simulated mode.
                return data.get("Items", []) if isinstance(data, dict) else (data or [])

        return self._sim_octopus_releases.get(project_id, [])

    async def deploy_octopus_release(self, project_id: str, environment_id: str, release_version: str) -> Dict[str, Any]:
        start_time = time.perf_counter()
        if settings.octopus_configured:
            # Need release ID
            rel_code, rels, rel_err, rel_dur = await self.octopus_client.get_releases(project_id)
            release_id = None
            if rel_code == 200:
                # Octopus's real /releases endpoint returns a paginated wrapper
                # ({"Items": [...], "TotalResults": ...}), not a bare list.
                release_items = rels.get("Items", []) if isinstance(rels, dict) else (rels or [])
                for r in release_items:
                    if r["Version"] == release_version:
                        release_id = r["Id"]
                        break

            if not release_id:
                duration = (time.perf_counter() - start_time) * 1000
                return {"success": False, "source": "live", "error": f"Release {release_version} not found for project {project_id}", "execution_time_ms": duration}

            st_code, dep_data, dep_err, dep_dur = await self.octopus_client.create_deployment(project_id, environment_id, release_id)
            duration = dep_dur + rel_dur
            if st_code in (200, 201):
                return {"success": True, "source": "live", "data": dep_data, "execution_time_ms": duration}

            # Live Octopus rejected the deployment (e.g. 403 for a read-only API key) - surface the
            # real error instead of silently pretending it succeeded via the simulator below.
            error_detail = dep_err or (dep_data.get("ErrorMessage") if isinstance(dep_data, dict) else None) or f"Octopus returned HTTP {st_code}"
            return {"success": False, "source": "live", "error": error_detail, "execution_time_ms": duration}

        # Simulation Mode
        duration = (time.perf_counter() - start_time) * 1000
        proj_name = next((p["name"] for p in self._sim_octopus_projects if p["id"] == project_id), project_id)
        env_name = next((e["name"] for e in self._sim_octopus_environments if e["id"] == environment_id), environment_id)
        
        completed_at = datetime.now(timezone.utc).isoformat()
        self._sim_manual_deployments.setdefault(project_id, {})[environment_id] = (release_version, completed_at)

        deployment_id = f"Deploy-{random.randint(1000, 9999)}"
        dep_info = {
            "deployment_id": deployment_id,
            "project_name": proj_name,
            "environment_name": env_name,
            "release_version": release_version,
            "status": "In Progress",
            "progress_percent": 10,
            "started_at": "Just now"
        }
        self._sim_deployments.append(dep_info)
        
        log_api_call("octopus", "/api/deployments", "POST", duration, 201, {"ProjectId": project_id, "EnvironmentId": environment_id, "ReleaseVersion": release_version}, dep_info, is_simulated=True)
        return {"success": True, "source": "simulated", "data": dep_info, "execution_time_ms": duration}

    async def get_deployment_progress(self, deployment_id: str) -> Dict[str, Any]:
        # Return progress increments for UI polling simulations
        for dep in self._sim_deployments:
            if dep["deployment_id"] == deployment_id:
                if dep["progress_percent"] < 100:
                    dep["progress_percent"] += random.choice([20, 30, 40])
                    if dep["progress_percent"] >= 100:
                        dep["progress_percent"] = 100
                        dep["status"] = "Success"
                return dep
        return {"deployment_id": deployment_id, "status": "Success", "progress_percent": 100}

    # ------------------------------------------------------------------
    # Octopus - Projects overview (project groups x environments grid)
    # ------------------------------------------------------------------
    async def get_octopus_projects_overview(self) -> OctopusProjectsOverviewResponse:
        if settings.octopus_configured:
            status_code, data, error, duration = await self.octopus_client.get_dashboard()
            if status_code == 200 and data:
                return self._build_projects_overview_from_dashboard(data)

        return self._build_simulated_projects_overview()

    def _build_projects_overview_from_dashboard(self, data: Dict[str, Any]) -> OctopusProjectsOverviewResponse:
        env_lookup = {e["Id"]: e["Name"] for e in data.get("Environments", [])}
        env_order = [e["Id"] for e in data.get("Environments", [])]
        group_lookup = {g["Id"]: g["Name"] for g in data.get("ProjectGroups", [])}

        # Only the most recent (IsCurrent) deployment per project+environment matters for this grid.
        latest_by_project: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for item in data.get("Items", []):
            if not item.get("IsCurrent"):
                continue
            latest_by_project.setdefault(item["ProjectId"], {})[item["EnvironmentId"]] = item

        groups_out: Dict[str, OctopusProjectGroupSection] = {}
        group_env_ids: Dict[str, List[str]] = {}

        for project in data.get("Projects", []):
            group_id = project.get("ProjectGroupId")
            if group_id not in groups_out:
                groups_out[group_id] = OctopusProjectGroupSection(
                    id=group_id,
                    name=group_lookup.get(group_id, group_id),
                    environment_ids=[],
                    projects=[],
                )
                group_env_ids[group_id] = []

            deployments = latest_by_project.get(project["Id"], {})
            env_cells: Dict[str, Optional[OctopusDeploymentCell]] = {}
            for env_id, item in deployments.items():
                env_cells[env_id] = OctopusDeploymentCell(
                    state=item.get("State"),
                    version=item.get("ReleaseVersion"),
                    completed_time=item.get("CompletedTime"),
                    is_current=True,
                )
                if env_id not in group_env_ids[group_id]:
                    group_env_ids[group_id].append(env_id)

            groups_out[group_id].projects.append(OctopusProjectRow(
                id=project["Id"],
                name=project["Name"],
                project_group_id=group_id,
                environments=env_cells,
            ))

        # Order each group's columns by the canonical environment order Octopus returns.
        for group_id, section in groups_out.items():
            section.environment_ids = [eid for eid in env_order if eid in group_env_ids[group_id]]

        environments_list = [OctopusEnvironmentInfo(id=eid, name=env_lookup[eid]) for eid in env_order]

        return OctopusProjectsOverviewResponse(
            project_groups=list(groups_out.values()),
            environments=environments_list,
        )

    def _build_simulated_projects_overview(self) -> OctopusProjectsOverviewResponse:
        groups: Dict[str, OctopusProjectGroupSection] = {
            g["id"]: OctopusProjectGroupSection(id=g["id"], name=g["name"], environment_ids=[], projects=[])
            for g in self._sim_octopus_project_groups
        }
        group_env_ids: Dict[str, List[str]] = {g["id"]: [] for g in self._sim_octopus_project_groups}

        for project in self._sim_octopus_projects:
            group_id = project["project_group_id"]
            deployments = dict(self._sim_octopus_dashboard_items.get(project["id"], {}))
            # Layer in anything deployed via the simulated "Deploy..." button so the grid reflects it.
            for env_id, (version, completed_time) in self._sim_manual_deployments.get(project["id"], {}).items():
                deployments[env_id] = ("Success", version, completed_time)

            env_cells: Dict[str, Optional[OctopusDeploymentCell]] = {}
            for env_id, (state, version, completed_time) in deployments.items():
                env_cells[env_id] = OctopusDeploymentCell(state=state, version=version, completed_time=completed_time, is_current=True)
                if env_id not in group_env_ids[group_id]:
                    group_env_ids[group_id].append(env_id)

            groups[group_id].projects.append(OctopusProjectRow(
                id=project["id"],
                name=project["name"],
                project_group_id=group_id,
                environments=env_cells,
            ))

        env_order = [e["id"] for e in self._sim_octopus_environments]
        for group_id, section in groups.items():
            section.environment_ids = [eid for eid in env_order if eid in group_env_ids[group_id]]

        environments_list = [OctopusEnvironmentInfo(id=e["id"], name=e["name"], status=e["status"]) for e in self._sim_octopus_environments]

        return OctopusProjectsOverviewResponse(project_groups=list(groups.values()), environments=environments_list)

    # ------------------------------------------------------------------
    # Octopus - Project Dashboard (releases x environments matrix)
    # ------------------------------------------------------------------
    async def get_octopus_project_dashboard(self, project_id: str) -> OctopusProjectDashboardResponse:
        if settings.octopus_configured:
            # Run both live calls concurrently - each independently retries with backoff against
            # the remote Octopus server, so running them sequentially can double worst-case latency
            # (and risk tripping the frontend's request timeout) when credentials are misconfigured.
            (status_code, data, error, duration), (name_code, name_data, _, _) = await asyncio.gather(
                self.octopus_client.get_progression(project_id),
                self.octopus_client.get_project(project_id),
            )
            if status_code == 200 and data:
                project_name = name_data.get("Name", project_id) if name_code == 200 and name_data else project_id
                return self._build_project_dashboard_from_progression(project_id, project_name, data)

        return self._build_simulated_project_dashboard(project_id)

    def _build_project_dashboard_from_progression(self, project_id: str, project_name: str, data: Dict[str, Any]) -> OctopusProjectDashboardResponse:
        environments = [OctopusEnvironmentInfo(id=e["Id"], name=e["Name"]) for e in data.get("Environments", [])]

        releases_out: List[OctopusReleaseRow] = []
        for entry in data.get("Releases", []):
            release = entry.get("Release", {})
            deployments_by_env = entry.get("Deployments", {})
            env_cells: Dict[str, Optional[OctopusDeploymentCell]] = {}
            for env in environments:
                deployments = deployments_by_env.get(env.id) or []
                if not deployments:
                    env_cells[env.id] = None
                    continue
                latest = deployments[0]
                env_cells[env.id] = OctopusDeploymentCell(
                    state=latest.get("State"),
                    version=latest.get("ReleaseVersion"),
                    completed_time=latest.get("CompletedTime"),
                    is_current=latest.get("IsCurrent", False),
                )

            releases_out.append(OctopusReleaseRow(
                id=release.get("Id", ""),
                version=release.get("Version", ""),
                channel_id=release.get("ChannelId"),
                assembled=release.get("Assembled"),
                environments=env_cells,
            ))

        return OctopusProjectDashboardResponse(
            project_id=project_id,
            project_name=project_name,
            environments=environments,
            releases=releases_out,
        )

    def _build_simulated_project_dashboard(self, project_id: str) -> OctopusProjectDashboardResponse:
        proj_name = next((p["name"] for p in self._sim_octopus_projects if p["id"] == project_id), project_id)
        environments = [OctopusEnvironmentInfo(id=e["id"], name=e["name"], status=e["status"]) for e in self._sim_octopus_environments]
        sim_releases = self._sim_octopus_releases.get(project_id, [])

        manual_deployments = self._sim_manual_deployments.get(project_id, {})

        releases_out: List[OctopusReleaseRow] = []
        # Simulate a progressive rollout: the newest release has only reached the earliest
        # environments; older releases have had time to reach further down the pipeline.
        for idx, rel in enumerate(reversed(sim_releases)):
            reached = min(len(environments), idx + 1)
            env_cells: Dict[str, Optional[OctopusDeploymentCell]] = {}
            for i, env in enumerate(environments):
                manual = manual_deployments.get(env.id)
                if manual and manual[0] == rel["version"]:
                    # Layer in anything deployed via the simulated "Deploy..." button for this release.
                    env_cells[env.id] = OctopusDeploymentCell(
                        state="Success",
                        version=manual[0],
                        completed_time=manual[1],
                        is_current=(idx == 0),
                    )
                elif i < reached:
                    env_cells[env.id] = OctopusDeploymentCell(
                        state="Success",
                        version=rel["version"],
                        completed_time=rel["created_at"],
                        is_current=(idx == 0),
                    )
                else:
                    env_cells[env.id] = None

            releases_out.append(OctopusReleaseRow(
                id=rel["id"],
                version=rel["version"],
                channel_id=None,
                assembled=rel["created_at"],
                environments=env_cells,
            ))

        return OctopusProjectDashboardResponse(
            project_id=project_id,
            project_name=proj_name,
            environments=environments,
            releases=releases_out,
        )

    # ------------------------------------------------------------------
    # Octopus - lightweight id -> name/group resolver for starred-project chips.
    # Deliberately avoids the full-space /dashboard payload (get_octopus_projects_overview)
    # since this only ever needs to resolve a handful of starred IDs, not the whole space.
    # ------------------------------------------------------------------
    async def resolve_octopus_projects(self, project_ids: List[str]) -> List[OctopusProjectResolveItem]:
        if not project_ids:
            return []

        if settings.octopus_configured:
            project_results = await asyncio.gather(*[self.octopus_client.get_project(pid) for pid in project_ids])

            group_ids = list({
                data.get("ProjectGroupId")
                for status_code, data, _, _ in project_results
                if status_code == 200 and data and data.get("ProjectGroupId")
            })
            group_results = await asyncio.gather(*[self.octopus_client.get_project_group(gid) for gid in group_ids])
            group_name_by_id = {
                gid: (data.get("Name", gid) if status_code == 200 and data else gid)
                for gid, (status_code, data, _, _) in zip(group_ids, group_results)
            }

            resolved: List[OctopusProjectResolveItem] = []
            for pid, (status_code, data, _, _) in zip(project_ids, project_results):
                if status_code == 200 and data:
                    resolved.append(OctopusProjectResolveItem(
                        id=pid,
                        name=data.get("Name", pid),
                        group_name=group_name_by_id.get(data.get("ProjectGroupId"), ""),
                    ))
            return resolved

        # Simulation Mode
        group_name_by_id = {g["id"]: g["name"] for g in self._sim_octopus_project_groups}
        project_by_id = {p["id"]: p for p in self._sim_octopus_projects}
        resolved = []
        for pid in project_ids:
            project = project_by_id.get(pid)
            if project:
                resolved.append(OctopusProjectResolveItem(
                    id=pid,
                    name=project["name"],
                    group_name=group_name_by_id.get(project["project_group_id"], ""),
                ))
        return resolved
