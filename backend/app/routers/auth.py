from fastapi import APIRouter, Depends, HTTPException, status
from ..schemas import SignupRequest, LoginRequest, TokenResponse
from ..security import hash_password, verify_password, create_access_token
from sqlalchemy.orm import Session
from ..sql import get_session, User
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest, session: Session = Depends(get_session)):
    existing = session.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = "u_" + uuid.uuid4().hex[:12]
    user = User(id=user_id, email=payload.email, passwordHash=hash_password(payload.password))
    session.add(user)
    session.commit()
    token = create_access_token(user_id)
    return TokenResponse(token=token)

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.passwordHash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.id)
    return TokenResponse(token=token)
