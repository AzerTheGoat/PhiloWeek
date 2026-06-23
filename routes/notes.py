from datetime import datetime

from fastapi import APIRouter, HTTPException

from database import get_db
from models import NoteCreate, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("")
def list_notes(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM notes WHERE question_id = ? ORDER BY updated_at DESC",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_note(data: NoteCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO notes (question_id, title, content, tags) VALUES (?, ?, ?, ?)",
        (data.question_id, data.title, data.content, data.tags),
    )
    nid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)).fetchone())
    conn.close()
    return row


@router.get("/{note_id}")
def get_note(note_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Note not found")
    return dict(row)


@router.put("/{note_id}")
def update_note(note_id: int, data: NoteUpdate):
    conn = get_db()
    now = datetime.now().isoformat()
    fields = {}
    if data.title is not None:
        fields["title"] = data.title
    if data.content is not None:
        fields["content"] = data.content
    if data.tags is not None:
        fields["tags"] = data.tags
    if fields:
        fields["updated_at"] = now
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE notes SET {set_clause} WHERE id = ?",
            list(fields.values()) + [note_id],
        )
        conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Note not found")
    return dict(row)


@router.delete("/{note_id}")
def delete_note(note_id: int):
    conn = get_db()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
