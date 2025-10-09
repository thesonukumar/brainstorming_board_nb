from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# Auth
class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    token: str

# Board structures returned to frontend
class Column(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
    title: str
    position: int

class Card(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
    boardId: str
    columnId: str
    content: str
    position: int
    folderId: Optional[str] = None

class Folder(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
    name: str
    color: str

class Board(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(alias="_id")
    userId: str
    title: str
    columns: List[Column] = []
    cards: List[Card] = []
    folders: List[Folder] = []

class ReorderLocation(BaseModel):
    droppableId: str
    index: int

class ReorderRequest(BaseModel):
    draggableId: str
    source: ReorderLocation
    destination: ReorderLocation

# Cards & AI
class CreateCardRequest(BaseModel):
    columnId: str
    content: str

class SummaryResponse(BaseModel):
    summary: str

class SummarizeRequest(BaseModel):
    folderId: Optional[str] = None
