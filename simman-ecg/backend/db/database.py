"""
backend/db/database.py
=======================
MongoDB Motor async client + Beanie ODM initialisation.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from models.db_models import Session, Event, HRTrend, StateSnapshot

MONGO_URI = "mongodb://localhost:27017/"
DB_NAME   = "imsr_srijaa"

_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    global _client
    _client = AsyncIOMotorClient(MONGO_URI)
    await init_beanie(
        database=_client[DB_NAME],
        document_models=[Session, Event, HRTrend, StateSnapshot],
    )
    print(f"[DB] Connected to MongoDB — database: {DB_NAME}")


async def close_db() -> None:
    if _client:
        _client.close()
        print("[DB] MongoDB connection closed.")
