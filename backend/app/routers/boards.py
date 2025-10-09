from fastapi import APIRouter, Depends, HTTPException, status
from ..schemas import Board, ReorderRequest, CreateCardRequest
from ..deps import get_current_user
from typing import Dict, Any
import uuid
from sqlalchemy.orm import Session
from ..sql import get_session, Board as ORMBoard, Column as ORMColumn, Card as ORMCard, Folder as ORMFolder

router = APIRouter(prefix="/boards", tags=["boards"]) 

def board_to_dict(session: Session, board: ORMBoard) -> Dict[str, Any]:
    columns = (
        session.query(ORMColumn)
        .filter(ORMColumn.boardId == board.id)
        .order_by(ORMColumn.position.asc())
        .all()
    )
    cards = (
        session.query(ORMCard)
        .filter(ORMCard.boardId == board.id)
        .order_by(ORMCard.position.asc())
        .all()
    )
    folders = (
        session.query(ORMFolder)
        .filter(ORMFolder.boardId == board.id)
        .all()
    )
    return {
        "_id": board.id,
        "userId": board.userId,
        "title": board.title,
        "columns": [{"_id": c.id, "title": c.title, "position": c.position} for c in columns],
        "cards": [
            {
                "_id": c.id,
                "boardId": c.boardId,
                "columnId": c.columnId,
                "content": c.content,
                "position": c.position,
                **({"folderId": c.folderId} if c.folderId else {}),
            }
            for c in cards
        ],
        "folders": [{"_id": f.id, "name": f.name, "color": f.color} for f in folders],
    }

def ensure_user_board(session: Session, user_id: str) -> ORMBoard:
    board_id = f"board_{user_id}"
    board = session.query(ORMBoard).filter(ORMBoard.id == board_id).first()
    if not board:
        board = ORMBoard(id=board_id, userId=user_id, title="My Brainstorm Board")
        session.add(board)
        # Create default Ideas column
        session.flush()
        col = ORMColumn(id="col_ideas", boardId=board.id, title="Ideas", position=0)
        session.add(col)
        session.commit()
    # Ensure there is exactly one Ideas column and migrate cards if needed is not necessary in fresh SQL schema
    return board

@router.get("/me", response_model=Board, response_model_by_alias=True)
async def get_my_board(user=Depends(get_current_user), session: Session = Depends(get_session)):
    board = ensure_user_board(session, user["userId"])  # type: ignore
    return board_to_dict(session, board)

@router.post("/{boardId}/reorder")
async def reorder(boardId: str, payload: ReorderRequest, user=Depends(get_current_user), session: Session = Depends(get_session)):
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    card = session.query(ORMCard).filter(ORMCard.id == payload.draggableId, ORMCard.boardId == boardId).first()
    if not card:
        return {"status": "error", "detail": "Card not found"}
    src_col = payload.source.droppableId
    dst_col = payload.destination.droppableId
    if card.columnId != dst_col:
        card.columnId = dst_col
    # Reorder within affected columns
    def reindex(col_id: str):
        col_cards = (
            session.query(ORMCard)
            .filter(ORMCard.boardId == boardId, ORMCard.columnId == col_id)
            .order_by(ORMCard.position.asc())
            .all()
        )
        # For destination, insert the dragged card at index
        if col_id == dst_col:
            col_cards = [c for c in col_cards if c.id != card.id]
            col_cards.insert(payload.destination.index, card)
        for i, c in enumerate(col_cards):
            c.position = i
    reindex(src_col)
    if dst_col != src_col:
        reindex(dst_col)
    session.commit()
    return {"status": "ok"}

# --- Folder update/delete ---
@router.patch("/{boardId}/folders/{folderId}")
async def update_folder(boardId: str, folderId: str, payload: dict, user=Depends(get_current_user), session: Session = Depends(get_session)):
    name = payload.get("name")
    color = payload.get("color")
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    folder = session.query(ORMFolder).filter(ORMFolder.id == folderId, ORMFolder.boardId == boardId).first()
    if not folder:
        return {"status": "error", "detail": "Folder not found"}
    if name is not None:
        folder.name = name
    if color is not None:
        folder.color = color
    session.commit()
    return {"status": "ok"}

@router.delete("/{boardId}/folders/{folderId}")
async def delete_folder(boardId: str, folderId: str, user=Depends(get_current_user), session: Session = Depends(get_session)):
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    # Unset folderId from cards, then delete folder
    session.query(ORMCard).filter(ORMCard.boardId == boardId, ORMCard.folderId == folderId).update({ORMCard.folderId: None})
    deleted = session.query(ORMFolder).filter(ORMFolder.id == folderId, ORMFolder.boardId == boardId).delete()
    session.commit()
    if not deleted:
        return {"status": "error", "detail": "Folder not found"}
    return {"status": "ok"}

# --- Card update/delete ---
@router.patch("/{boardId}/cards/{cardId}")
async def update_card(boardId: str, cardId: str, payload: dict, user=Depends(get_current_user), session: Session = Depends(get_session)):
    content = payload.get("content")
    folderId = payload.get("folderId") if "folderId" in payload else None
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    card = session.query(ORMCard).filter(ORMCard.id == cardId, ORMCard.boardId == boardId).first()
    if not card:
        return {"status": "error", "detail": "Card not found"}
    if content is not None:
        card.content = content
    if "folderId" in payload:
        card.folderId = folderId if folderId else None
    session.commit()
    return {"status": "ok"}

@router.delete("/{boardId}/cards/{cardId}")
async def delete_card(boardId: str, cardId: str, user=Depends(get_current_user), session: Session = Depends(get_session)):
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    deleted = session.query(ORMCard).filter(ORMCard.id == cardId, ORMCard.boardId == boardId).delete()
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    session.commit()
    return {"status": "ok"}

@router.post("/{boardId}/cards")
async def create_card(boardId: str, payload: CreateCardRequest, user=Depends(get_current_user), session: Session = Depends(get_session)):
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    # Next position within the given column
    max_pos = session.query(ORMCard).filter(ORMCard.boardId == boardId, ORMCard.columnId == payload.columnId).order_by(ORMCard.position.desc()).first()
    next_pos = (max_pos.position + 1) if max_pos else 0
    new_id = "card_" + uuid.uuid4().hex[:8]
    new_card = ORMCard(id=new_id, boardId=boardId, columnId=payload.columnId, content=payload.content, position=next_pos)
    session.add(new_card)
    session.commit()
    return {"status": "ok", "card": {"_id": new_card.id, "boardId": new_card.boardId, "columnId": new_card.columnId, "content": new_card.content, "position": new_card.position}}

@router.post("/{boardId}/folders")
async def create_folder(boardId: str, payload: dict, user=Depends(get_current_user), session: Session = Depends(get_session)):
    name = payload.get("name") or "Folder"
    color = payload.get("color") or "#8b5cf6"
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    new_id = "fld_" + uuid.uuid4().hex[:6]
    folder = ORMFolder(id=new_id, boardId=boardId, name=name, color=color)
    session.add(folder)
    session.commit()
    return {"status": "ok", "folder": {"_id": folder.id, "name": folder.name, "color": folder.color}}

@router.post("/{boardId}/folders/{folderId}/assign")
async def assign_cards_to_folder(boardId: str, folderId: str, payload: dict, user=Depends(get_current_user), session: Session = Depends(get_session)):
    card_ids = payload.get("cardIds", [])
    board = session.query(ORMBoard).filter(ORMBoard.id == boardId, ORMBoard.userId == user["userId"]).first()  # type: ignore
    if not board:
        return {"status": "error", "detail": "Board not found"}
    cards = (
        session.query(ORMCard)
        .filter(ORMCard.boardId == boardId, ORMCard.id.in_(card_ids))
        .all()
    )
    for c in cards:
        c.folderId = folderId
    session.commit()
    return {"status": "ok"}
