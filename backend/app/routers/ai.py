from fastapi import APIRouter, Depends, Body, Query
from typing import Optional

import logging
import anyio
from sqlalchemy.orm import Session
from ..deps import get_current_user
from ..schemas import SummaryResponse, SummarizeRequest
from .boards import board_to_dict, ensure_user_board
from ..sql import get_session
# from ..config import GEMINI_API_KEY, TEXT_MODEL
from dotenv import load_dotenv
load_dotenv()
GEMINI_API_KEY="AIzaSyCPpK9hrnJKFfinvKKvP7G0O5-tpphxnD4"
router = APIRouter(prefix="/ai", tags=["ai"]) 
logger = logging.getLogger("ai")

@router.post("/boards/{board_id}/summarize", response_model=SummaryResponse)
async def summarize_board(
    board_id: str,
    payload: Optional[SummarizeRequest] = Body(default=None),
    folder_id: Optional[str] = Query(default=None),
    user=Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Summarize the cards in a board (optionally filtered by folder).
    Uses Gemini API if configured, otherwise returns a stub summary.
    """

    # Normalize legacy email-based board IDs
    if "@" in board_id or "%40" in board_id:
        board_id = f"board_{user['userId']}"

    # Load board from SQLite
    board = _load_board(board_id, user["userId"], session)  # type: ignore

    # Determine folder selection
    selected_folder = (payload.folderId if payload else None) or folder_id
    cards = _filter_cards(board.get("cards", []), selected_folder)

    logger.info(
        "Summarize request: board_id=%s user_id=%s folder_id=%s card_count=%d",
        board_id, user["userId"], selected_folder, len(cards)
    )

    # Attempt Gemini summarization if API key and cards exist
    if GEMINI_API_KEY and cards:
        print(GEMINI_API_KEY)
        print(cards)
        gemini_summary = await _summarize_with_gemini(cards)
        if gemini_summary:
            return SummaryResponse(summary=gemini_summary)

    # Fallback summary
    print(GEMINI_API_KEY)
    print(cards)

    return SummaryResponse(summary=_stub_summary(cards))


def _load_board(board_id: str, user_id: str, session: Session) -> dict:
    # Normalize: if requested board doesn't belong to user, ensure user's board
    if not board_id.startswith("board_"):
        board_id = f"board_{user_id}"
    board = ensure_user_board(session, user_id)
    return board_to_dict(session, board)


def _filter_cards(cards: list, folder_id: Optional[str]) -> list:
    """Filter cards by folder ID if provided."""
    if folder_id:
        return [c for c in cards if c.get("folderId") == folder_id]
    return cards


async def _summarize_with_gemini(cards: list) -> Optional[str]:
    """Generate summary using Gemini API."""
    try:
        prompt = (
            """
            You will be provided with a list of brainstorming ideas. 
            You have to do:
            - Provide 2-3 new related idea suggestions based on the provided ones. (HEADING: Seggestions)
            - Give a grouped abstartact name for the ideas. Like a title for the provided ideas. (HEADING: Title)
            - Provide a 2-3 line sumamry for the provided ideas (Key themes, top ideas, next steps). (HEADING: Summary)
            
            DO NOT USE MARKDOWN.\n\n
            """
            + "\n".join(f"- {c.get('content','')}" for c in cards)
        )
        # Use google-generativeai SDK
        import google.generativeai as genai  # type: ignore

        model_name = "gemini-2.5-flash-lite"
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(model_name)
        # Run blocking SDK call in a worker thread (SDK is sync)
        response = await anyio.to_thread.run_sync(model.generate_content, prompt)
        print(response)
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
