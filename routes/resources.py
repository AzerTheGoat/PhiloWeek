from fastapi import APIRouter, HTTPException

from database import get_db
from models import ResourceCreate, ResourceUpdate

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.get("")
def list_resources(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM resources WHERE question_id = ? ORDER BY created_at DESC",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("", status_code=201)
def create_resource(data: ResourceCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO resources (question_id, type, title, url, notes) VALUES (?, ?, ?, ?, ?)",
        (data.question_id, data.type, data.title, data.url, data.notes),
    )
    rid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM resources WHERE id = ?", (rid,)).fetchone())
    conn.close()
    return row


@router.put("/{resource_id}")
def update_resource(resource_id: int, data: ResourceUpdate):
    conn = get_db()
    fields = {}
    if data.title is not None:
        fields["title"] = data.title
    if data.url is not None:
        fields["url"] = data.url
    if data.notes is not None:
        fields["notes"] = data.notes
    if data.type is not None:
        fields["type"] = data.type
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE resources SET {set_clause} WHERE id = ?",
            list(fields.values()) + [resource_id],
        )
        conn.commit()
    row = conn.execute("SELECT * FROM resources WHERE id = ?", (resource_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Resource not found")
    return dict(row)


@router.delete("/{resource_id}")
def delete_resource(resource_id: int):
    conn = get_db()
    conn.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.put("/{resource_id}/toggle")
def toggle_resource(resource_id: int):
    conn = get_db()
    conn.execute(
        "UPDATE resources SET is_watched = NOT is_watched WHERE id = ?", (resource_id,)
    )
    conn.commit()
    row = dict(conn.execute("SELECT * FROM resources WHERE id = ?", (resource_id,)).fetchone())
    conn.close()
    return row
