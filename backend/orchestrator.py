"""Debate orchestrator — state machine and agent turn runner."""

from __future__ import annotations

import asyncio
from enum import Enum
from pathlib import Path

import structlog
from dedalus_labs import DedalusRunner
from fastapi import WebSocket

from backend.agents.base import AgentConfig, Message, start_agent_stream
from backend.agents.defense import create_defense_config, create_defense_cross_config
from backend.agents.judge import create_judge_config
from backend.agents.prosecutor import (
    create_prosecution_config,
    create_prosecution_cross_config,
)
from backend.agents.researcher import create_researcher_config
from backend.agents.tools import Citation
from backend.logging_config import get_session_logger
from backend.models import (
    AgentStreamMessage,
    CourtDirective,
    CourtDirectiveMessage,
    Evidence,
    EvidenceMessage,
    Intervention,
    PhaseChangeMessage,
    TranscriptEntry,
)
import httpx
import os
import base64

logger = structlog.get_logger()


# --- Debate Phases ---


class DebatePhase(str, Enum):
    """Ordered phases of a courtroom debate."""

    INTAKE = "INTAKE"
    CASE_BRIEF = "CASE_BRIEF"
    DISCOVERY = "DISCOVERY"
    DEFENSE_OPENING = "DEFENSE_OPENING"
    PROSECUTION_OPENING = "PROSECUTION_OPENING"
    AWAITING_CROSS_EXAM = "AWAITING_CROSS_EXAM"
    # Cross-examination: alternates CROSS_EXAM_1 (prosecution) / CROSS_EXAM_2 (defense)
    CROSS_EXAM_1 = "CROSS_EXAM_1"  # Prosecution challenges
    CROSS_EXAM_2 = "CROSS_EXAM_2"  # Defense responds
    VERDICT = "VERDICT"  # Judge delivers neutral summary
    COMPLETE = "COMPLETE"


# Cross-examination configuration
MAX_CROSS_EXCHANGES = 3  # Each side gets 5 turns (10 total)
# --- Session State ---


FILETYPE_MAPPING = {".pdf": "pdf"}


class DebateSession:
    """Mutable state for a single debate.

    Holds asyncio primitives (Queue) so this is not
    a Pydantic model.
    """

    def __init__(self, session_id: str, dilemma: str, file_paths=list[str]) -> None:
        self.session_id = session_id
        self.dilemma = dilemma
        self.phase = DebatePhase.INTAKE
        self.transcript: list[TranscriptEntry] = []
        self.evidence: list[Evidence] = []
        self.court_directives: list[CourtDirective] = []
        self.intervention_queue: asyncio.Queue[Intervention] = asyncio.Queue()
        self.cross_exam_event: asyncio.Event = asyncio.Event()
        self.resume_event: asyncio.Event = asyncio.Event()
        self.disconnected: bool = False
        self.defense_score: float = 100.0
        self.prosecution_score: float = 100.0
        self.log = get_session_logger(session_id)

        if len(file_paths) > 0:
            datapath = Path(file_paths[0])
            b64 = base64.b64encode(datapath.read_bytes()).decode()
            response = httpx.post(
                "https://api.dedaluslabs.ai/v1/ocr",
                headers={"Authorization": f"Bearer {os.environ['DEDALUS_API_KEY']}"},
                json={
                    "model": "mistral-ocr-latest",
                    "document": {
                        "type": "document_url",
                        "document_url": f"data:application/{FILETYPE_MAPPING[datapath.suffix]};base64,{b64}",
                    },
                },
                timeout=120.0,
            )
            self.ocr = [
                f"Page {page['index']}:\n{page['markdown'][:200]}..."
                for page in response.json()["pages"]
            ]
        else:
            self.ocr = None


# --- Helpers ---


async def _send(ws: WebSocket, msg: object) -> None:
    """Send a Pydantic model as JSON over WebSocket."""
    if hasattr(msg, "model_dump"):
        await ws.send_json(msg.model_dump())  # type: ignore[union-attr]


async def _transition(
    session: DebateSession,
    phase: DebatePhase,
    ws: WebSocket,
) -> None:
    """Move to a new phase and notify the frontend."""
    prev = session.phase.value
    session.phase = phase
    await _send(ws, PhaseChangeMessage(phase=phase.value))
    session.log.info(
        "phase_transition",
        from_phase=prev,
        to_phase=phase.value,
    )


def _build_history(session: DebateSession) -> list[Message]:
    """Build the message history from the transcript.

    Converts transcript entries into the
    system/user/assistant message format that
    the Dedalus SDK expects.
    """
    messages: list[Message] = [
        {
            "role": "user",
            "content": f"DILEMMA: {session.dilemma}",
        },
    ]
    if session.ocr is not None:
        messages.append(
            {
                "role": "user",
                "content": f"I have added a document to furhter explain the Dilemma, tkae a close look at the text representation: \
                            Document OCR: {session.ocr}",
            },
        )

    for entry in session.transcript:
        messages.append(
            {
                "role": "assistant",
                "content": (f"[{entry.agent.upper()}]: {entry.content}"),
            }
        )

    # Inject any court directives
    for directive in session.court_directives:
        evidence_text = ""
        if directive.new_evidence:
            evidence_text = "\nNew evidence:\n" + "\n".join(
                f"- {e.title}: {e.snippet}" for e in directive.new_evidence
            )
        messages.append(
            {
                "role": "user",
                "content": (
                    "COURT DIRECTIVE (from the decision-maker) "
                    f"that interrupted the previous message: "
                    f'"{directive.content}"{evidence_text}'
                ),
            }
        )

    return messages


async def _forward_evidence(
    citations: Citation,
    ws: WebSocket,
) -> None:
    """Watch the citation queue and send evidence immediately."""
    while True:
        evidence = await citations.evidence_queue.get()
        await _send(ws, EvidenceMessage(type="evidence", **evidence))
        logger.info("sent_evidence", evidence_id=evidence.get("id"))


# --- Agent Turn Runner ---


async def run_agent_turn(
    session: DebateSession,
    config: AgentConfig,
    citations: Citation,
    runner: DedalusRunner,
    ws: WebSocket,
) -> bool:
    """Run one agent turn, streaming chunks to the frontend.

    Checks the intervention queue between chunks.
    Returns True if the turn completed normally,
    False if it was interrupted by a user intervention.
    """
    slog = session.log.bind(agent=config.role, phase=session.phase.value)
    slog.info("agent_turn_start")

    history = _build_history(session)
    slog.debug(
        "agent_context_built",
        history_length=len(history),
    )

    # runner.run(stream=True) returns an async iterable directly
    stream = start_agent_stream(runner, config, history)

    partial_response = ""
    chunk_count = 0

    # Forward evidence to the frontend as soon as it's produced
    forwarder = asyncio.create_task(_forward_evidence(citations, ws))

    try:
        async for chunk in stream:
            chunk_count += 1

            # Check for intervention between chunks
            try:
                intervention = session.intervention_queue.get_nowait()

                await _send(
                    ws,
                    AgentStreamMessage(
                        agent=config.role,
                        content="",
                        done=True,
                        interrupted=True,
                    ),
                )

                if intervention.content:
                    # One-step intervention with content
                    session.transcript.append(
                        TranscriptEntry(
                            agent=config.role,
                            content=partial_response,
                            phase=session.phase.value,
                            interrupted=True,
                        )
                    )
                    await handle_intervention(
                        session, intervention, ws
                    )
                    slog.info(
                        "agent_interrupted_with_content",
                        chunks=chunk_count,
                        intervention=intervention.content,
                    )
                else:
                    # Bare interrupt — discard partial output
                    slog.info(
                        "agent_interrupted_bare",
                        chunks=chunk_count,
                        partial_length=len(partial_response),
                    )

                return False

            except asyncio.QueueEmpty:
                pass

            # Extract and forward content tokens
            if (
                hasattr(chunk, "choices")
                and chunk.choices
                and chunk.choices[0].delta
                and hasattr(chunk.choices[0].delta, "content")
                and chunk.choices[0].delta.content
            ):
                token = chunk.choices[0].delta.content
                partial_response += token
                await _send(
                    ws,
                    AgentStreamMessage(
                        agent=config.role,
                        content=token,
                        done=False,
                    ),
                )
    finally:
        forwarder.cancel()
        try:
            await forwarder
        except (asyncio.CancelledError, Exception):
            pass
        # Drain any evidence still in the queue
        while not citations.evidence_queue.empty():
            try:
                evidence = citations.evidence_queue.get_nowait()
                await _send(
                    ws,
                    EvidenceMessage(type="evidence", **evidence),
                )
            except asyncio.QueueEmpty:
                break

    # Completed without interruption
    session.transcript.append(
        TranscriptEntry(
            agent=config.role,
            content=partial_response,
            phase=session.phase.value,
            interrupted=False,
        )
    )
    await _send(
        ws,
        AgentStreamMessage(
            agent=config.role,
            content="",
            done=True,
        ),
    )
    slog.info(
        "agent_turn_complete",
        total_chunks=chunk_count,
        response=partial_response,
    )
    return True


async def handle_intervention(
    session: DebateSession,
    intervention: Intervention,
    ws: WebSocket,
) -> None:
    """Process a user intervention. Sends the directive banner.

    For MVP, we store the directive and let the next agent
    address it. Full version would also trigger mini-research.
    """
    directive = CourtDirective(content=intervention.content)
    session.court_directives.append(directive)
    await _send(
        ws,
        CourtDirectiveMessage(
            content=intervention.content,
        ),
    )
    session.log.info(
        "intervention_handled",
        content=intervention.content,
        total_directives=len(session.court_directives),
    )


# --- Cross-Examination Runner ---
async def _run_cross_examination(
    session: DebateSession,
    citations: Citation,
    runner: DedalusRunner,
    ws: WebSocket,
) -> None:
    """Run rapid-fire cross-examination.

    Alternates between prosecution challenges and defense responses.
    Each side gets MAX_CROSS_EXCHANGES turns (10 total exchanges).
    Handles interventions gracefully — the interrupted agent's turn
    counts, and we continue from the next speaker.
    """
    session.log.info(
        "cross_examination_start",
        max_exchanges=MAX_CROSS_EXCHANGES,
    )

    exchange_count = 0

    for exchange_num in range(MAX_CROSS_EXCHANGES):
        # --- Prosecution challenges ---
        await _transition(session, DebatePhase.CROSS_EXAM_1, ws)
        pros_config = create_prosecution_cross_config()
        pros_done = await run_agent_turn(session, pros_config, citations, runner, ws)
        exchange_count += 1

        # If interrupted, wait for user directive before continuing
        if not pros_done:
            session.log.info(
                "cross_exam_prosecution_interrupted",
                exchange=exchange_num + 1,
            )
            await session.resume_event.wait()
            session.resume_event.clear()
            if session.disconnected:
                return

        # --- Defense responds ---
        await _transition(session, DebatePhase.CROSS_EXAM_2, ws)
        def_config = create_defense_cross_config()
        def_done = await run_agent_turn(
            session, def_config, citations, runner, ws
        )
        exchange_count += 1

        if not def_done:
            session.log.info(
                "cross_exam_defense_interrupted",
                exchange=exchange_num + 1,
            )
            await session.resume_event.wait()
            session.resume_event.clear()
            if session.disconnected:
                return

        session.log.debug(
            "cross_exam_exchange_complete",
            exchange=exchange_num + 1,
            total_exchanges=MAX_CROSS_EXCHANGES,
        )

    session.log.info(
        "cross_examination_complete",
        total_turns=exchange_count,
    )


# --- Main Debate Flow ---


async def run_debate(
    session: DebateSession,
    runner: DedalusRunner,
    ws: WebSocket,
) -> None:
    """Run the debate flow: research, defense, prosecution.

    Each agent can make its own MCP tool calls for
    additional evidence. New findings are tracked via
    the shared Citation queue and forwarded to the
    frontend in real time.
    """
    session.log.info("debate_flow_start", dilemma=session.dilemma)

    citations = Citation()

    # --- Research Information ---
    await _transition(session, DebatePhase.DISCOVERY, ws)
    done = False
    while not done:
        research_config = create_researcher_config(citations)
        done = await run_agent_turn(session, research_config, citations, runner, ws)

    # --- Defense Opening ---
    await _transition(session, DebatePhase.DEFENSE_OPENING, ws)
    done = False
    while not done:
        defense_config = create_defense_config(citations)
        done = await run_agent_turn(
            session, defense_config, citations, runner, ws
        )
        if not done:
            await session.resume_event.wait()
            session.resume_event.clear()
            if session.disconnected:
                return

    # --- Prosecution Opening ---
    await _transition(session, DebatePhase.PROSECUTION_OPENING, ws)
    done = False
    while not done:
        prosecution_config = create_prosecution_config(citations)
        done = await run_agent_turn(
            session, prosecution_config, citations, runner, ws
        )
        if not done:
            await session.resume_event.wait()
            session.resume_event.clear()
            if session.disconnected:
                return

    # --- Await User Trigger for Cross-Examination ---
    await _transition(session, DebatePhase.AWAITING_CROSS_EXAM, ws)
    session.log.info("awaiting_cross_exam_trigger")
    await session.cross_exam_event.wait()
    session.log.info("cross_exam_triggered_by_user")

    # --- Cross-Examination: Rapid back-and-forth (5 exchanges each) ---
    await _run_cross_examination(session, citations, runner, ws)

    # --- Judge Summary ---
    await _transition(session, DebatePhase.VERDICT, ws)
    done = False
    judge_attempts = 0
    max_judge_attempts = 3

    while not done and judge_attempts < max_judge_attempts:
        judge_config = create_judge_config()
        done = await run_agent_turn(session, judge_config, citations, runner, ws)
        judge_attempts += 1

        # Check if judge actually produced content
        if done:
            # Find the last judge entry in transcript
            judge_entries = [
                e
                for e in session.transcript
                if e.agent == "judge" and e.phase == DebatePhase.VERDICT.value
            ]
            if judge_entries:
                last_judge_entry = judge_entries[-1]
                if len(last_judge_entry.content.strip()) == 0:
                    session.log.warning(
                        "judge_empty_response",
                        attempt=judge_attempts,
                        retrying=True,
                    )
                    done = False  # Retry if empty response
                else:
                    session.log.info(
                        "judge_summary_complete",
                        response_length=len(last_judge_entry.content),
                    )
            else:
                session.log.warning(
                    "judge_no_transcript_entry",
                    attempt=judge_attempts,
                    retrying=True,
                )
                done = False  # Retry if no entry created

    if not done and judge_attempts >= max_judge_attempts:
        session.log.error(
            "judge_failed_after_retries",
            attempts=max_judge_attempts,
        )
        # Still transition to COMPLETE even if judge failed
        # The frontend can handle missing judge text

    # --- Done ---
    await _transition(session, DebatePhase.COMPLETE, ws)
    session.log.info(
        "debate_flow_complete",
        transcript_entries=len(session.transcript),
        evidence_count=len(session.evidence),
    )
