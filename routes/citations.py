from fastapi import APIRouter, HTTPException

from database import get_db
from models import CitationCreate

router = APIRouter(prefix="/api/citations", tags=["citations"])


@router.get("")
def list_citations(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM citations WHERE question_id = ? ORDER BY created_at DESC",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_citation(data: CitationCreate):
    if not data.content.strip():
        raise HTTPException(400, "Content cannot be empty")
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO citations (question_id, content, author, source) VALUES (?, ?, ?, ?)",
        (data.question_id, data.content.strip(), data.author or "", data.source or ""),
    )
    cid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM citations WHERE id = ?", (cid,)).fetchone())
    conn.close()
    return row


@router.delete("/{citation_id}")
def delete_citation(citation_id: int):
    conn = get_db()
    conn.execute("DELETE FROM citations WHERE id = ?", (citation_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
