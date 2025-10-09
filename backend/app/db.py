from typing import Optional
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.server_api import ServerApi
from .config import MONGODB_URI, MONGODB_DB
import certifi

_client: Optional[MongoClient] = None
_db: Optional[Database] = None

async def get_db() -> Database:
  """Return a cached PyMongo Database. Async signature kept for compatibility."""
  global _client, _db
  if _db is None:
    if not MONGODB_URI:
      # In dev with no URI, use a placeholder that will fail clearly when accessed
      raise RuntimeError("MONGODB_URI not set. Provide an Atlas URI in backend/.env")
    # Provide CA bundle explicitly to avoid Windows cert store issues with Atlas
    # For mongodb+srv URIs, TLS is on by default; tlsCAFile ensures proper trust chain
    _client = MongoClient(
      MONGODB_URI,
      serverSelectionTimeoutMS=2000,
      server_api=ServerApi('1')
    )
    _db = _client[MONGODB_DB]
    # Verify connectivity before doing any operations that may hang
    _db.command("ping")
    # Ensure basic indexes (sync calls)
    _db["users"].create_index("email", unique=True)
    _db["columns"].create_index([("boardId", 1), ("position", 1)])
    _db["cards"].create_index([("boardId", 1), ("columnId", 1), ("position", 1)])
  return _db


