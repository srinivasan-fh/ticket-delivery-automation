import os
import re
from typing import Dict, List, Optional

# Same path convention as the generic /settings endpoint in app/api/router.py.
_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")


def _read_env_lines() -> List[str]:
    if not os.path.exists(_ENV_PATH):
        return []
    with open(_ENV_PATH, "r") as f:
        return f.readlines()


def _parse_env(lines: List[str]) -> Dict[str, str]:
    env: Dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        env[key.strip()] = value.strip()
    return env


def get_numbered_contacts(prefix: str) -> List[Dict[str, str]]:
    """Scans the .env file for {prefix}_{N}_NAME / {prefix}_{N}_EMAIL pairs for any N -
    no fixed slot cap, so adding a new numbered pair (of any N) picks it up immediately
    on the next read, with no restart and no code change."""
    env = _parse_env(_read_env_lines())
    name_re = re.compile(rf"^{re.escape(prefix)}_(\d+)_NAME$")
    numbers = sorted({int(m.group(1)) for k in env if (m := name_re.match(k))})

    contacts = []
    for n in numbers:
        name = env.get(f"{prefix}_{n}_NAME", "").strip()
        email = env.get(f"{prefix}_{n}_EMAIL", "").strip()
        if name and email:
            contacts.append({"name": name, "email": email})
    return contacts


def get_single_contact(prefix: str) -> Optional[Dict[str, str]]:
    env = _parse_env(_read_env_lines())
    name = env.get(f"{prefix}_NAME", "").strip()
    email = env.get(f"{prefix}_EMAIL", "").strip()
    return {"name": name, "email": email} if name and email else None


def write_numbered_contacts(prefix: str, contacts: List[Dict[str, str]]) -> None:
    lines = _read_env_lines()
    pair_re = re.compile(rf"^{re.escape(prefix)}_\d+_(NAME|EMAIL)=")
    # Drop every existing numbered line for this prefix - the fresh list fully replaces it,
    # so add/remove/reorder all just work by re-numbering 1..N on write.
    kept = [line for line in lines if not pair_re.match(line.strip())]
    if kept and not kept[-1].endswith("\n"):
        kept[-1] += "\n"

    new_lines = []
    for i, contact in enumerate(contacts, start=1):
        new_lines.append(f"{prefix}_{i}_NAME={contact['name']}\n")
        new_lines.append(f"{prefix}_{i}_EMAIL={contact['email']}\n")

    with open(_ENV_PATH, "w") as f:
        f.writelines(kept + new_lines)


def write_single_contact(prefix: str, contact: Optional[Dict[str, str]]) -> None:
    lines = _read_env_lines()
    field_re = re.compile(rf"^{re.escape(prefix)}_(NAME|EMAIL)=")
    kept = [line for line in lines if not field_re.match(line.strip())]
    if kept and not kept[-1].endswith("\n"):
        kept[-1] += "\n"

    new_lines = []
    if contact and contact.get("name") and contact.get("email"):
        new_lines.append(f"{prefix}_NAME={contact['name']}\n")
        new_lines.append(f"{prefix}_EMAIL={contact['email']}\n")

    with open(_ENV_PATH, "w") as f:
        f.writelines(kept + new_lines)
