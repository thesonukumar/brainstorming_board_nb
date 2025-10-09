from fastapi import APIRouter, Depends
from ..schemas import Board, ReorderRequest, CreateCardRequest
from ..deps import get_current_user
from typing import Dict, Any
import uuid
from ..db import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/boards", tags=["boards"]) 

# In-memory default board per user when DB not configured
BOARDS_MEM: Dict[str, Dict[str, Any]] = {}

def default_board_for(user_id: str) -> Dict[str, Any]:
    if user_id not in BOARDS_MEM:
        board_id = "board_" + user_id
        columns = [
            {"_id": "col_todo", "title": "To Do", "position": 0},
            {"_id": "col_doing", "title": "Doing", "position": 1},
            {"_id": "col_done", "title": "Done", "position": 2},
        ]
        BOARDS_MEM[user_id] = {
            "_id": board_id,
            "userId": user_id,
            "title": "My Brainstorm Board",
            "columns": columns,
            "cards": [],
            "folders": [],
        }
    return BOARDS_MEM[user_id]

async def try_get_db() -> AsyncIOMotorDatabase | None:
    try:
        return await get_db()
    except Exception:
        return None

async def get_or_create_board_db(db: AsyncIOMotorDatabase, user_id: str) -> Dict[str, Any]:
    boards = db["boards"]
    board_id = f"board_{user_id}"
    doc = await boards.find_one({"_id": board_id})
    if not doc:
        doc = {
            "_id": board_id,
            "userId": user_id,
            "title": "My Brainstorm Board",
            "columns": [
                {"_id": "col_todo", "title": "To Do", "position": 0},
                {"_id": "col_doing", "title": "Doing", "position": 1},
                {"_id": "col_done", "title": "Done", "position": 2},
            ],
            "cards": [],
            "folders": [],
        }
        await boards.insert_one(doc)
    return doc

@router.get("/me", response_model=Board, response_model_by_alias=True)
async def get_my_board(user=Depends(get_current_user)):
    # Prefer Mongo if configured
    db = await try_get_db()
    if db is not None:
        doc = await get_or_create_board_db(db, user["userId"])  # type: ignore
        return doc
    # Fallback to in-memory
    return default_board_for(user["userId"])  # type: ignore

@router.post("/{boardId}/reorder")
async def reorder(boardId: str, payload: ReorderRequest, user=Depends(get_current_user)):
    db = await try_get_db()
    if db is not None:
        boards = db["boards"]
        doc = await boards.find_one({"_id": boardId, "userId": user["userId"]})
        if not doc:
            return {"status": "error", "detail": "Board not found"}
        cards = doc.get("cards", [])
        # find the card and update its columnId if moved
        card = next((c for c in cards if c.get("_id") == payload.draggableId), None)
        if not card:
            return {"status": "error", "detail": "Card not found"}
        src_col = payload.source.droppableId
        dst_col = payload.destination.droppableId
        if card.get("columnId") != dst_col:
            card["columnId"] = dst_col
        # recompute positions within both affected columns
        def sort_and_reindex(col_id: str):
            col_cards = [c for c in cards if c.get("columnId") == col_id]
            # place dragged card at destination index if this is dst col
            if col_id == dst_col:
                # remove if exists to avoid duplication
                col_cards = [c for c in col_cards if c.get("_id") != payload.draggableId]
                col_cards.insert(payload.destination.index, card)
            # simple reindex
            for i, c in enumerate(sorted(col_cards, key=lambda x: x.get("position", 0))):
                c["position"] = i
        sort_and_reindex(src_col)
        if dst_col != src_col:
            sort_and_reindex(dst_col)
        await boards.update_one({"_id": boardId}, {"$set": {"cards": cards}})
        return {"status": "ok"}
    # In-memory fallback
    board = default_board_for(user["userId"])  # type: ignore
    cards = board["cards"]
    card = next((c for c in cards if c["_id"] == payload.draggableId), None)
    if not card:
        return {"status": "error", "detail": "Card not found"}
    src_col = payload.source.droppableId
    dst_col = payload.destination.droppableId
    if card["columnId"] != dst_col:
        card["columnId"] = dst_col
    def sort_and_reindex(col_id: str):
        col_cards = [c for c in cards if c["columnId"] == col_id and c["_id"] != card["_id"]]
        if col_id == dst_col:
            col_cards.insert(payload.destination.index, card)
        for i, c in enumerate(col_cards):
            c["position"] = i
    sort_and_reindex(src_col)
    if dst_col != src_col:
        sort_and_reindex(dst_col)
    return {"status": "ok"}

@router.post("/{boardId}/cards")
async def create_card(boardId: str, payload: CreateCardRequest, user=Depends(get_current_user)):
    db = await try_get_db()
    if db is not None:
        boards = db["boards"]
        doc = await boards.find_one({"_id": boardId, "userId": user["userId"]})
        if not doc:
            return {"status": "error", "detail": "Board not found"}
        cards = doc.get("cards", [])
        next_pos = max([c.get("position", 0) for c in cards if c.get("columnId") == payload.columnId], default=-1) + 1
        new_card = {
            "_id": "card_" + uuid.uuid4().hex[:8],
            "boardId": boardId,
            "columnId": payload.columnId,
            "content": payload.content,
            "position": next_pos,
        }
        cards.append(new_card)
        await boards.update_one({"_id": boardId}, {"$set": {"cards": cards}})
        return {"status": "ok", "card": new_card}
    # In-memory fallback
    board = default_board_for(user["userId"])  # type: ignore
    if board["_id"] != boardId:
        return {"status": "error", "detail": "Board not found"}
    cards = [c for c in board["cards"] if c["columnId"] == payload.columnId]
    next_pos = max([c.get("position", 0) for c in cards], default=-1) + 1
    new_card = {
        "_id": "card_" + uuid.uuid4().hex[:8],
        "boardId": boardId,
        "columnId": payload.columnId,
        "content": payload.content,
        "position": next_pos,
    }
    board["cards"].append(new_card)
    return {"status": "ok", "card": new_card}

@router.post("/{boardId}/folders")
async def create_folder(boardId: str, payload: dict, user=Depends(get_current_user)):
    db = await try_get_db()
    name = payload.get("name") or "Folder"
    color = payload.get("color") or "#8b5cf6"
    new_folder = {"_id": "fld_" + uuid.uuid4().hex[:6], "name": name, "color": color}
    if db is not None:
        boards = db["boards"]
        doc = await boards.find_one({"_id": boardId, "userId": user["userId"]})
        if not doc:
            return {"status": "error", "detail": "Board not found"}
        folders = doc.get("folders", [])
        folders.append(new_folder)
        await boards.update_one({"_id": boardId}, {"$set": {"folders": folders}})
        return {"status": "ok", "folder": new_folder}
    # In-memory fallback
    board = default_board_for(user["userId"])  # type: ignore
    if board["_id"] != boardId:
        return {"status": "error", "detail": "Board not found"}
    board.setdefault("folders", []).append(new_folder)
    return {"status": "ok", "folder": new_folder}

@router.post("/{boardId}/folders/{folderId}/assign")
async def assign_cards_to_folder(boardId: str, folderId: str, payload: dict, user=Depends(get_current_user)):
    db = await try_get_db()
    card_ids = payload.get("cardIds", [])
    if db is not None:
        boards = db["boards"]
        doc = await boards.find_one({"_id": boardId, "userId": user["userId"]})
        if not doc:
            return {"status": "error", "detail": "Board not found"}
        cards = doc.get("cards", [])
        for c in cards:
            if c.get("_id") in card_ids:
                c["folderId"] = folderId
        await boards.update_one({"_id": boardId}, {"$set": {"cards": cards}})
        return {"status": "ok"}
    # In-memory fallback
    board = default_board_for(user["userId"])  # type: ignore
    if board["_id"] != boardId:
        return {"status": "error", "detail": "Board not found"}
    for c in board["cards"]:
        if c["_id"] in card_ids:
            c["folderId"] = folderId
    return {"status": "ok"}
