# Courtroom — Full Project Spec & Team Kickoff

## What We're Building

**Courtroom** is an adversarial evidence-locked decision engine. A user poses any dilemma ("Should CMU require AI ethics courses?"), and a system of AI agents debates it like a courtroom trial — except every claim must be backed by real evidence fetched via MCP tool calls. Users can intervene mid-debate — even mid-sentence — to shift the argument. The output is not just a verdict, but an epistemic map showing what's proven, what's contested, and what's unknown.

**One-liner**: "Adversarial epistemology — AI agents competing on evidence quality, not rhetoric."

---

## End-to-End User Flow

### Step 1: User Submits a Dilemma

The user opens the app and sees a clean input screen. Not a blank textbox — a guided prompt: "I need to decide whether to..." with optional example chips ("take a job offer", "adopt this policy", "invest in X"). They can also upload a document/image (offer letter screenshot, policy PDF) that agents can analyze.

**What happens technically:**
- Frontend sends a WebSocket message: `{ type: "start", dilemma: "Should CMU require...", image_data: null }`
- Backend receives it, creates a new `DebateSession` with a unique ID
- Orchestrator state machine moves to `CASE_BRIEF` phase

### Step 2: Case Brief (Orchestrator Analyzes the Dilemma)

Before anyone argues, the orchestrator agent does a quick analysis to understand *what kind* of decision this is. It identifies the key tension axes — cost vs benefit, short-term vs long-term, ethical vs practical, etc. This shapes how the defense and prosecutor will be configured.

**What happens technically:**
- Orchestrator calls `DedalusRunner.run()` with a system prompt asking it to identify 2-4 key tension axes and frame them
- **Handoff model routing**: `model=["openai/gpt-4.1-mini", "openai/gpt-4.1"]` — fast model handles this simple analysis, with fallback to stronger model if the dilemma is complex
- No MCP servers needed, no tools — just reasoning
- Output is structured JSON via Dedalus structured outputs using `response_format=CaseBrief`:
  ```python
  class CaseBrief(BaseModel):
      axes: list[str]
      summary: str

  result = await runner.run(
      input=f"Analyze this dilemma: {dilemma}",
      model=["openai/gpt-4.1-mini", "openai/gpt-4.1"],
      response_format=CaseBrief,
  )
  ```
- Frontend receives this as a banner at the top of the courtroom UI
- State machine moves to `DISCOVERY`

### Step 3: Discovery Phase (Researcher Gathers Evidence)

The researcher agent fires off multiple MCP tool calls in parallel to gather raw evidence. This is the most tool-heavy phase. The UI shows a live feed of tool calls streaming in — "Searching Semantic Scholar for AI ethics curriculum studies...", "Querying web for education employment data..."

**What happens technically:**
- Orchestrator calls `DedalusRunner.run()` for the researcher agent
- **Handoff model routing**: `model=["openai/gpt-4.1-mini", "openai/gpt-4.1"]` — GPT models are optimized for high-volume tool calling; the system routes between fast (for simple searches) and stronger (for complex query formulation)
- MCP servers (marketplace):
  - `windsor/brave-search-mcp` — general web search, news, current events
  - `tsion/exa` — semantic search for conceptually related content, academic-adjacent
- MCP servers (custom, deployed to Dedalus):
  - `courtroom/academic-search` — wraps Semantic Scholar API for peer-reviewed papers
- Local tools: `format_results()`, `deduplicate_sources()`
- `stream=True` — tool call events are forwarded to frontend in real time
- Each tool result gets a unique ID (e.g., `tool_abc123`) that agents will cite later
- Researcher produces a structured evidence package:
  ```json
  {
    "evidence": [
      {
        "id": "tool_001",
        "source": "Semantic Scholar",
        "title": "AI Ethics in CS Curricula: A 2024 Survey",
        "snippet": "72% of top-50 CS programs now offer...",
        "source_type": "academic",
        "date": "2024-03"
      }
    ]
  }
  ```
- This evidence package is injected into both defense and prosecution system prompts
- State machine moves to `DEFENSE_OPENING`

### Step 4: Opening Statements (Defense, then Prosecution)

The defense agent presents its case first, followed by the prosecution. Each agent has access to the researcher's evidence package and must cite specific evidence IDs for every factual claim.

**What happens technically:**

**Defense turn:**
- Orchestrator calls `DedalusRunner.run()` for defense
- **Handoff model routing**: `model=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]` — GPT handles any additional tool calls (evidence searches), Claude writes the persuasive argument prose. This leverages the Dedalus handoff insight: "GPT handles reasoning and tool use well. Claude writes better prose."
- MCP servers: `windsor/brave-search-mcp` (can do additional searches if needed)
- Local tools: `score_evidence()` — rates source quality
- System prompt includes the evidence package + evidence-locking rules:
  ```
  You are the Defense in an adversarial evidence court.
  You argue IN FAVOR of the proposed decision.

  EVIDENCE RULES (non-negotiable):
  - Every factual claim MUST cite an evidence ID: "claim text [TOOL:tool_001]"
  - You may search for additional evidence using brave_search or exa
  - Uncited factual claims will be flagged as UNSUPPORTED
  - If you cannot find evidence, state: "I was unable to find supporting evidence for this point"
  - Opinion/reasoning does not require citation, but factual assertions do

  AVAILABLE EVIDENCE:
  [evidence package injected here]
  ```
- `stream=True` — tokens stream to frontend in real time, rendered in the left panel
- **The intervention listener is active during streaming** (see Step 6)
- After response completes (or is interrupted), `validation.py` parses the response:
  - Extracts all `[TOOL:id]` references
  - Validates each ID exists in the evidence package or was returned by a tool call in this session
  - Flags any factual-sounding sentences without citations
  - Sends validation results to frontend: `{ type: "validation_flag", agent: "defense", claim: "...", status: "unsupported" }`
- Confidence scoring runs: defense starts at 100, adjustments based on citation quality
- Frontend renders the defense argument in the left panel with inline citation chips

**Prosecution turn:**
- Same flow, but system prompt is flipped to argue AGAINST
- **Handoff routing**: same `model=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]`
- Prosecution also receives the defense's opening statement in its context so it can directly rebut
- State machine moves to `CROSS_EXAM_1`

### Step 5: Cross-Examination (2 rounds)

This is where it gets interesting. Each agent now responds to the other's arguments. The prosecution targets weak evidence in the defense's case, the defense responds. They go back and forth.

**What happens technically:**
- Each cross-exam turn: agent receives the full transcript so far + their role's system prompt
- **Handoff routing**: same as opening statements — `model=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]` — GPT for any additional evidence tool calls, Claude for the rebuttal writing
- Agents are prompted to specifically target:
  - Unsupported claims from the opponent (flagged by validation)
  - Weak sources (old data, non-academic, etc.)
  - Logical gaps
- Key mechanic: if agent A cited a source and agent B finds a *more recent or authoritative* source that contradicts it, the orchestrator flags this as a **"kill shot"** — a direct evidence contradiction
- Kill shots are highlighted in the UI and cause a larger confidence swing (-10 for the contradicted side)
- **The intervention listener is active throughout cross-examination** — the user can interject at any point

### Step 6: Real-Time User Intervention (THE DEMO MOMENT)

The intervention bar is **always visible** whenever an agent is speaking (opening statements, cross-examination, closing statements). The user can type and submit an interjection at any point — even mid-sentence — and the court will respond immediately.

The user types something like: "What about the cost to students?" or "I only care about job outcomes" or "What if it was optional instead of required?"

**What happens technically:**

**Architecture: Concurrent WebSocket listener + asyncio cancellation**

The key insight is that the WebSocket handler runs two concurrent tasks: one streaming the current agent's response, and one listening for incoming client messages. When an intervention arrives, it interrupts the stream.

```python
# Simplified intervention architecture
class DebateSession:
    intervention_queue: asyncio.Queue  # holds pending interventions
    current_stream_task: asyncio.Task | None  # the active agent stream

async def run_agent_turn(session, agent_config, websocket):
    """Run an agent turn with intervention support."""
    stream = runner.run(
        input=agent_config.prompt,
        model=agent_config.models,  # handoff array
        mcp_servers=agent_config.mcp_servers,
        tools=agent_config.tools,
        stream=True,
    )

    partial_response = ""
    async for chunk in stream:
        # Check for pending intervention between chunks
        try:
            intervention = session.intervention_queue.get_nowait()
            # Save partial response to transcript
            session.transcript.append({
                "agent": agent_config.role,
                "content": partial_response,
                "interrupted": True,
            })
            await websocket.send_json({
                "type": "agent_stream",
                "agent": agent_config.role,
                "content": "",
                "done": True,
                "interrupted": True,
            })
            # Handle the intervention
            await handle_intervention(session, intervention, websocket)
            return  # Turn ends; orchestrator decides who speaks next

        except asyncio.QueueEmpty:
            pass

        # Normal streaming
        if chunk.choices and chunk.choices[0].delta.content:
            token = chunk.choices[0].delta.content
            partial_response += token
            await websocket.send_json({
                "type": "agent_stream",
                "agent": agent_config.role,
                "content": token,
                "done": False,
            })

    # Completed without interruption
    session.transcript.append({
        "agent": agent_config.role,
        "content": partial_response,
        "interrupted": False,
    })

async def handle_intervention(session, intervention, websocket):
    """Process a user intervention mid-debate."""
    # 1. Show the Court Directive banner
    await websocket.send_json({
        "type": "court_directive",
        "content": intervention.content,
    })

    # 2. Quick research on the intervention topic (using handoffs for speed)
    evidence = await runner.run(
        input=f"Find evidence related to: {intervention.content}",
        model=["openai/gpt-4.1-mini", "openai/gpt-4.1"],
        mcp_servers=["windsor/brave-search-mcp", "tsion/exa"],
        tools=[format_results, deduplicate_sources],
        stream=True,  # stream tool calls to frontend
    )

    # 3. Inject directive + new evidence into session context
    session.court_directives.append({
        "content": intervention.content,
        "new_evidence": evidence,
        "injected_after": session.current_phase,
    })
```

**The WebSocket handler runs both concurrently:**

```python
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = get_or_create_session(session_id)

    async def listen_for_client_messages():
        """Always listening for interventions."""
        while True:
            data = await websocket.receive_json()
            if data["type"] == "intervention":
                await session.intervention_queue.put(
                    Intervention(content=data["content"])
                )
            elif data["type"] == "start":
                await session.start_queue.put(data)

    # Run listener alongside the debate orchestration
    listener = asyncio.create_task(listen_for_client_messages())
    try:
        await run_debate(session, websocket)
    finally:
        listener.cancel()
```

**After intervention, the flow continues:**
- The orchestrator creates a Court Directive injected into the next agent's system prompt:
  ```
  ⚖️ COURT DIRECTIVE (from the decision-maker):
  "What about the cost to students?"

  You MUST address this directive in your response.
  New evidence gathered on this topic:
  [new evidence injected here]

  The previous speaker was interrupted mid-argument. Their partial statement:
  [partial response text]
  ```
- The other agent speaks next (if defense was interrupted, prosecution goes; if prosecution was interrupted, defense goes), incorporating the directive
- Failure to address the directive costs confidence points (-8)
- The UI shows a gavel banner across all panels: "Court Directive: User asked about cost to students"

**Frontend behavior:**
- The intervention bar is always visible and enabled during agent speaking turns
- When the user submits, the current agent's streaming text gets a visual "interrupted" marker (faded trailing text + gavel icon)
- The Court Directive banner animates in across all three panels
- New tool calls from the intervention research appear in the evidence trail
- The next agent begins speaking, visually marked as "responding to directive"

### Step 7: Closing Statements

Each agent gives a final summary. Critical rule in the system prompt: "You MUST concede your two weakest arguments. Acknowledge where the opposing side was strongest."

**What happens technically:**
- **Handoff routing**: `model=["anthropic/claude-sonnet-4-5-20250929", "anthropic/claude-opus-4-5"]` — Claude models for strong prose; routes to Opus for nuanced concessions if needed
- System prompt forces concessions — this prevents the annoying LLM behavior of never admitting weakness
- The concessions are extracted and highlighted in the UI
- Final confidence scores are calculated
- **Intervention is still active** — user can interject during closing statements too

### Step 8: Verdict (Judge Agent)

The judge agent is fundamentally different from the others. It has NO MCP tools — it can only see the debate transcript. This mirrors real courtrooms where judges evaluate argument quality, not raw data.

**What happens technically:**
- Orchestrator calls `DedalusRunner.run()` for judge
- **No handoff needed** — single best model: `model="anthropic/claude-opus-4-6"` — strongest reasoning for evaluation
- MCP servers: NONE
- Local tools: `parse_transcript()`, `generate_epistemic_map()`
- Input: the complete debate transcript (all phases, all agents, all evidence, all interventions, all court directives)
- System prompt:
  ```
  You are the Judge. You have NO access to external tools.
  You can ONLY evaluate based on the debate transcript.
  Deliver a structured verdict:
  1. RULING: Which side has stronger evidence? (with confidence %)
  2. DECISIVE EVIDENCE: The 2-3 pieces of evidence that most influenced your ruling
  3. UNRESOLVED QUESTIONS: What neither side could adequately address
  4. WHAT WOULD CHANGE THIS RULING: Conditions that would flip the verdict
  ```
- Output is structured JSON via `response_format=Verdict`, rendered as the verdict panel

### Step 9: Epistemic Map

The final output — a visual summary of the knowledge landscape around this decision.

**What happens technically:**
- Generated by the judge's `generate_epistemic_map()` local tool
- Categories:
  - **Confirmed** (green): Both sides agreed, multiple corroborating sources
  - **Contested** (yellow): Contradictory evidence found, genuine disagreement
  - **Unknown** (red): Neither side found data, blind spots in the evidence
- Rendered as a visual card grid in the frontend
- This is what the user actually takes away — not just "yes/no" but "here's the full picture"

---

## Handoff Model Routing Strategy

Dedalus Handoffs (`model=[...]`) route subtasks to different models based on their strengths. Here's the routing strategy per agent:

| Agent | Handoff Models | Rationale |
|-------|---------------|-----------|
| Case Brief | `["openai/gpt-4.1-mini", "openai/gpt-4.1"]` | Simple analysis task, route to cheapest model first |
| Researcher | `["openai/gpt-4.1-mini", "openai/gpt-4.1"]` | Optimized for high-volume tool calling, not deep reasoning |
| Defense/Prosecution | `["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]` | GPT for tool calls (additional evidence searches), Claude for persuasive argument writing |
| Closing Statements | `["anthropic/claude-sonnet-4-5-20250929", "anthropic/claude-opus-4-5"]` | Claude for nuanced prose; Opus fallback for complex concessions |
| Judge | `"anthropic/claude-opus-4-6"` (single) | No handoff — needs the single strongest reasoning model for evaluation |

**Implementation pattern:**
```python
# In agents/base.py
class AgentConfig:
    role: str
    models: list[str] | str       # handoff array or single model
    mcp_servers: list[str]
    tools: list[Callable]
    system_prompt: str

async def run_agent(config: AgentConfig, context: str, runner: DedalusRunner):
    return runner.run(
        input=context,
        model=config.models,           # Dedalus routes automatically
        mcp_servers=config.mcp_servers,
        tools=config.tools,
        stream=True,
    )
```

---

## MCP Server Strategy

### Available on Dedalus Marketplace (use directly)

| Server Slug | Purpose | Used By |
|-------------|---------|---------|
| `windsor/brave-search-mcp` | General web search, news, current events | Researcher, Defense, Prosecution |
| `tsion/exa` | Semantic search — finds conceptually related content, good for academic-adjacent queries | Researcher |

### Custom MCP Server: `courtroom/academic-search`

**This does not exist on the marketplace and must be built.** It wraps the Semantic Scholar API to provide structured access to peer-reviewed papers — the single most important data source for demo quality.

**Rough implementation scope:**

```python
# mcp-servers/academic-search/server.py
from dedalus_mcp import tool

@tool
def search_papers(query: str, limit: int = 5, year_min: int | None = None) -> list[dict]:
    """Search Semantic Scholar for academic papers.

    Returns a list of papers with title, authors, year, abstract,
    citation count, and URL. Results are ranked by relevance.
    """
    # GET https://api.semanticscholar.org/graph/v1/paper/search
    # params: query, limit, year, fields=title,authors,year,abstract,citationCount,url
    # Free API, no key needed (optional key for higher rate limits)
    # Parse response, return structured list
    ...

@tool
def get_paper_details(paper_id: str) -> dict:
    """Get detailed information about a specific paper by Semantic Scholar ID.

    Returns full abstract, authors with affiliations, references,
    and citation context.
    """
    # GET https://api.semanticscholar.org/graph/v1/paper/{paper_id}
    # fields=title,authors,abstract,year,citationCount,references,tldr
    ...
```

**Build details:**
- Framework: Dedalus MCP Python (`dedalus-mcp-python`)
- Tools are decorated with `@tool`, type-hinted, with docstrings (Dedalus extracts schemas automatically)
- Error handling: return structured error messages, never crash on bad API responses
- Deployment: Dedalus dashboard (3-click deploy after testing locally)
- Testing: `test_servers.py` that calls each tool with sample queries and prints results before deployment

### Servers NOT needed (marketplace covers them)

The original spec listed `courtroom/news-search` and `courtroom/data-stats` as custom servers. These are **not needed**:
- **News search**: `windsor/brave-search-mcp` covers news and current events well
- **Data/stats**: `tsion/exa` can find statistical sources semantically; for a hackathon, this is sufficient. If dedicated stats access is needed, it's a nice-to-have (see task list)

---

## Technical Architecture

```
Frontend (React + TypeScript + Tailwind)
│
│  WebSocket connection (bidirectional — streaming down, interventions up)
│
├── Backend (FastAPI + Python)
│   ├── main.py              → FastAPI app, WS endpoint, CORS, lifespan startup
│   │                          Creates AsyncDedalus client + DedalusRunner once at startup
│   │                          WS handler runs listener + orchestrator concurrently
│   ├── orchestrator.py      → State machine, phase management, turn routing
│   │                          Uses asyncio.Queue for intervention handling
│   │                          Checks intervention queue between stream chunks
│   ├── agents/
│   │   ├── base.py          → AgentConfig dataclass + run_agent() wrapper
│   │   │                      Wraps DedalusRunner.run() with handoff model arrays
│   │   ├── researcher.py    → models=["openai/gpt-4.1-mini", "openai/gpt-4.1"]
│   │   │                      MCP: brave-search-mcp, exa, academic-search
│   │   ├── defense.py       → models=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]
│   │   │                      MCP: brave-search-mcp
│   │   ├── prosecutor.py    → models=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"]
│   │   │                      MCP: brave-search-mcp
│   │   ├── judge.py         → model="anthropic/claude-opus-4-6" (no handoff)
│   │   │                      MCP: NONE — transcript only
│   │   └── prompts.py       → All system prompt templates
│   ├── models.py            → Pydantic models (DebateSession, AgentResponse, Citation,
│   │                          ToolCallEvent, ValidationFlag, ConfidenceUpdate,
│   │                          Intervention, CourtDirective, CaseBrief, Verdict)
│   ├── validation.py        → Evidence-locking (parse [TOOL:id] citations, flag uncited claims)
│   ├── scoring.py           → Confidence scoring algorithm
│   └── config.py            → Env vars: DEDALUS_API_KEY, model names, MCP server slugs
│
├── MCP Servers
│   ├── [marketplace] windsor/brave-search-mcp  → Web search
│   ├── [marketplace] tsion/exa                  → Semantic search
│   └── [custom] mcp-servers/academic-search/    → Semantic Scholar API wrapper
│       ├── server.py        → @tool decorated functions
│       ├── test_server.py   → Local verification script
│       └── pyproject.toml   → Dependencies (httpx, dedalus-mcp-python)
│
└── Frontend (React + Vite)
    ├── src/App.tsx               → Main layout, WebSocket provider
    ├── src/hooks/
    │   └── useDebateSocket.ts    → WS connection, message parsing, intervention sending
    ├── src/components/
    │   ├── DilemmaInput.tsx       → Initial input screen with guided prompt
    │   ├── CaseBrief.tsx          → Banner showing tension axes
    │   ├── CourtPanel.tsx         → Single agent's streaming output with citations
    │   ├── EvidenceTrail.tsx      → Center panel showing live tool calls
    │   ├── InterventionBar.tsx    → ALWAYS VISIBLE during agent turns, sends interventions
    │   ├── CourtDirective.tsx     → Gavel banner that appears across all panels on intervention
    │   ├── ConfidenceMeter.tsx    → Animated confidence bars
    │   ├── VerdictDisplay.tsx     → Judge's structured ruling
    │   └── EpistemicMap.tsx       → Final knowledge map visualization
    └── src/types.ts               → All TypeScript types (WS messages, state, etc.)
```

---

## WebSocket Message Contract

### Server → Client

```typescript
type ServerMessage =
  | { type: "phase_change"; phase: string }
  | { type: "case_brief"; axes: string[]; summary: string }
  | { type: "agent_stream"; agent: "defense" | "prosecution" | "researcher" | "judge"; content: string; done: boolean; interrupted?: boolean }
  | { type: "tool_call"; agent: string; tool: string; query: string; status: "pending" | "complete" }
  | { type: "tool_result"; agent: string; tool: string; result_id: string; snippet: string }
  | { type: "validation_flag"; agent: string; claim: string; status: "unsupported" | "weak" }
  | { type: "confidence_update"; defense: number; prosecution: number }
  | { type: "court_directive"; content: string }
  | { type: "verdict"; ruling: string; confidence: number; decisive_evidence: object[]; unresolved: string[]; flip_conditions: string[] }
  | { type: "epistemic_map"; confirmed: string[]; contested: string[]; unknown: string[] }
```

### Client → Server

```typescript
type ClientMessage =
  | { type: "start"; dilemma: string; image_data: string | null }
  | { type: "intervention"; content: string }  // can be sent ANY TIME during agent turns
```

Note: The old `intervention_window` message type is removed — the intervention bar is always active during agent speaking turns, controlled by frontend state based on `phase_change` messages.

---

## Team Split

Assuming a team of 3 (adjust as needed). These can run in parallel after shared setup.

---

### Person 1: Backend Orchestrator + Agents

**You own**: the state machine, agent configs, handoff routing, prompts, validation, scoring, intervention handling — everything that controls the debate flow.

**Claude Code starter prompt:**

```
I'm building the backend for "Courtroom" — an adversarial AI debate engine for a hackathon. Read CLAUDE.md first.

Start by scaffolding a FastAPI project with uv:
- Initialize with `uv init` and add dependencies: fastapi, uvicorn, websockets, pydantic, dedalus-labs, python-dotenv, structlog
- Create the file structure:
  - backend/main.py (FastAPI app with WebSocket endpoint and lifespan startup)
    - Create AsyncDedalus client and DedalusRunner once in lifespan
    - WS handler must run two concurrent tasks: client message listener + debate orchestrator
    - Use asyncio.Queue for intervention messages
  - backend/orchestrator.py (state machine using a DebatePhase enum)
    - Phases: INTAKE → CASE_BRIEF → DISCOVERY → DEFENSE_OPENING → PROSECUTION_OPENING → CROSS_EXAM_1 → CROSS_EXAM_2 → DEFENSE_CLOSING → PROSECUTION_CLOSING → VERDICT → EPISTEMIC_MAP
    - Each agent turn checks intervention_queue between stream chunks
    - On intervention: save partial response, trigger research, inject Court Directive, continue debate
  - backend/agents/base.py (AgentConfig dataclass + run_agent wrapper)
    - Uses DedalusRunner.run() with model=[...] for handoff routing
    - model parameter is a list of model strings — Dedalus routes automatically
  - backend/agents/researcher.py — models=["openai/gpt-4.1-mini", "openai/gpt-4.1"], mcp_servers=["windsor/brave-search-mcp", "tsion/exa", "courtroom/academic-search"]
  - backend/agents/defense.py — models=["openai/gpt-5.2", "anthropic/claude-sonnet-4-5-20250929"], mcp_servers=["windsor/brave-search-mcp"]
  - backend/agents/prosecutor.py — same models as defense, flipped system prompt
  - backend/agents/judge.py — model="anthropic/claude-opus-4-6", NO mcp_servers, local tools only
  - backend/agents/prompts.py (system prompt templates)
  - backend/models.py (Pydantic models: DebateSession, AgentResponse, Citation, ToolCallEvent, ValidationFlag, ConfidenceUpdate, Intervention, CourtDirective, CaseBrief, Verdict, EpistemicMap)
  - backend/validation.py (parse [TOOL:id] citations from agent responses, flag uncited claims)
  - backend/scoring.py (confidence scoring: +5 academic source, +10 direct rebuttal, -5 uncited claim, -10 contradicted, -8 failed to address directive, +7 addressed user intervention)
  - backend/config.py (env vars: DEDALUS_API_KEY, model names, MCP server slugs)

Key implementation detail — intervention handling:
- The WebSocket handler runs asyncio.create_task(listen_for_client_messages()) alongside the orchestrator
- listen_for_client_messages() puts interventions on an asyncio.Queue
- The agent streaming loop does intervention_queue.get_nowait() between chunks
- On intervention: save partial response to transcript, send interrupted=true to frontend, run handle_intervention(), return from agent turn
- handle_intervention() triggers mini-research with handoff routing, creates Court Directive, injects into next agent's context

Start with the orchestrator, models, and the intervention Queue architecture. Then build agents one at a time. Get a single agent streaming with handoff model routing before wiring up the full debate flow.
```

---

### Person 2: MCP Servers + Dedalus Integration

**You own**: the custom academic-search MCP server, deployment, and verifying all marketplace MCP servers work end-to-end with handoff routing.

**Claude Code starter prompt:**

```
I'm building MCP server integration for "Courtroom" — a hackathon project using the Dedalus SDK. Read CLAUDE.md first.

We need 1 custom MCP server plus verification of 2 marketplace servers:

MARKETPLACE SERVERS (already exist, just verify they work):
1. windsor/brave-search-mcp — web search for current events and general queries
2. tsion/exa — semantic search for conceptually related content

CUSTOM SERVER TO BUILD:
1. mcp-servers/academic-search/ — wraps the Semantic Scholar API (https://api.semanticscholar.org/graph/v1)
   - Tool: search_papers(query: str, limit: int = 5, year_min: int | None = None) → list of {title, authors, year, abstract, citation_count, url}
   - Tool: get_paper_details(paper_id: str) → {title, authors, abstract, year, citation_count, references, tldr}
   - Free API, no key needed (optional key for higher rate limits)
   - Keep it simple: HTTP calls via httpx, parse response, return structured data
   - Use dedalus-mcp-python framework with @tool decorator
   - Type hints and docstrings on every tool function (Dedalus extracts schemas from these)
   - Error handling: never crash on bad API responses, return structured error messages

Create a verification script that tests everything:
- test_integration.py that:
  1. Calls runner.run() with windsor/brave-search-mcp and verifies results
  2. Calls runner.run() with tsion/exa and verifies results
  3. Tests the custom academic-search server locally
  4. Tests handoff routing: runner.run() with model=["openai/gpt-4.1-mini", "openai/gpt-4.1"] and multiple MCP servers
  5. Tests streaming with stream=True and verifies chunk iteration works
  6. Tests local tools (plain Python functions with type hints) alongside MCP servers in the same run() call

After the custom server works locally, deploy via Dedalus dashboard. Document the final slug in a SERVERS.md file.

Start with verifying the marketplace servers work, then build academic-search, then test handoffs + streaming + tools together.
```

---

### Person 3: Frontend

**You own**: the entire React app — courtroom UI, WebSocket connection, always-on intervention bar, all visual components.

**Claude Code starter prompt:**

```
I'm building the frontend for "Courtroom" — an adversarial AI debate engine for a hackathon. Read CLAUDE.md first.

Create a React + TypeScript + Tailwind project (use Vite). The app is a real-time courtroom UI that receives WebSocket messages from a FastAPI backend and renders a live debate.

File structure:
- src/App.tsx — main layout, wraps everything in WebSocket provider
- src/hooks/useDebateSocket.ts — custom hook managing WS connection, message parsing, reconnection, intervention sending
- src/types.ts — all TypeScript types as discriminated unions
- src/components/DilemmaInput.tsx — landing screen with guided input ("I need to decide whether to...")
- src/components/CaseBrief.tsx — banner showing identified tension axes
- src/components/CourtPanel.tsx — renders one agent's streaming output with inline citation chips
- src/components/EvidenceTrail.tsx — center column showing live tool calls as they happen
- src/components/InterventionBar.tsx — ALWAYS VISIBLE during agent turns, sends via WebSocket immediately
- src/components/CourtDirective.tsx — gavel banner across all panels when user intervenes
- src/components/ConfidenceMeter.tsx — animated horizontal bars showing each side's confidence score
- src/components/VerdictDisplay.tsx — judge's structured ruling
- src/components/EpistemicMap.tsx — final card grid (green=confirmed, yellow=contested, red=unknown)

Layout (three-panel courtroom):
┌──────────────────────────────────────────────────┐
│                   Case Brief Banner               │
├───────────────┬──────────────┬───────────────────┤
│   DEFENSE     │  EVIDENCE    │   PROSECUTION     │
│   (left)      │  TRAIL       │   (right)         │
│               │  (center)    │                   │
│  CourtPanel   │ EvidenceTrail│  CourtPanel       │
│               │              │                   │
│  Confidence:  │              │  Confidence:      │
│  ████░░ 72%   │              │  ███░░░ 58%       │
├───────────────┴──────────────┴───────────────────┤
│  ⚖️ Interject: [________________________________] │  ← ALWAYS VISIBLE during agent turns
├──────────────────────────────────────────────────┤
│                 VERDICT (appears at end)          │
│                 EPISTEMIC MAP (appears at end)    │
└──────────────────────────────────────────────────┘

WebSocket message types (discriminated union in types.ts):

ServerMessage:
- { type: "phase_change", phase: string } — UI transitions, controls intervention bar visibility
- { type: "case_brief", axes: string[], summary: string }
- { type: "agent_stream", agent: "defense"|"prosecution"|"researcher"|"judge", content: string, done: boolean, interrupted?: boolean }
- { type: "tool_call", agent: string, tool: string, query: string, status: "pending"|"complete" }
- { type: "tool_result", agent: string, tool: string, result_id: string, snippet: string }
- { type: "validation_flag", agent: string, claim: string, status: "unsupported"|"weak" }
- { type: "confidence_update", defense: number, prosecution: number }
- { type: "court_directive", content: string } — gavel banner on user intervention
- { type: "verdict", ruling: string, confidence: number, decisive_evidence: object[], unresolved: string[], flip_conditions: string[] }
- { type: "epistemic_map", confirmed: string[], contested: string[], unknown: string[] }

ClientMessage:
- { type: "start", dilemma: string, image_data: string | null }
- { type: "intervention", content: string } — can be sent ANY TIME during agent turns

Key UI details:
- InterventionBar: always visible when phase is DEFENSE_OPENING through PROSECUTION_CLOSING. User can type and submit at any time. On submit, send { type: "intervention" } immediately via WebSocket.
- When agent_stream arrives with interrupted: true, show a visual "interrupted" marker on the current agent's text (faded trailing text + gavel icon)
- CourtDirective: gavel icon banner that animates in across all panels when court_directive message arrives
- Citation chips: small inline badges like [BLS-2025] that expand on hover to show raw source
- Unsupported claims: yellow warning badge on the claim
- Kill shots (direct contradictions): red highlight pulse animation
- Tool calls in evidence trail: show with a typing indicator while pending, checkmark when complete
- Streaming text: tokens append character by character, auto-scroll to bottom
- Confidence meters: smooth CSS transition animations on width changes

Design vibe: clean, professional, dark mode with accent colors. Not playful — this is a serious decision tool. Think legal tech, not toy demo.

Start with the WebSocket hook and types, then the three-panel layout with placeholder content, then wire up streaming. Get text streaming working before adding citation chips and animations. Make sure the intervention bar works early — it's the key demo moment.
```

---

## Shared Setup (Together, First Thing)

Before splitting:

1. Create the GitHub repo, add CLAUDE.md
2. Set up the monorepo structure: `/backend`, `/frontend`, `/mcp-servers`
3. Get Dedalus API key from the hackathon, set up .env
4. Verify basic Dedalus SDK call works: `runner.run()` with `windsor/brave-search-mcp` returning results
5. Verify handoff routing works: `runner.run()` with `model=["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4-5-20250929"]`
6. Agree on the WebSocket message format (types.ts and models.py must match exactly)
7. Set up a shared doc/channel for the WS contract so both backend and frontend stay in sync

---

## Prioritized Task List

### Tier 1: Critical Path (must work for any demo)

1. **FastAPI WebSocket server with bidirectional communication** — Backend skeleton: WS endpoint that accepts connections, receives messages, sends JSON responses. This is the foundation everything else builds on.

2. **Dedalus SDK integration with handoff routing** — Verify `runner.run()` works with `model=[...]` array, `stream=True`, and at least one MCP server (`windsor/brave-search-mcp`). If handoffs don't work, nothing works.

3. **Single agent streaming over WebSocket** — One agent (defense) making a `runner.run()` call with handoffs and streaming tokens to the frontend via WebSocket. Proves the core loop works end-to-end.

4. **Frontend WebSocket hook + three-panel layout** — `useDebateSocket.ts` connecting, receiving `agent_stream` messages, rendering tokens in a `CourtPanel`. Basic three-panel layout with placeholder content.

5. **Two-agent debate (defense + prosecution) with turn-taking** — Orchestrator runs defense then prosecution, each receiving the other's output. System prompts enforce evidence citation rules.

6. **Evidence citation and validation** — `validation.py` parsing `[TOOL:id]` references from agent responses, flagging uncited claims, sending `validation_flag` messages to frontend. Citation chips rendering inline.

7. **Real-time intervention (mid-speech interruption)** — The `asyncio.Queue`-based intervention system. User submits interjection, current agent stream is interrupted, Court Directive is created, debate continues. This is THE demo moment.

8. **Judge verdict** — Judge agent with `model="anthropic/claude-opus-4-6"`, no MCP servers, structured output via `response_format=Verdict`. Reads full transcript, delivers ruling.

### Tier 2: Important for Demo Quality

9. **Marketplace MCP servers working (brave-search + exa)** — Both `windsor/brave-search-mcp` and `tsion/exa` verified and integrated into researcher agent for discovery phase.

10. **Custom academic-search MCP server** — Semantic Scholar wrapper deployed to Dedalus. Provides the highest-quality evidence for the demo (peer-reviewed papers with citation counts).

11. **Researcher discovery phase** — Dedicated pre-debate evidence gathering with streaming tool calls visible in the evidence trail. Makes the demo visually impressive.

12. **Confidence scoring** — Numerical scores updating after each turn based on citation quality, rebuttals, kill shots, and directive compliance. Animated meters in the UI.

13. **Dilemma input screen** — Guided prompt with example chips. First impression of the app.

14. **Court Directive UI** — Gavel banner animation, interrupted text visual treatment, "responding to directive" markers.

### Tier 3: Nice to Have

15. **Epistemic map visualization** — Card grid with green/yellow/red categories. Generated by the judge's local tool. Powerful for the closing of the demo.

16. **Kill shot detection and highlighting** — When one agent directly contradicts the other's cited source with a stronger source. Red pulse animation in the UI.

17. **Cross-examination round 2** — Second round of back-and-forth. Can cut to one round if behind.

18. **Closing statements with forced concessions** — Agents admitting weaknesses. Good for demo but not essential.

19. **Image/document upload** — User attaches an offer letter or policy PDF. Agents analyze it. Uses Dedalus vision capabilities.

20. **Custom data-stats MCP server** — World Bank / BLS wrapper for statistical data. Marketplace servers cover most needs.

21. **Fancy citation hover cards** — Click-to-expand source previews. Can fall back to simple inline text.

22. **Session persistence** — Redis/PostgreSQL for multi-turn sessions. In-memory dict is fine for demo.

---

## Demo Script (Practice This)

1. "We built Courtroom — the first decision support system where AI agents compete on evidence, not rhetoric."
2. Type in a dilemma judges care about (CMU-related works well)
3. Show the case brief appearing, narrate the tension axes
4. Point out tool calls streaming in the evidence trail: "These are real API calls to Semantic Scholar, news sources, and web search happening in real time"
5. As defense argues, point to a citation chip: "Every claim is backed by a real source — click to verify"
6. Point to a yellow flag: "This claim was unsupported — the system caught it"
7. **THE MOMENT**: While an agent is mid-sentence, type in a question — "Anyone in the audience want to ask the court a question?" → watch the agent get interrupted → Court Directive banner appears → next agent pivots to address it
8. Show the verdict: "The judge has no tools — it can only evaluate the transcript"
9. Show the epistemic map: "Green is proven, yellow is contested, red is unknown — this is what you actually take away"
10. Close: "Adversarial epistemology. Not an answer — a map of the evidence landscape."
