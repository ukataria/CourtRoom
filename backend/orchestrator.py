"""Debate orchestrator — state machine and agent turn runner."""

from __future__ import annotations

import asyncio
from enum import Enum

import structlog
from dedalus_labs import DedalusRunner
from fastapi import WebSocket

from backend.agents.base import AgentConfig, Message, start_agent_stream
from backend.agents.defense import create_defense_config, create_defense_cross_config
from backend.agents.prosecutor import (
    create_prosecution_config,
    create_prosecution_cross_config,
)
from backend.agents.researcher import create_researcher_config
from backend.logging_config import get_session_logger
from backend.agents.tools import Citation
from backend.models import (
    AgentStreamMessage,
    CourtDirective,
    CourtDirectiveMessage,
    Evidence,
    Intervention,
    PhaseChangeMessage,
    TranscriptEntry,
    EvidenceMessage,
)

logger = structlog.get_logger()


# --- Debate Phases ---


class DebatePhase(str, Enum):
    """Ordered phases of a courtroom debate."""

    INTAKE = "INTAKE"
    CASE_BRIEF = "CASE_BRIEF"
    DISCOVERY = "DISCOVERY"
    DEFENSE_OPENING = "DEFENSE_OPENING"
    PROSECUTION_OPENING = "PROSECUTION_OPENING"
    CROSS_EXAM_1 = "CROSS_EXAM_1"
    CROSS_EXAM_2 = "CROSS_EXAM_2"
    DEFENSE_CLOSING = "DEFENSE_CLOSING"
    PROSECUTION_CLOSING = "PROSECUTION_CLOSING"
    VERDICT = "VERDICT"
    EPISTEMIC_MAP = "EPISTEMIC_MAP"
    COMPLETE = "COMPLETE"


# --- Session State ---


class DebateSession:
    """Mutable state for a single debate.

    Holds asyncio primitives (Queue) so this is not
    a Pydantic model.
    """

    def __init__(self, session_id: str, dilemma: str) -> None:
        self.session_id = session_id
        self.dilemma = dilemma
        self.phase = DebatePhase.INTAKE
        self.transcript: list[TranscriptEntry] = []
        self.evidence: list[Evidence] = []
        self.court_directives: list[CourtDirective] = []
        self.intervention_queue: asyncio.Queue[Intervention] = asyncio.Queue()
        self.defense_score: float = 100.0
        self.prosecution_score: float = 100.0
        self.log = get_session_logger(session_id)


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
                    f"COURT DIRECTIVE (from the decision-maker) that interrupted the prrevoius message: "
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
                # Save partial response
                session.transcript.append(
                    TranscriptEntry(
                        agent=config.role,
                        content=partial_response,
                        phase=session.phase.value,
                        interrupted=True,
                    )
                )
                await _send(
                    ws,
                    AgentStreamMessage(
                        agent=config.role,
                        content="",
                        done=True,
                        interrupted=True,
                    ),
                )
                await _handle_intervention(session, intervention, ws)
                slog.info(
                    "agent_interrupted",
                    chunks_before_interrupt=chunk_count,
                    partial_length=len(partial_response),
                    intervention=intervention.content,
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
        response_length=len(partial_response),
    )
    return True


async def _handle_intervention(
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
    done = False
    while not done:
        await _transition(session, DebatePhase.DISCOVERY, ws)
        research_config = create_researcher_config(citations)
        done = await run_agent_turn(session, research_config, citations, runner, ws)

    # --- Defense Opening ---
    done = False
    while not done:
        await _transition(session, DebatePhase.DEFENSE_OPENING, ws)
        defense_config = create_defense_config(citations)
        done = await run_agent_turn(session, defense_config, citations, runner, ws)

    # --- Prosecution Opening ---
    done = False
    while not done:
        await _transition(session, DebatePhase.PROSECUTION_OPENING, ws)
        prosecution_config = create_prosecution_config(citations)
        done = await run_agent_turn(session, prosecution_config, citations, runner, ws)

    # --- Cross-Examination 1: Prosecution challenges Defense ---
    done = False
    while not done:
        await _transition(session, DebatePhase.CROSS_EXAM_1, ws)
        pros_cross = create_prosecution_cross_config(citations)
        done = await run_agent_turn(session, pros_cross, citations, runner, ws)

    # --- Cross-Examination 2: Defense responds ---
    done = False
    while not done:
        await _transition(session, DebatePhase.CROSS_EXAM_2, ws)
        def_cross = create_defense_cross_config(citations)
        done = await run_agent_turn(session, def_cross, citations, runner, ws)

    # --- Done ---
    await _transition(session, DebatePhase.COMPLETE, ws)
    session.log.info(
        "debate_flow_complete",
        transcript_entries=len(session.transcript),
        evidence_count=len(session.evidence),
    )
