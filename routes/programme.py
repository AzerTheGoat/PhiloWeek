from fastapi import APIRouter, HTTPException

from database import get_db
from models import ProgrammeItemCreate, ProgrammeItemUpdate

router = APIRouter(prefix="/api/programme", tags=["programme"])


@router.get("")
def list_programme(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM programme_items WHERE question_id = ? ORDER BY order_num, created_at",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_programme_item(data: ProgrammeItemCreate):
    conn = get_db()
    max_order = conn.execute(
        "SELECT COALESCE(MAX(order_num), -1) FROM programme_items WHERE question_id = ?",
        (data.question_id,),
    ).fetchone()[0]
    cur = conn.execute(
        "INSERT INTO programme_items (question_id, type, title, url, aspect, planned_minutes, order_num) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (data.question_id, data.type, data.title, data.url, data.aspect, data.planned_minutes, max_order + 1),
    )
    pid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM programme_items WHERE id = ?", (pid,)).fetchone())
    conn.close()
    return row


@router.put("/{item_id}")
def update_programme_item(item_id: int, data: ProgrammeItemUpdate):
    conn = get_db()
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE programme_items SET {set_clause} WHERE id = ?",
            list(fields.values()) + [item_id],
        )
        conn.commit()
    row = conn.execute("SELECT * FROM programme_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Item not found")
    return dict(row)


@router.delete("/{item_id}")
def delete_programme_item(item_id: int):
    conn = get_db()
    conn.execute("DELETE FROM programme_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
