from fastapi import APIRouter, Depends, Body, Query
from typing import Optional

import logging
import anyio
from ..deps import get_current_user
from ..schemas import SummaryResponse, SummarizeRequest
from .boards import default_board_for, try_get_db, get_or_create_board_db
from ..config import GEMINI_API_KEY, TEXT_MODEL

router = APIRouter(prefix="/ai", tags=["ai"]) 
logger = logging.getLogger("ai")

@router.post("/boards/{board_id}/summarize", response_model=SummaryResponse)
async def summarize_board(
    board_id: str,
    payload: Optional[SummarizeRequest] = Body(default=None),
    folder_id: Optional[str] = Query(default=None),
    user=Depends(get_current_user),
):
    """
    Summarize the cards in a board (optionally filtered by folder).
    Uses Gemini API if configured, otherwise returns a stub summary.
    """

    # Normalize legacy email-based board IDs
    if "@" in board_id or "%40" in board_id:
        board_id = f"board_{user['userId']}"

    # Load board (MongoDB first, fallback to in-memory)
    board = await _load_board(board_id, user["userId"])

    # Determine folder selection
    selected_folder = (payload.folderId if payload else None) or folder_id
    cards = _filter_cards(board.get("cards", []), selected_folder)

    logger.info(
        "Summarize request: board_id=%s user_id=%s folder_id=%s card_count=%d",
        board_id, user["userId"], selected_folder, len(cards)
    )

    # Attempt Gemini summarization if API key and cards exist
    if GEMINI_API_KEY and cards:
        gemini_summary = await _summarize_with_gemini(cards)
        if gemini_summary:
            return SummaryResponse(summary=gemini_summary)

    # Fallback summary
    return SummaryResponse(summary=_stub_summary(cards))


async def _load_board(board_id: str, user_id: str) -> dict:
    """Load board from MongoDB if available, otherwise fallback to default."""
    db = await try_get_db()
    if db is not None:
        boards = db["boards"]
        board = await boards.find_one({"_id": board_id, "userId": user_id})
        if not board:
            board = await get_or_create_board_db(db, user_id)  # type: ignore
    else:
        board = default_board_for(user_id)  # type: ignore
    return board


def _filter_cards(cards: list, folder_id: Optional[str]) -> list:
    """Filter cards by folder ID if provided."""
    if folder_id:
        return [c for c in cards if c.get("folderId") == folder_id]
    return cards


async def _summarize_with_gemini(cards: list) -> Optional[str]:
    """Generate summary using Gemini API."""
    try:
        prompt = (
            "Summarize these brainstorming ideas into key themes and next steps, provide response in plain text.\n\n"
            + "\n".join(f"- {c.get('content','')}" for c in cards)
        )
        # Use google-generativeai SDK
        import google.generativeai as genai  # type: ignore

        model_name = "gemini-2.5-flash-lite"
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name)
        # Run blocking SDK call in a worker thread (SDK is sync)
        response = await anyio.to_thread.run_sync(model.generate_content, prompt)
        text = getattr(response, "text", "") or ""
        if text:
            logger.info("Gemini summary length=%d", len(text))
            return text
    except Exception as e:
        logger.exception("Gemini SDK summarization failed: %s", e)
    return None


def _stub_summary(cards: list) -> str:
    """Fallback summary if Gemini API not available."""
    snippets = ", ".join(c.get("content", "").strip()[:40] for c in cards[:5])
    count = len(cards)
    return f"Selected folder contains {count} cards. Highlights: {snippets if snippets else 'No content'}"

@router.post("/boards/{boardId}/cluster")
async def cluster_board(boardId: str, user=Depends(get_current_user)):
    # Stub clustering response
    _ = (boardId, user)
    return {"status": "ok", "clusters": {}}
