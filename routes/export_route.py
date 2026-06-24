import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from database import get_db
from export import generate_markdown_export

router = APIRouter(tags=["export"])

EXPORT_VERSION = "1.0"

# Column definitions per table (controls what gets exported / imported)
_COLUMNS = {
    "questions":      ["id", "title", "description", "created_at", "is_active"],
    "notes":          ["id", "question_id", "title", "content", "tags", "created_at", "updated_at"],
    "journal_entries":["id", "question_id", "content", "day_number", "created_at", "updated_at"],
    "resources":      ["id", "question_id", "type", "title", "url", "notes", "is_watched", "created_at"],
    "study_sessions": ["id", "question_id", "duration_minutes", "activity_type", "notes", "created_at"],
    "programme_items":["id", "question_id", "type", "title", "url", "aspect", "planned_minutes", "is_done", "order_num", "created_at"],
    "rapports":       ["id", "question_id", "content", "updated_at"],
    "voice_notes":    ["id", "question_id", "filename", "duration_seconds", "title", "created_at"],
    "citations":      ["id", "question_id", "content", "author", "source", "created_at"],
}

# Child tables first so FK constraints don't block DELETEs
_DELETE_ORDER = [
    "citations", "voice_notes", "rapports", "programme_items",
    "study_sessions", "resources", "journal_entries", "notes", "questions",
]


# ── Markdown export (existing) ────────────────────────────────────────────────

@router.get("/export/{question_id}")
def export_question(question_id: int):
    try:
        content, filename = generate_markdown_export(question_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Full JSON backup export ───────────────────────────────────────────────────

@router.get("/api/export-all")
def export_all():
    conn = get_db()
    cur = conn.cursor()

    def fetch(table):
        cur.execute(f"SELECT {', '.join(_COLUMNS[table])} FROM {table}")
        rows = cur.fetchall()
        return [dict(row) for row in rows]

    data = {
        "version":      EXPORT_VERSION,
        "exported_at":  datetime.now().isoformat(),
        "questions":    fetch("questions"),
        "notes":        fetch("notes"),
        "journal_entries": fetch("journal_entries"),
        "resources":    fetch("resources"),
        "study_sessions": fetch("study_sessions"),
        "programme_items": fetch("programme_items"),
        "rapports":     fetch("rapports"),
        "voice_notes":  fetch("voice_notes"),
        "citations":    fetch("citations"),
    }
    conn.close()

    content = json.dumps(data, ensure_ascii=False, indent=2)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"philoweek_backup_{ts}.json"
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Full JSON backup import ───────────────────────────────────────────────────

class ImportPayload(BaseModel):
    version: str = "1.0"
    questions: list = []
    notes: list = []
    journal_entries: list = []
    resources: list = []
    study_sessions: list = []
    programme_items: list = []
    rapports: list = []
    voice_notes: list = []
    citations: list = []


@router.post("/api/import-all")
def import_all(payload: ImportPayload):
    conn = get_db()
    try:
        conn.execute("PRAGMA foreign_keys = OFF")

        for table in _DELETE_ORDER:
            conn.execute(f"DELETE FROM {table}")

        def insert_rows(table, rows):
            known = set(_COLUMNS[table])
            for row in rows:
                # Only insert columns that exist in the current schema AND in the row.
                # Extra keys from old/future JSON versions are silently discarded.
                # Missing keys fall back to the DB column DEFAULT via omission.
                present = {k: v for k, v in row.items() if k in known}
                if not present:
                    continue
                cols = list(present.keys())
                vals = list(present.values())
                placeholders = ", ".join("?" for _ in cols)
                col_str = ", ".join(cols)
                conn.execute(
                    f"INSERT OR IGNORE INTO {table} ({col_str}) VALUES ({placeholders})",
                    vals,
                )

        insert_rows("questions",       payload.questions)
        insert_rows("notes",           payload.notes)
        insert_rows("journal_entries", payload.journal_entries)
        insert_rows("resources",       payload.resources)
        insert_rows("study_sessions",  payload.study_sessions)
        insert_rows("programme_items", payload.programme_items)
        insert_rows("rapports",        payload.rapports)
        insert_rows("voice_notes",     payload.voice_notes)
        insert_rows("citations",       payload.citations)

        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Échec de l'import : {e}")

    conn.close()
    return {"ok": True}
