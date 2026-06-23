from typing import Optional
from pydantic import BaseModel


class QuestionBody(BaseModel):
    title: str
    description: Optional[str] = ""


class NoteCreate(BaseModel):
    question_id: int
    title: str
    content: Optional[str] = ""
    tags: Optional[str] = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[str] = None


class JournalSave(BaseModel):
    content: str


class ResourceCreate(BaseModel):
    question_id: int
    type: Optional[str] = "link"
    title: str
    url: Optional[str] = ""
    notes: Optional[str] = ""


class ResourceUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None
    type: Optional[str] = None


class SessionCreate(BaseModel):
    question_id: int
    duration_minutes: float
    activity_type: str
    notes: Optional[str] = ""


class AIRequest(BaseModel):
    mode: str


class ProgrammeItemCreate(BaseModel):
    question_id: int
    type: Optional[str] = "article"
    title: str
    url: Optional[str] = ""
    aspect: Optional[str] = ""
    planned_minutes: Optional[int] = 0
    order_num: Optional[int] = 0


class ProgrammeItemUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    aspect: Optional[str] = None
    planned_minutes: Optional[int] = None
    is_done: Optional[int] = None
    order_num: Optional[int] = None


class RapportSave(BaseModel):
    content: str
