from fastapi import APIRouter, HTTPException

from database import get_db
from ai import get_ai_response
from models import AIRequest

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/{question_id}")
async def ai_response(question_id: int, data: AIRequest):
    conn = get_db()
    question = conn.execute(
        "SELECT * FROM questions WHERE id = ?", (question_id,)
    ).fetchone()
    if not question:
        conn.close()
        raise HTTPException(404, "Question not found")

    notes = [dict(r) for r in conn.execute(
        "SELECT * FROM notes WHERE question_id = ?", (question_id,)
    )]
    journal_row = conn.execute(
        "SELECT content FROM journal_entries WHERE question_id = ? ORDER BY updated_at DESC LIMIT 1",
        (question_id,),
    ).fetchone()
    conn.close()

    journal_today = journal_row["content"] if journal_row else ""

    try:
        text = await get_ai_response(
            data.mode,
            question["title"],
            question["description"] or "",
            notes,
            journal_today,
        )
        return {"response": text}
    except Exception as e:
        raise HTTPException(500, str(e))
