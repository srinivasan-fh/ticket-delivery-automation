from typing import Any, Dict, List, Optional, Tuple
from app.core.config import settings
from app.clients.base_client import BaseAPIClient

class GithubClient(BaseAPIClient):
    def __init__(self):
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if settings.GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

        super().__init__(
            service_name="github",
            base_url="https://api.github.com",
            default_headers=headers
        )

    async def get_pull_request(self, owner: str, repo: str, pr_number: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/pulls/{pr_number}")

    async def get_pull_request_files(self, owner: str, repo: str, pr_number: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/pulls/{pr_number}/files")

    async def approve_pull_request(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        comment: str,
        event: str = "APPROVE",
        commit_id: Optional[str] = None,
        comments: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[int, Any, Optional[str], float]:
        payload: Dict[str, Any] = {
            "body": comment,
            "event": event
        }
        if commit_id:
            payload["commit_id"] = commit_id
        if comments:
            payload["comments"] = comments
        return await self.post(f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews", json_data=payload)

    async def list_user_repos(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/user/repos", params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"})

    async def get_authenticated_user(self) -> Tuple[int, Any, Optional[str], float]:
        return await self.get("/user")

    async def list_branches_page(self, owner: str, repo: str, page: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/branches", params={"per_page": 100, "page": page})

    async def get_branch_ref(self, owner: str, repo: str, branch: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/git/ref/heads/{branch}")

    async def create_branch(self, owner: str, repo: str, branch_name: str, sha: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "ref": f"refs/heads/{branch_name}",
            "sha": sha
        }
        return await self.post(f"/repos/{owner}/{repo}/git/refs", json_data=payload)

    async def create_tag_object(self, owner: str, repo: str, tag: str, sha: str, message: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "tag": tag,
            "message": message,
            "object": sha,
            "type": "commit"
        }
        return await self.post(f"/repos/{owner}/{repo}/git/tags", json_data=payload)

    async def create_ref(self, owner: str, repo: str, ref: str, sha: str) -> Tuple[int, Any, Optional[str], float]:
        payload = {
            "ref": ref,
            "sha": sha
        }
        return await self.post(f"/repos/{owner}/{repo}/git/refs", json_data=payload)

    async def compare_tags(self, owner: str, repo: str, base: str, head: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/compare/{base}...{head}")

    async def generate_release_notes(
        self, owner: str, repo: str, tag_name: str,
        target_commitish: Optional[str] = None, previous_tag_name: Optional[str] = None
    ) -> Tuple[int, Any, Optional[str], float]:
        # Same endpoint GitHub's own "Generate release notes" button calls - drafts a
        # categorized Markdown body from merged PRs/contributors since the previous tag.
        payload: Dict[str, Any] = {"tag_name": tag_name}
        if target_commitish:
            payload["target_commitish"] = target_commitish
        if previous_tag_name:
            payload["previous_tag_name"] = previous_tag_name
        return await self.post(f"/repos/{owner}/{repo}/releases/generate-notes", json_data=payload)

    async def create_release(
        self, owner: str, repo: str, tag_name: str, name: str, body: str, target_commitish: Optional[str] = None
    ) -> Tuple[int, Any, Optional[str], float]:
        payload: Dict[str, Any] = {"tag_name": tag_name, "name": name, "body": body}
        if target_commitish:
            payload["target_commitish"] = target_commitish
        return await self.post(f"/repos/{owner}/{repo}/releases", json_data=payload)

    async def list_repo_tags_page(self, owner: str, repo: str, page: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/tags", params={"per_page": 100, "page": page})

    async def list_pull_requests(self, owner: str, repo: str, state: str = "closed", base: Optional[str] = None) -> Tuple[int, Any, Optional[str], float]:
        params: Dict[str, Any] = {"state": state, "per_page": 50, "sort": "updated", "direction": "desc"}
        if base:
            params["base"] = base
        return await self.get(f"/repos/{owner}/{repo}/pulls", params=params)

    async def get_pull_request_reviews(self, owner: str, repo: str, pr_number: int) -> Tuple[int, Any, Optional[str], float]:
        return await self.get(f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews", params={"per_page": 50})

    async def merge_pull_request(self, owner: str, repo: str, pr_number: int, merge_method: str = "merge") -> Tuple[int, Any, Optional[str], float]:
        return await self.put(f"/repos/{owner}/{repo}/pulls/{pr_number}/merge", json_data={"merge_method": merge_method})

    async def delete_branch(self, owner: str, repo: str, branch: str) -> Tuple[int, Any, Optional[str], float]:
        return await self.delete(f"/repos/{owner}/{repo}/git/refs/heads/{branch}")
