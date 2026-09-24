from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.executors.asyncio import AsyncIOExecutor

# AsyncIOScheduler runs job coroutines on the same event loop as uvicorn/FastAPI, so job
# functions can `await` the existing async clients directly with no cross-thread session issues.
scheduler = AsyncIOScheduler(
    executors={"default": AsyncIOExecutor()},
    job_defaults={
        "coalesce": True,
        "max_instances": 1,
        "misfire_grace_time": 30,
    },
)
