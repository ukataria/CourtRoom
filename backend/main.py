"""FastAPI application — WebSocket endpoint for debates."""

from __future__ import annotations

import asyncio
import shutil
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncIterator, List

import structlog
from dedalus_labs import AsyncDedalus, DedalusRunner
from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    HTTPException,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.logging_config import (
    cleanup_session_logger,
    get_session_logger,
    setup_logging,
)
from backend.models import (
    ErrorMessage,
    Intervention,
)
from backend.orchestrator import DebateSession, run_debate

logger = structlog.get_logger()

# --- Shared State ---

runner: DedalusRunner | None = None
UPLOAD_DIR = Path("data")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create the Dedalus client and runner once at startup."""
    global runner

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    log_dir = setup_logging()
    logger.info("logging_ready", log_dir=str(log_dir))

    client = AsyncDedalus()
    runner = DedalusRunner(client)
    logger.info("dedalus_client_ready")

    yield

    logger.info("shutting_down")


app = FastAPI(title="Courtroom", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional: Serve uploaded files statically if you want to display them
# app.mount("/data", StaticFiles(directory="data"), name="data")


# --- File Upload Endpoint ---


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to the server's data directory."""
    try:
        # Generate a unique filename to avoid collisions
        file_ext = Path(file.filename).suffix
        unique_name = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / unique_name

        # Save the file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {"file_path": str(file_path), "original_name": file.filename}
    except Exception as e:
        logger.error("upload_failed", error=str(e))
        raise HTTPException(status_code=500, detail="File upload failed")


# --- WebSocket Endpoint ---


@app.websocket("/ws/{session_id}")
async def handle_ws(
    websocket: WebSocket,
    session_id: str,
) -> None:
    """Handle a single debate session over WebSocket.

    Runs two concurrent tasks:
    1. A listener for client messages (start, intervention)
    2. The debate orchestrator (once started)
    """
    await websocket.accept()
    assert runner is not None, "Runner not initialized"

    slog = get_session_logger(session_id)
    slog.info("ws_connected")

    session: DebateSession | None = None
    start_event = asyncio.Event()

    # Holder for start data (dilemma + files)
    start_data: dict = {}

    async def listen_for_client() -> None:
        """Listen for client messages and route them."""
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            slog.debug(
                "ws_message_received",
                msg_type=msg_type,
            )

            if msg_type == "start" and session is None:
                start_data["dilemma"] = data.get("dilemma", "")
                start_data["file_paths"] = data.get("file_paths", [])
                start_event.set()
                slog.info(
                    "start_message_received",
                    dilemma=start_data["dilemma"],
                    files=len(start_data["file_paths"]),
                )

            elif msg_type == "intervention" and session:
                content = data.get("content", "")
                await session.intervention_queue.put(Intervention(content=content))
                slog.info(
                    "intervention_received",
                    content=content,
                )

            elif msg_type == "start_cross_exam" and session:
                session.cross_exam_event.set()
                slog.info("cross_exam_start_received")

    listener = asyncio.create_task(listen_for_client())

    try:
        # Wait for the client to send a start message
        await start_event.wait()

        # Initialize session with dilemma AND files
        session = DebateSession(
            session_id=session_id,
            dilemma=start_data["dilemma"],
            file_paths=start_data.get("file_paths", []),
        )
        slog.info("debate_started", dilemma=start_data["dilemma"])

        await run_debate(session, runner, websocket)

    except WebSocketDisconnect:
        slog.info("client_disconnected")
    except Exception as e:
        slog.error("debate_error", error=str(e), exc_info=True)
        try:
            msg = ErrorMessage(message=str(e))
            await websocket.send_json(msg.model_dump())
        except Exception:
            pass
    finally:
        listener.cancel()
        cleanup_session_logger(session_id)
        slog.info("ws_cleanup_complete")


# --- Health Check ---


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple health check."""
    return {"status": "ok"}
