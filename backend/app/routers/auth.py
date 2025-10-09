from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from ..schemas import SignupRequest, LoginRequest, TokenResponse
from ..security import hash_password, verify_password, create_access_token
from ..db import get_db
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory fallback if Mongo not configured
USERS_MEM: dict[str, dict] = {}

async def get_users_collection(db: AsyncIOMotorDatabase | None):
    if db is None:
        return None
    return db["users"]

async def try_get_db() -> AsyncIOMotorDatabase | None:
    try:
        return await get_db()
    except Exception:
        return None

@router.post("/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest):
    db = await try_get_db()
    users = await get_users_collection(db)

    if users is None:
        # In-memory
        if payload.email in USERS_MEM:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = "u_" + uuid.uuid4().hex[:12]
        USERS_MEM[payload.email] = {
            "id": user_id,
            "email": payload.email,
            "passwordHash": hash_password(payload.password),
        }
        token = create_access_token(user_id)
        return TokenResponse(token=token)

    # With Mongo
    existing = await users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = "u_" + uuid.uuid4().hex[:12]
    doc = {
        "id": user_id,
        "email": payload.email,
        "passwordHash": hash_password(payload.password),
    }
    await users.insert_one(doc)
    token = create_access_token(user_id)
    return TokenResponse(token=token)

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    db = await try_get_db()
    users = await get_users_collection(db)

    if users is None:
        user = USERS_MEM.get(payload.email)
        if not user or not verify_password(payload.password, user["passwordHash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        token = create_access_token(user["id"])  # sub is userId
        return TokenResponse(token=token)

    user = await users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.get("id") or user.get("_id"))
    return TokenResponse(token=token)
