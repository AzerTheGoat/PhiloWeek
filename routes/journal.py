from fastapi import APIRouter, HTTPException

from database import get_db
from models import JournalSave

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("/{question_id}")
def list_journal(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM journal_entries WHERE question_id = ? ORDER BY day_number",
        (question_id,),
    )]
    conn.close()
    return rows


@router.get("/{question_id}/{day}")
def get_journal_entry(question_id: int, day: int):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM journal_entries WHERE question_id = ? AND day_number = ?",
        (question_id, day),
    ).fetchone()
    conn.close()
    if not row:
        return {"question_id": question_id, "day_number": day, "content": "", "id": None}
    return dict(row)


@router.put("/{question_id}/{day}")
def save_journal_entry(question_id: int, day: int, data: JournalSave):
    if day < 1:
        raise HTTPException(400, "Invalid day")
    conn = get_db()
    conn.execute(
        """INSERT INTO journal_entries (question_id, day_number, content)
           VALUES (?, ?, ?)
           ON CONFLICT(question_id, day_number)
           DO UPDATE SET content = excluded.content, updated_at = datetime('now')""",
        (question_id, day, data.content),
    )
    conn.commit()
    row = dict(conn.execute(
        "SELECT * FROM journal_entries WHERE question_id = ? AND day_number = ?",
        (question_id, day),
    ).fetchone())
    conn.close()
    return row
