from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from export import generate_markdown_export

router = APIRouter(tags=["export"])


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
