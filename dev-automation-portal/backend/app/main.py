import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.router import router as api_router
from app.core.logging import logger
from app.core.scheduler import scheduler
from app.services.tag_watcher_service import TagWatcherService
from app.services.tag_promotion_service import TagPromotionService

# Initialize database tables
try:
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize database: {e}")

app = FastAPI(
    title="Developer Automation Platform API",
    description="Backend services and simulated execution layer for day-to-day work productivity.",
    version="1.0.0"
)

# CORS Configuration
# Allow local development origins
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include main api router
app.include_router(api_router)

@app.on_event("startup")
async def _start_scheduler():
    scheduler.start()
    resumed = await TagWatcherService().resume_active_watchers()
    if resumed:
        logger.info(f"Resumed {resumed} in-progress tag watcher(s) after restart.")
    resumed_promotions = await TagPromotionService().resume_active_watchers()
    if resumed_promotions:
        logger.info(f"Resumed {resumed_promotions} in-progress tag promotion watcher(s) after restart.")


@app.on_event("shutdown")
async def _stop_scheduler():
    scheduler.shutdown(wait=False)


@app.get("/")
async def root():
    return {
        "app": "Developer Automation Portal API",
        "status": "online",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True if settings.APP_ENV == "development" else False
    )
