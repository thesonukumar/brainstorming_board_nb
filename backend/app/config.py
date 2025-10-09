import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

PORT = int(os.getenv("PORT", "8000"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB = os.getenv("MONGODB_DB", "brainstorm_board")

# SQLite database URL (SQLAlchemy). Example: sqlite:///./brainstorm.db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./brainstorm.db")

JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "43200"))
JWT_EXPIRE_DELTA = timedelta(minutes=JWT_EXPIRE_MINUTES)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
EMBEDDINGS_MODEL = os.getenv("EMBEDDINGS_MODEL", "text-embedding-004")
TEXT_MODEL = os.getenv("TEXT_MODEL", "gemini-1.5-flash")
