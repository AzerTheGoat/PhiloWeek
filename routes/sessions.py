from fastapi import APIRouter, Response

from database import get_db
from models import SessionCreate

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
def list_sessions(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM study_sessions WHERE question_id = ? ORDER BY created_at DESC",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_session(data: SessionCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO study_sessions (question_id, duration_minutes, activity_type, notes) "
        "VALUES (?, ?, ?, ?)",
        (data.question_id, data.duration_minutes, data.activity_type, data.notes),
    )
    sid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM study_sessions WHERE id = ?", (sid,)).fetchone())
    conn.close()
    return row


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int):
    conn = get_db()
    conn.execute("DELETE FROM study_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return Response(status_code=204)
