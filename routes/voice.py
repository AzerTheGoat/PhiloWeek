import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from database import get_db

router = APIRouter(tags=["voice"])


@router.get("/api/voice")
def list_voice_notes(question_id: int):
    conn = get_db()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM voice_notes WHERE question_id = ? ORDER BY created_at DESC",
        (question_id,),
    )]
    conn.close()
    return rows


@router.post("/api/voice/{question_id}", status_code=201)
async def create_voice_note(
    question_id: int,
    file: UploadFile = File(...),
    duration: float = Form(0),
    title: str = Form(""),
):
    content = await file.read()
    ext = (file.filename or "recording.webm").rsplit(".", 1)[-1]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"q{question_id}_{ts}.{ext}"
    path = os.path.join("recordings", filename)
    with open(path, "wb") as f:
        f.write(content)

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO voice_notes (question_id, filename, duration_seconds, title) VALUES (?, ?, ?, ?)",
        (question_id, filename, duration, title),
    )
    vid = cur.lastrowid
    conn.commit()
    row = dict(conn.execute("SELECT * FROM voice_notes WHERE id = ?", (vid,)).fetchone())
    conn.close()
    return row


@router.delete("/api/voice/{note_id}")
def delete_voice_note(note_id: int):
    conn = get_db()
    row = conn.execute("SELECT filename FROM voice_notes WHERE id = ?", (note_id,)).fetchone()
    if row:
        path = os.path.join("recordings", row["filename"])
        if os.path.exists(path):
            os.remove(path)
    conn.execute("DELETE FROM voice_notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/recordings/{filename}")
def get_recording(filename: str):
    path = os.path.join("recordings", filename)
    if not os.path.exists(path):
        raise HTTPException(404, "Recording not found")
    return FileResponse(path)
