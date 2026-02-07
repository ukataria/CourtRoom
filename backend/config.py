"""Environment configuration and model constants. For now all models are cheap for api saving."""

import os

from dotenv import load_dotenv

load_dotenv()

# --- API Keys ---
DEDALUS_API_KEY: str = os.getenv("DEDALUS_API_KEY", "")

# --- Handoff Model Arrays ---
# GPT for tool calls, Claude for persuasive writing
DEFENSE_MODELS: list[str] = [
    # "openai/gpt-5.2",
    # "anthropic/claude-sonnet-4-5-20250929",
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1"
]

# GPT for tool calls, Claude for persuasive writing
PROSECUTION_MODELS: list[str] = [
    # "openai/gpt-5.2",
    # "anthropic/claude-sonnet-4-5-20250929",
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1"
]

# Fast models for research-heavy tool calling
RESEARCHER_MODELS: list[str] = [
    # "anthropic/claude-sonnet-4-5-20250929",
    # "openai/gpt-5.2"
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1"
]

# Single strongest model for judgment (no handoff)
JUDGE_MODEL: str = "openai/gpt-4.1-mini" # "anthropic/claude-opus-4-6"

# --- MCP Server Slugs ---
MCP_BRAVE_SEARCH: str = "windsor/brave-search-mcp"
MCP_EXA: str = "tsion/exa"

# --- External MCP URLs ---
# Valyu: academic search across ArXiv, PubMed, scholarly databases
# Docs: https://docs.valyu.ai/integrations/mcp-server
VALYU_API_KEY: str = os.getenv("VALYU_API_KEY", "")
MCP_VALYU: str = (
    f"https://mcp.valyu.ai/mcp?valyuApiKey={VALYU_API_KEY}"
)

# --- Server ---
WS_HOST: str = "0.0.0.0"
WS_PORT: int = 8000
