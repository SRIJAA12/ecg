"""
backend/models/db_models.py
============================
Beanie ODM document models for MongoDB (database: imsr_srijaa).
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any
from beanie import Document, Indexed
from pydantic import Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Session(Document):
    """One simulation session — instructor presses Start → Stop."""
    name:       str             = "Unnamed Session"
    started_at: datetime        = Field(default_factory=_now)
    ended_at:   datetime | None = None
    metadata:   dict            = {}

    class Settings:
        name = "sessions"


class Event(Document):
    """
    Append-only audit log.
    event_type: RHYTHM_CHANGE | HR_CHANGE | STEMI_ON | STEMI_OFF |
                TRANSFER_START | TRANSFER_COMPLETE | ALARM | SESSION_START | SESSION_END
    """
    session_id:  Indexed(str)
    occurred_at: datetime = Field(default_factory=_now)
    event_type:  str
    old_value:   Any = None
    new_value:   Any = None
    instructor:  str = "system"

    class Settings:
        name = "events"


class HRTrend(Document):
    """Heart rate sampled every second for trend chart."""
    session_id:  Indexed(str)
    recorded_at: datetime = Field(default_factory=_now)
    heart_rate:  float
    rhythm:      str

    class Settings:
        name = "hr_trend"


class StateSnapshot(Document):
    """Full ECG state snapshot saved every 30 seconds."""
    session_id:      Indexed(str)
    snapshotted_at:  datetime = Field(default_factory=_now)
    ecg_state:       dict     = {}

    class Settings:
        name = "state_snapshots"
