from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from .config import MONGODB_URI, MONGODB_DB
import certifi

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None

async def get_db() -> AsyncIOMotorDatabase:
  global _client, _db
  if _db is None:
    if not MONGODB_URI:
      # In dev with no URI, use a placeholder that will fail clearly when accessed
      raise RuntimeError("MONGODB_URI not set. Provide an Atlas URI in backend/.env")
    # Provide CA bundle explicitly to avoid Windows cert store issues with Atlas
    # For mongodb+srv URIs, TLS is on by default; tlsCAFile ensures proper trust chain
    _client = AsyncIOMotorClient(MONGODB_URI, tlsCAFile=certifi.where())
    _db = _client[MONGODB_DB]
    # Ensure basic indexes
    await _db["users"].create_index("email", unique=True)
    await _db["columns"].create_index([("boardId", 1), ("position", 1)])
    await _db["cards"].create_index([("boardId", 1), ("columnId", 1), ("position", 1)])
  return _db
