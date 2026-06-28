"""
backend/main.py
================
FastAPI application entry point.

Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket

from db.database import init_db, close_db
from engine.state_machine import engine
from api.routes.state import router as state_router
from api.routes.events import router as events_router
from api.websocket.ecg_stream import ecg_websocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await engine.start()
    yield
    # Shutdown
    await engine.stop()
    await close_db()


app = FastAPI(
    title="SimMan ECG Engine",
    description="Real-time mathematical ECG simulation engine for PSG IMSR",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── REST routes ──────────────────────────────────────────────────────────────
app.include_router(state_router,  prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")


# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws/ecg")
async def ws_ecg(websocket: WebSocket):
    await ecg_websocket(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "running"}
