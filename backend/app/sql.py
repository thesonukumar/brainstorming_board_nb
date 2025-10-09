from __future__ import annotations
from contextlib import contextmanager
from typing import Generator, Optional
from sqlalchemy import create_engine, String, Integer, ForeignKey, Text, ForeignKeyConstraint, PrimaryKeyConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session
import os
from .config import DATABASE_URL


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    passwordHash: Mapped[str] = mapped_column(String(255))
    boards: Mapped[list[Board]] = relationship(back_populates="user", cascade="all, delete-orphan")  # type: ignore[name-defined]


class Board(Base):
    __tablename__ = "boards"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    userId: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="My Brainstorm Board")

    user: Mapped[User] = relationship(back_populates="boards")
    columns: Mapped[list[Column]] = relationship(back_populates="board", cascade="all, delete-orphan")  # type: ignore[name-defined]
    cards: Mapped[list[Card]] = relationship(back_populates="board", cascade="all, delete-orphan")  # type: ignore[name-defined]
    folders: Mapped[list[Folder]] = relationship(back_populates="board", cascade="all, delete-orphan")  # type: ignore[name-defined]


class Column(Base):
    __tablename__ = "columns"
    id: Mapped[str] = mapped_column(String(64))
    boardId: Mapped[str] = mapped_column(String(64), ForeignKey("boards.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        PrimaryKeyConstraint("id", "boardId"),
    )

    board: Mapped[Board] = relationship(back_populates="columns")


class Folder(Base):
    __tablename__ = "folders"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    boardId: Mapped[str] = mapped_column(String(64), ForeignKey("boards.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    color: Mapped[str] = mapped_column(String(16), default="#8b5cf6")

    board: Mapped[Board] = relationship(back_populates="folders")


class Card(Base):
    __tablename__ = "cards"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    boardId: Mapped[str] = mapped_column(String(64), ForeignKey("boards.id", ondelete="CASCADE"), index=True)
    columnId: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    folderId: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(["boardId", "columnId"], ["columns.boardId", "columns.id"], ondelete="CASCADE"),
    )

    board: Mapped[Board] = relationship(back_populates="cards")


# Engine and Session
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
