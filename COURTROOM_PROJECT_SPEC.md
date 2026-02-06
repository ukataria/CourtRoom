# Courtroom — Full Project Spec & Team Kickoff

## What We're Building

**Courtroom** is an adversarial evidence-locked decision engine. A user poses any dilemma ("Should CMU require AI ethics courses?"), and a system of AI agents debates it like a courtroom trial — except every claim must be backed by real evidence fetched via MCP tool calls. Users can intervene mid-debate to shift the argument. The output is not just a verdict, but an epistemic map showing what's proven, what's contested, and what's unknown.

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
- Model: fast/cheap (e.g., `openai/gpt-4.1-mini`) — this is a simple analysis task
- No MCP servers needed, no tools — just reasoning
- Output is structured JSON via Dedalus structured outputs:
  ```json
  {
    "axes": ["financial cost vs educational value", "academic freedom vs standardization"],
    "summary": "This decision involves tradeoffs across curriculum design, student outcomes, and institutional autonomy."
  }
  ```
- Frontend receives this as a banner at the top of the courtroom UI
- State machine moves to `DISCOVERY`

### Step 3: Discovery Phase (Researcher Gathers Evidence)

The researcher agent fires off multiple MCP tool calls in parallel to gather raw evidence. This is the most tool-heavy phase. The UI shows a live feed of tool calls streaming in — "Searching Semantic Scholar for AI ethics curriculum studies...", "Querying BLS for education employment data..."

**What happens technically:**
- Orchestrator calls `DedalusRunner.run()` for the researcher agent
- Model: fast/cheap (`openai/gpt-4.1-mini`) — optimized for lots of tool calls, not deep reasoning
- MCP servers: `windsor/brave-search`, `courtroom/academic-search`, `courtroom/news-search`
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
- Model: frontier (`anthropic/claude-sonnet-4-5-20250929`) — needs strong reasoning and persuasion
- MCP servers: `windsor/brave-search` (can do additional searches if needed)
- Local tools: `score_evidence()` — rates source quality
- System prompt includes the evidence package + evidence-locking rules:
  ```
  You are the Defense in an adversarial evidence court.
  You argue IN FAVOR of the proposed decision.

  EVIDENCE RULES (non-negotiable):
  - Every factual claim MUST cite an evidence ID: "claim text [TOOL:tool_001]"
  - You may search for additional evidence using brave_search
  - Uncited factual claims will be flagged as UNSUPPORTED
  - If you cannot find evidence, state: "I was unable to find supporting evidence for this point"
  - Opinion/reasoning does not require citation, but factual assertions do
  
  AVAILABLE EVIDENCE:
  [evidence package injected here]
  ```
- `stream=True` — tokens stream to frontend in real time, rendered in the left panel
- After response completes, `validation.py` parses the response:
  - Extracts all `[TOOL:id]` references
  - Validates each ID exists in the evidence package or was returned by a tool call in this session
  - Flags any factual-sounding sentences without citations
  - Sends validation results to frontend: `{ type: "validation_flag", agent: "defense", claim: "...", status: "unsupported" }`
- Confidence scoring runs: defense starts at 100, adjustments based on citation quality
- Frontend renders the defense argument in the left panel with inline citation chips

**Prosecution turn:**
- Same flow, but system prompt is flipped to argue AGAINST
- Prosecution also receives the defense's opening statement in its context so it can directly rebut
- State machine moves to `CROSS_EXAM_1`

### Step 5: Cross-Examination (2 rounds, with intervention windows)

This is where it gets interesting. Each agent now responds to the other's arguments. The prosecution targets weak evidence in the defense's case, the defense responds. They go back and forth.

**What happens technically:**
- Each cross-exam turn: agent receives the full transcript so far + their role's system prompt
- Agents are prompted to specifically target:
  - Unsupported claims from the opponent (flagged by validation)
  - Weak sources (old data, non-academic, etc.)
  - Logical gaps
- Key mechanic: if agent A cited a source and agent B finds a *more recent or authoritative* source that contradicts it, the orchestrator flags this as a **"kill shot"** — a direct evidence contradiction
- Kill shots are highlighted in the UI and cause a larger confidence swing (-10 for the contradicted side)
- After each cross-exam round, the state machine checks for pending user intervention

### Step 6: User Intervention (THE DEMO MOMENT)

After cross-exam round 1 (and optionally round 2), the UI shows a prominent intervention bar: "⚖️ Interject — ask the court a question or add a constraint"

The user types something like: "What about the cost to students?" or "I only care about job outcomes" or "What if it was optional instead of required?"

**What happens technically:**
- Frontend sends: `{ type: "intervention", content: "What about the cost to students?" }`
- Orchestrator receives it and creates a "Court Directive":
  ```
  ⚖️ COURT DIRECTIVE (from the decision-maker):
  "What about the cost to students?"
  
  Both agents MUST address this in their next response.
  The researcher will gather additional evidence on this topic.
  ```
- Researcher agent fires off new tool calls specifically about the intervention topic
- The directive + new evidence is injected into both agents' next turn
- Both agents must acknowledge and address it — failure to do so costs confidence points (-8)
- The UI shows a gavel banner: "⚖️ Court Directive: User asked about cost to students"
- State machine continues to the next cross-exam round

### Step 7: Closing Statements

Each agent gives a final summary. Critical rule in the system prompt: "You MUST concede your two weakest arguments. Acknowledge where the opposing side was strongest."

**What happens technically:**
- Same `DedalusRunner.run()` pattern
- System prompt forces concessions — this prevents the annoying LLM behavior of never admitting weakness
- The concessions are extracted and highlighted in the UI
- Final confidence scores are calculated

### Step 8: Verdict (Judge Agent)

The judge agent is fundamentally different from the others. It has NO MCP tools — it can only see the debate transcript. This mirrors real courtrooms where judges evaluate argument quality, not raw data.

**What happens technically:**
- Orchestrator calls `DedalusRunner.run()` for judge
- Model: best available (`anthropic/claude-opus-4-6`) — needs the strongest reasoning
- MCP servers: NONE
- Local tools: `parse_transcript()`, `generate_epistemic_map()`
- Input: the complete debate transcript (all phases, all agents, all evidence, all interventions)
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
- Output is structured JSON, rendered as the verdict panel

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

## Technical Architecture

```
Frontend (React + TypeScript + Tailwind)
│
│  WebSocket connection
│
├── Backend (FastAPI + Python)
│   ├── main.py              → FastAPI app, WS endpoint, CORS, startup
│   ├── orchestrator.py      → State machine, phase management, turn routing
│   ├── agents/
│   │   ├── base.py          → Base agent runner (wraps DedalusRunner.run())
│   │   ├── researcher.py    → Research agent config (model, MCP, tools, prompt)
│   │   ├── defense.py       → Defense agent config
│   │   ├── prosecutor.py    → Prosecutor agent config
│   │   ├── judge.py         → Judge agent config (no MCP)
│   │   └── prompts.py       → All system prompt templates
│   ├── models.py            → Pydantic models (DebateSession, AgentResponse, Citation, etc.)
│   ├── validation.py        → Evidence-locking (parse citations, flag unsupported claims)
│   ├── scoring.py           → Confidence scoring algorithm
│   └── config.py            → Env vars, model selection, API keys
│
├── MCP Servers (deployed to Dedalus)
│   ├── academic-search/     → Wraps Semantic Scholar API
│   ├── news-search/         → Wraps news API
│   └── data-stats/          → Wraps public data APIs (BLS, World Bank)
│
└── Frontend (React)
    ├── App.tsx               → Main layout, WebSocket provider
    ├── hooks/
    │   └── useDebateSocket.ts → WebSocket connection + message handling
    ├── components/
    │   ├── DilemmaInput.tsx   → Initial input screen with guided prompt
    │   ├── CaseBrief.tsx      → Banner showing tension axes
    │   ├── CourtPanel.tsx     → Single agent's streaming output with citations
    │   ├── EvidenceTrail.tsx  → Center panel showing live tool calls
    │   ├── InterventionBar.tsx → User input for mid-debate interjections
    │   ├── ConfidenceMeter.tsx → Animated confidence bars
    │   ├── VerdictDisplay.tsx  → Judge's ruling
    │   └── EpistemicMap.tsx    → Final knowledge map visualization
    └── types.ts               → All TypeScript types (WS messages, state, etc.)
```

---

## Team Split

Assuming a team of 3 (adjust as needed). These can run in parallel after hour 1-2 of shared setup.

---

### Person 1: Backend Orchestrator + Agents

**You own**: the state machine, agent configs, prompts, validation, scoring — everything that controls the debate flow.

**Claude Code starter prompt:**

```
I'm building the backend for "Courtroom" — an adversarial AI debate engine for a hackathon. Read CLAUDE.md first.

Start by scaffolding a FastAPI project with uv:
- Initialize with `uv init` and add dependencies: fastapi, uvicorn, websockets, pydantic, dedalus-labs, python-dotenv, structlog
- Create the file structure:
  - backend/main.py (FastAPI app with WebSocket endpoint and lifespan startup)
  - backend/orchestrator.py (state machine using a DebatePhase enum)
  - backend/agents/base.py (base class wrapping DedalusRunner.run())
  - backend/agents/researcher.py, defense.py, prosecutor.py, judge.py (agent configs)
  - backend/agents/prompts.py (system prompt templates)
  - backend/models.py (Pydantic models: DebateSession, AgentResponse, Citation, ToolCallEvent, ValidationFlag, ConfidenceUpdate)
  - backend/validation.py (parse [TOOL:id] citations from agent responses, flag uncited claims)
  - backend/scoring.py (confidence scoring: +5 academic source, +10 direct rebuttal, -5 uncited claim, -10 contradicted, -8 failed to address rebuttal, +7 addressed user intervention)
  - backend/config.py (env vars: DEDALUS_API_KEY, model names)

The orchestrator state machine phases are:
INTAKE → CASE_BRIEF → DISCOVERY → DEFENSE_OPENING → PROSECUTION_OPENING → CROSS_EXAM_1 → INTERVENTION_1 (optional) → CROSS_EXAM_2 → INTERVENTION_2 (optional) → DEFENSE_CLOSING → PROSECUTION_CLOSING → VERDICT → EPISTEMIC_MAP

Each phase transition calls the appropriate agent via DedalusRunner.run() with stream=True. Stream events are forwarded to the frontend via WebSocket as JSON messages.

Key rules:
- AsyncDedalus client created once at startup, shared across requests
- Researcher uses fast/cheap model + heavy MCP (brave-search, academic-search)
- Defense/Prosecution use frontier model + light MCP (brave-search only)
- Judge uses best model + NO MCP (transcript only)
- Every agent response goes through validation.py before being sent to frontend
- User interventions pause the state machine, trigger new research, then inject a "Court Directive" into both agents' next prompt

Start with the orchestrator and models, then build agents one at a time. Get a single agent making a tool call and streaming before wiring up the full debate flow.
```

---

### Person 2: MCP Servers + Dedalus Integration

**You own**: custom MCP servers, deployment to Dedalus, making sure tool calling works end-to-end.

**Claude Code starter prompt:**

```
I'm building custom MCP servers for "Courtroom" — a hackathon project using the Dedalus SDK. Read CLAUDE.md first.

Build 3 lightweight MCP servers that will be deployed to Dedalus. Each is a standalone Python project:

1. academic-search/ — wraps the Semantic Scholar API (https://api.semanticscholar.org/graph/v1)
   - Tool: search_papers(query: str, limit: int = 5) → list of {title, authors, year, abstract, citation_count, url}
   - Free API, no key needed (optional key for higher rate limits)
   - Keep it simple: one HTTP call, parse response, return structured data

2. news-search/ — wraps a news API (NewsAPI.org or GNews)
   - Tool: search_news(query: str, days_back: int = 30) → list of {title, source, date, snippet, url}
   - Needs API key (env var)

3. data-stats/ — wraps public data APIs
   - Tool: get_economic_data(indicator: str, country: str = "US") → {value, year, source_url}
   - Wraps World Bank API (free, no key): https://api.worldbank.org/v2/
   - Tool: get_education_stats(query: str) → relevant stats
   - Wraps NCES or BLS public endpoints

Each MCP server should follow Dedalus MCP conventions:
- Use dedalus-mcp-python framework if available, otherwise standard MCP protocol
- Each server exposes tools via JSON-RPC
- Type hints and docstrings on every tool function (Dedalus extracts schemas from these)
- Error handling: never crash on bad API responses, return structured error messages

Also create a test script that verifies each MCP server works locally before deploying:
- test_servers.py that calls each tool with sample queries and prints results

After servers work locally, the deployment command is through the Dedalus dashboard (3-click deploy). Document the slugs we'll use in a SERVERS.md file.

Additionally, set up the main backend's Dedalus integration:
- Verify that DedalusRunner.run() can call windsor/brave-search from the marketplace
- Verify streaming works with stream=True
- Verify local tools (plain Python functions with type hints) work alongside MCP servers in the same run() call

Start with academic-search since it's the most important for demo quality, then brave-search integration, then the others.
```

---

### Person 3: Frontend

**You own**: the entire React app — courtroom UI, WebSocket connection, all visual components.

**Claude Code starter prompt:**

```
I'm building the frontend for "Courtroom" — an adversarial AI debate engine for a hackathon. Read CLAUDE.md first.

Create a React + TypeScript + Tailwind project (use Vite). The app is a real-time courtroom UI that receives WebSocket messages from a FastAPI backend and renders a live debate.

File structure:
- src/App.tsx — main layout, wraps everything in WebSocket provider
- src/hooks/useDebateSocket.ts — custom hook managing WS connection, message parsing, reconnection
- src/types.ts — all TypeScript types as discriminated unions
- src/components/DilemmaInput.tsx — landing screen with guided input ("I need to decide whether to...")
- src/components/CaseBrief.tsx — banner showing identified tension axes
- src/components/CourtPanel.tsx — renders one agent's streaming argument with inline citation chips
- src/components/EvidenceTrail.tsx — center column showing live tool calls as they happen
- src/components/InterventionBar.tsx — input bar for user interjections, appears between cross-exam rounds
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
│  ⚖️ Interject: [________________________________] │
├──────────────────────────────────────────────────┤
│                 VERDICT (appears at end)          │
│                 EPISTEMIC MAP (appears at end)    │
└──────────────────────────────────────────────────┘

WebSocket message types (discriminated union in types.ts):

ServerMessage:
- { type: "phase_change", phase: string } — UI transitions
- { type: "case_brief", axes: string[], summary: string }
- { type: "agent_stream", agent: "defense"|"prosecution"|"researcher"|"judge", content: string, done: boolean }
- { type: "tool_call", agent: string, tool: string, query: string, status: "pending"|"complete" }
- { type: "tool_result", agent: string, tool: string, result_id: string, snippet: string }
- { type: "validation_flag", agent: string, claim: string, status: "unsupported"|"weak" }
- { type: "confidence_update", defense: number, prosecution: number }
- { type: "intervention_window", active: boolean } — show/hide intervention bar
- { type: "verdict", ruling: string, confidence: number, decisive_evidence: object[], unresolved: string[], flip_conditions: string[] }
- { type: "epistemic_map", confirmed: string[], contested: string[], unknown: string[] }

ClientMessage:
- { type: "start", dilemma: string, image_data: string | null }
- { type: "intervention", content: string }

Key UI details:
- Citation chips: small inline badges like [BLS-2025] that expand on hover to show raw source
- Unsupported claims: yellow warning badge on the claim
- Kill shots (direct contradictions): red highlight pulse animation
- Tool calls in evidence trail: show with a typing indicator while pending, checkmark when complete
- Court directive: gavel icon banner that appears across all panels when user intervenes
- Streaming text: tokens append character by character, auto-scroll to bottom
- Confidence meters: smooth CSS transition animations on width changes

Design vibe: clean, professional, dark mode with accent colors. Not playful — this is a serious decision tool. Think legal tech, not toy demo.

Start with the WebSocket hook and types, then the three-panel layout with placeholder content, then wire up streaming. Get text streaming working before adding citation chips and animations.
```

---

## Shared Setup (First 1-2 Hours, Together)

Before splitting:

1. Create the GitHub repo, add CLAUDE.md
2. Set up the monorepo structure: `/backend`, `/frontend`, `/mcp-servers`
3. Get Dedalus API key from the hackathon, set up .env
4. Verify basic Dedalus SDK call works: one `runner.run()` with `windsor/brave-search` returning results
5. Agree on the WebSocket message format (types.ts and models.py must match exactly)
6. Set up a shared doc/channel for the WS contract so both backend and frontend stay in sync

---

## Build Priority (What to Cut if Behind)

**Must have for demo:**
- Two agents (defense + prosecution) debating with citations
- Evidence trail showing tool calls
- User intervention (at least one window)
- Judge verdict
- Streaming UI

**Nice to have:**
- Researcher as a separate phase (can merge into agent turns)
- Epistemic map visualization
- Confidence meters with animations
- Kill shot highlighting
- Image/document upload
- Multiple custom MCP servers (can fall back to just brave-search)

**Cut if desperate:**
- Second cross-exam round
- Closing statements (go straight to verdict after cross-exam)
- Data-stats MCP server
- Fancy citation hover cards (just show inline text)

---

## Demo Script (Practice This)

1. "We built Courtroom — the first decision support system where AI agents compete on evidence, not rhetoric."
2. Type in a dilemma judges care about (CMU-related works well)
3. Show the case brief appearing, narrate the tension axes
4. Point out tool calls streaming in the evidence trail: "These are real API calls to Semantic Scholar, news sources, and web search happening in real time"
5. As defense argues, point to a citation chip: "Every claim is backed by a real source — click to verify"
6. Point to a yellow flag: "This claim was unsupported — the system caught it"
7. **THE MOMENT**: "Anyone in the audience want to ask the court a question?" → type it in → watch agents pivot
8. Show the verdict: "The judge has no tools — it can only evaluate the transcript"
9. Show the epistemic map: "Green is proven, yellow is contested, red is unknown — this is what you actually take away"
10. Close: "Adversarial epistemology. Not an answer — a map of the evidence landscape."
