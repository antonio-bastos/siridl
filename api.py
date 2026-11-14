"""FastAPI entrypoint for SIRI-DL (Inteligência Viária de Loulé)."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.active_learning import router as active_learning_router
from routers.citizen import router as citizen_router
from routers.stream import router as stream_router
from routers.tiles import router as tiles_router

app = FastAPI(
    title="SIRI-DL API — Inteligência Viária de Loulé",
    version="1.0.0",
    description="Backend FastAPI para deteção de anomalias viárias e Portal do Cidadão (Eu Participo).",
)

allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = Path(os.getenv("SIRI_CITIZEN_UPLOAD_DIR", "uploads/citizen"))
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/citizen", StaticFiles(directory=str(upload_dir)), name="citizen-uploads")

app.include_router(citizen_router)
app.include_router(stream_router)
app.include_router(active_learning_router)
app.include_router(tiles_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "siri-dl-api"}
