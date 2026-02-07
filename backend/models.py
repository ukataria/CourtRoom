"""Pydantic models for WebSocket messages and evidence."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

# --- Evidence & Transcript ---


class Evidence(BaseModel):
    """A single piece of evidence from a tool call."""

    id: str
    source: str
    title: str
    snippet: str
    source_type: str = "web"
    date: str = ""
    url: str = ""


class TranscriptEntry(BaseModel):
    """One turn in the debate transcript."""

    agent: str
    content: str
    phase: str
    interrupted: bool = False


class Intervention(BaseModel):
    """A user intervention (internal, queued by orchestrator)."""

    content: str


class CourtDirective(BaseModel):
    """Directive injected after a user intervention."""

    content: str
    new_evidence: list[Evidence] = Field(default_factory=list)


# --- Server → Client Messages ---


class PhaseChangeMessage(BaseModel):
    """Notify frontend of a phase transition."""

    type: Literal["phase_change"] = "phase_change"
    phase: str


class AgentStreamMessage(BaseModel):
    """A chunk of streamed agent output."""

    type: Literal["agent_stream"] = "agent_stream"
    agent: str
    content: str
    done: bool
    interrupted: bool = False


class ToolCallMessage(BaseModel):
    """A tool call event from an agent."""

    type: Literal["tool_call"] = "tool_call"
    agent: str
    tool: str
    query: str
    status: str = "pending"


class ToolResultMessage(BaseModel):
    """Result of a tool call with an evidence ID."""

    type: Literal["tool_result"] = "tool_result"
    agent: str
    tool: str
    result_id: str
    snippet: str


class CourtDirectiveMessage(BaseModel):
    """Gavel banner — user intervened."""

    type: Literal["court_directive"] = "court_directive"
    content: str


class ErrorMessage(BaseModel):
    """An error surfaced to the frontend."""

    type: Literal["error"] = "error"
    message: str


class EvidenceMessage(BaseModel):
    """A single piece of evidence from a tool call."""

    type: Literal["evidence"] = "evidence"
    id: str
    source: str
    title: str
    snippet: str
    source_type: str = "web"
    date: str = ""
    url: str = ""


# --- Client → Server Messages ---


class StartMessage(BaseModel):
    """Client requests a new debate."""

    type: Literal["start"] = "start"
    dilemma: str
    image_data: str | None = None


class InterventionMessage(BaseModel):
    """Client interjects mid-debate."""

    type: Literal["intervention"] = "intervention"
    content: str


class InterruptMessage(BaseModel):
    """Client requests immediate stream halt (no content yet)."""

    type: Literal["interrupt"] = "interrupt"


class StartCrossExamMessage(BaseModel):
    """Client triggers cross-examination phase."""

    type: Literal["start_cross_exam"] = "start_cross_exam"


# --- Helpers ---


def new_session_id() -> str:
    """Generate a short unique session ID."""
    return uuid.uuid4().hex[:12]
