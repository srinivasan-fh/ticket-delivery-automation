from typing import Any, Dict, Optional

# repo full_name -> {"sit": {...}, "main": {...}}
# mode "increment": bump the numeric segment of the highest-versioned tag matching `filter`
# mode "last_merged_pr": use the latest merged PR number into the default branch, with `prefix`
TAG_CONVENTIONS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "uktech/BOB-CRM": {
        "sit": {"mode": "increment", "filter": "sit"},
        "main": {"mode": "last_merged_pr", "prefix": "0.0."},
    },
    "uktech/mytakeaway2.0": {
        "sit": {"mode": "increment", "filter": "sit"},
        "main": {"mode": "increment", "filter": "live"},
    },
}

DEFAULT_CONVENTION: Dict[str, Dict[str, Any]] = {
    "sit": {"mode": "increment", "filter": "sit"},
    "main": {"mode": "increment", "filter": None},  # None = "does not match the sit filter"
}


def get_convention(full_name: Optional[str], environment: str) -> Dict[str, Any]:
    repo_conventions = TAG_CONVENTIONS.get(full_name or "", DEFAULT_CONVENTION)
    return repo_conventions.get(environment, DEFAULT_CONVENTION[environment])
