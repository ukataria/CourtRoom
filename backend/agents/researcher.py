"""Researcher agent configuration."""

from backend.agents.base import AgentConfig
from backend.agents.prompts import RESEARCHER_SYSTEM_PROMPT
from backend.agents.tools import Citation
from backend.config import (
    MCP_BRAVE_SEARCH,
    MCP_EXA,
    MCP_VALYU,
    RESEARCHER_MODELS,
)


def create_researcher_config(citations: Citation) -> AgentConfig:
    """Create the researcher agent configuration.

    Uses handoff routing: gpt-4.1-mini for fast tool calls,
    gpt-4.1 for complex query formulation.
    MCP: brave-search for web/news, exa for semantic search,
    valyu for academic papers (ArXiv, PubMed, scholarly DBs).
    Local tools: format_evidence, deduplicate_sources.
    """
    return AgentConfig(
        role="researcher",
        models=RESEARCHER_MODELS,
        system_prompt=RESEARCHER_SYSTEM_PROMPT,
        mcp_servers=[MCP_BRAVE_SEARCH, MCP_EXA, MCP_VALYU],
        tools=[
            citations.make_format_evidence_tool(),
            citations.make_deduplicate_sources_tool(),
        ],
    )
