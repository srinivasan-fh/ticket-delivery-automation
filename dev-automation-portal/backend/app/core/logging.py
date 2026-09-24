import json
import logging
from datetime import datetime
from typing import Any, Optional
from app.core.database import SessionLocal
from app.models.database_models import APILog

# Setup standard python logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dev_portal")

def log_api_call(
    service: str,
    endpoint: str,
    method: str,
    execution_time_ms: float,
    status_code: int,
    payload: Any = None,
    response_body: Any = None,
    error_message: Optional[str] = None,
    is_simulated: bool = False
):
    """
    Log an API call directly into the database for history and tracing.
    """
    # Serialize payloads
    payload_str = None
    if payload is not None:
        try:
            payload_str = json.dumps(payload) if not isinstance(payload, str) else payload
        except Exception:
            payload_str = str(payload)

    response_str = None
    if response_body is not None:
        try:
            response_str = json.dumps(response_body) if not isinstance(response_body, str) else response_body
        except Exception:
            response_str = str(response_body)

    db = SessionLocal()
    try:
        api_log = APILog(
            service=service,
            endpoint=endpoint,
            method=method,
            execution_time_ms=execution_time_ms,
            status_code=status_code,
            payload=payload_str,
            response_body=response_str,
            error_message=error_message,
            is_simulated=is_simulated,
            timestamp=datetime.utcnow()
        )
        db.add(api_log)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log API call to database: {e}")
    finally:
        db.close()
