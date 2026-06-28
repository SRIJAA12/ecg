"""
backend/api/routes/state.py
==============================
REST endpoints for reading / writing ECG state (HTTP complement to WebSocket).
"""

from fastapi import APIRouter
from engine.state_machine import engine
from models.ecg_state import ECGStateUpdate

router = APIRouter(prefix="/state", tags=["state"])


@router.get("/")
async def get_state():
    return engine.state.model_dump()


@router.post("/")
async def set_state(update: ECGStateUpdate):
    await engine.apply_command(update)
    return engine.state.model_dump()
