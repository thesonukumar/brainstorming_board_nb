from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import CORS_ORIGINS
from .routers import auth, boards, ai
from .sql import init_db

app = FastAPI(title="Brainstorming Board API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup_db() -> None:
    # Auto-create tables for dev; safe for SQLite
    init_db()

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(auth.router)
app.include_router(boards.router)
app.include_router(ai.router)
