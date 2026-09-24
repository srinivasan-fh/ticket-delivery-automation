from pydantic import BaseModel, Field
from typing import Literal, Optional


class DeliveryCheckRequest(BaseModel):
    ticket_key: str = Field(..., examples=["RNMS-101"])
    stage: str = Field(..., examples=["develop"])
    item_id: str = Field(..., examples=["tests"])
    done: bool = True


class DeliveryAccessRequest(BaseModel):
    item_id: str = Field(..., examples=["cc-skill"])
    done: bool = True


class DeliveryStageRequest(BaseModel):
    # launch: open Claude Code in a terminal; run: background `claude -p` (Understand only);
    # prompt: only build the prompt and return the command to copy
    mode: Literal["launch", "run", "prompt"] = "launch"


class DeliveryStageResponse(BaseModel):
    command: str
    prompt_file: str
    launched: bool
    output_file: Optional[str] = None
