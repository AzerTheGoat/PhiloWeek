from fastapi import APIRouter

from database import get_db
from models import RapportSave

router = APIRouter(prefix="/api/rapport", tags=["rapport"])


@router.get("/{question_id}")
def get_rapport(question_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM rapports WHERE question_id = ?", (question_id,)).fetchone()
    conn.close()
    if not row:
        return {"question_id": question_id, "content": "", "id": None}
    return dict(row)


@router.put("/{question_id}")
def save_rapport(question_id: int, data: RapportSave):
    conn = get_db()
    conn.execute(
        """INSERT INTO rapports (question_id, content)
           VALUES (?, ?)
           ON CONFLICT(question_id)
           DO UPDATE SET content = excluded.content, updated_at = datetime('now')""",
        (question_id, data.content),
    )
    conn.commit()
    row = dict(conn.execute("SELECT * FROM rapports WHERE question_id = ?", (question_id,)).fetchone())
    conn.close()
    return row
