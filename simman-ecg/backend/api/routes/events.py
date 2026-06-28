"""
backend/api/routes/events.py
==============================
REST endpoints for querying the MongoDB event log and HR trend.
"""

from fastapi import APIRouter, Query
from models.db_models import Event, HRTrend

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/")
async def list_events(session_id: str = Query("default"), limit: int = Query(100)):
    events = await Event.find({"session_id": session_id})\
                        .sort(-Event.occurred_at)\
                        .limit(limit)\
                        .to_list()
    return [e.model_dump() for e in events]


@router.get("/hr-trend")
async def hr_trend(session_id: str = Query("default"), limit: int = Query(60)):
    trend = await HRTrend.find({"session_id": session_id})\
                         .sort(-HRTrend.recorded_at)\
                         .limit(limit)\
                         .to_list()
    trend.reverse()
    return [{"t": t.recorded_at.isoformat(), "hr": t.heart_rate, "rhythm": t.rhythm} for t in trend]

