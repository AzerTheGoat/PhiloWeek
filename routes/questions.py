from datetime import date

from fastapi import APIRouter, HTTPException

from database import get_db
from models import QuestionBody

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("")
def list_questions():
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM questions ORDER BY is_active DESC, created_at DESC"
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_question(data: QuestionBody):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO questions (title, description) VALUES (?, ?)",
        (data.title, data.description),
    )
    qid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM questions WHERE id = ?", (qid,)).fetchone())
    conn.close()
    return row


@router.get("/{question_id}")
def get_question(question_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Question not found")
    return dict(row)


@router.put("/{question_id}")
def update_question(question_id: int, data: QuestionBody):
    conn = get_db()
    conn.execute(
        "UPDATE questions SET title = ?, description = ? WHERE id = ?",
        (data.title, data.description, question_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Question not found")
    return dict(row)


@router.delete("/{question_id}")
def delete_question(question_id: int):
    conn = get_db()
    conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.put("/{question_id}/activate")
def activate_question(question_id: int):
    conn = get_db()
    conn.execute("UPDATE questions SET is_active = 0")
    conn.execute("UPDATE questions SET is_active = 1 WHERE id = ?", (question_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/{question_id}/stats")
def get_stats(question_id: int):
    conn = get_db()
    total_time = conn.execute(
        "SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions WHERE question_id = ?",
        (question_id,),
    ).fetchone()[0]
    notes_count = conn.execute(
        "SELECT COUNT(*) FROM notes WHERE question_id = ?", (question_id,)
    ).fetchone()[0]
    journal_days = conn.execute(
        "SELECT COUNT(*) FROM journal_entries WHERE question_id = ? AND content != ''",
        (question_id,),
    ).fetchone()[0]
    r = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(is_watched), 0) FROM resources WHERE question_id = ?",
        (question_id,),
    ).fetchone()
    today_str = date.today().isoformat()
    today_time = conn.execute(
        "SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions "
        "WHERE question_id = ? AND date(created_at) = ?",
        (question_id, today_str),
    ).fetchone()[0]
    conn.close()
    return {
        "total_time": round(total_time),
        "today_time": round(today_time),
        "notes_count": notes_count,
        "journal_days": journal_days,
        "resources_total": r[0],
        "resources_watched": r[1],
    }
