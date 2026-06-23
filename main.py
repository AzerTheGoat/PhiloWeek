from contextlib import asynccontextmanager
import os
import uuid

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from database import init_db
from routes import questions, notes, journal, resources, sessions, programme, rapport, voice, ai_route, export_route

APP_SESSION_ID = str(uuid.uuid4())


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs("exports", exist_ok=True)
    os.makedirs("recordings", exist_ok=True)
    yield


app = FastAPI(title="PhiloWeek", lifespan=lifespan)


@app.get("/api/app-session")
def app_session():
    return {"id": APP_SESSION_ID}

app.include_router(questions.router)
app.include_router(notes.router)
app.include_router(journal.router)
app.include_router(resources.router)
app.include_router(sessions.router)
app.include_router(programme.router)
app.include_router(rapport.router)
app.include_router(voice.router)
app.include_router(ai_route.router)
app.include_router(export_route.router)

# Static files (must be last)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
