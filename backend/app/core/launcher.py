import json
import shlex
import subprocess
import threading
from typing import Dict, List, Optional


def build_shell_command(repo_path: str, claude_bin: str, args: List[str], prompt_file: str) -> str:
    # The prompt (which contains Jira text) never enters the shell string - it is read from
    # a file the portal wrote, so ticket content cannot inject shell commands.
    parts = " ".join(shlex.quote(p) for p in [claude_bin, *args])
    return f'cd {shlex.quote(repo_path)} && {parts} "$(cat {shlex.quote(prompt_file)})"'


def terminal_invocation(platform: str, command: str, terminal_cmd: Optional[str] = None) -> Optional[List[str]]:
    if terminal_cmd:
        return [command if part == "{cmd}" else part for part in terminal_cmd.split()]
    if platform == "darwin":
        escaped = command.replace("\\", "\\\\").replace('"', '\\"')
        return [
            "osascript",
            "-e", f'tell application "Terminal" to do script "{escaped}"',
            "-e", 'tell application "Terminal" to activate',
        ]
    if platform.startswith("linux"):
        return ["x-terminal-emulator", "-e", "bash", "-lc", command]
    return None


def launch_detached(argv: List[str]) -> None:
    subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def run_headless(claude_bin: str, args: List[str], prompt: str, cwd: str, out_file: str) -> threading.Thread:
    """`claude -p` in the background; stdout/stderr and the exit code land in out_file."""
    def _run() -> None:
        with open(out_file, "w", encoding="utf-8") as out:
            try:
                proc = subprocess.run([claude_bin, "-p", prompt, *args], cwd=cwd, stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT)
                out.write(f"\n\n---\nExited with code {proc.returncode}\n")
            except OSError as exc:
                out.write(f"\n\n---\nFailed to start: {exc}\n")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread


def first_line(text: str) -> str:
    return (text or "").strip().splitlines()[0] if (text or "").strip() else ""


def run_version(claude_bin: str) -> Dict[str, object]:
    try:
        proc = subprocess.run([claude_bin, "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "detail": str(exc)}
    if proc.returncode != 0:
        return {"ok": False, "detail": first_line(proc.stderr) or f"exit code {proc.returncode}"}
    return {"ok": True, "detail": first_line(proc.stdout)}


def run_claude_print(claude_bin: str, prompt: str, allowed_tools: List[str], cwd: str, timeout: int) -> Dict[str, object]:
    """`claude -p <prompt> --output-format json` restricted to allowed_tools. Returns the parsed
    result envelope ({"result": str, "is_error": bool, ...}) or raises RuntimeError."""
    argv = [claude_bin, "-p", prompt, "--output-format", "json", "--allowedTools", ",".join(allowed_tools)]
    try:
        proc = subprocess.run(argv, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Claude Code did not answer within {timeout}s")
    except OSError as exc:
        raise RuntimeError(f"Could not run Claude Code ({claude_bin}): {exc}")
    try:
        envelope = json.loads(proc.stdout)
    except ValueError:
        detail = first_line(proc.stderr) or first_line(proc.stdout) or f"exit code {proc.returncode}"
        raise RuntimeError(f"Claude Code failed: {detail}")
    if not isinstance(envelope, dict):
        raise RuntimeError("Claude Code returned an unexpected response")
    return envelope
