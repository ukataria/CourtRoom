"""Defense agent configuration."""

from backend.agents.base import AgentConfig
from backend.agents.prompts import DEFENSE_CROSS_PROMPT, DEFENSE_SYSTEM_PROMPT
from backend.agents.tools import Citation
from backend.config import DEFENSE_MODELS, MCP_BRAVE_SEARCH, MCP_VALYU


def create_defense_config(citations: Citation) -> AgentConfig:
    """Create the defense agent configuration.

    Uses handoff routing: GPT for tool calls (evidence
    searches), Claude for persuasive argument writing.
    MCP: brave-search for supplemental evidence.
    Local tools: format_evidence so new findings are
    tracked and forwarded to the frontend.
    """
    return AgentConfig(
        role="defense",
        models=DEFENSE_MODELS,
        system_prompt=DEFENSE_SYSTEM_PROMPT,
        mcp_servers=[MCP_BRAVE_SEARCH, MCP_VALYU],
        tools=[citations.make_format_evidence_tool()],
    )


def create_defense_cross_config() -> AgentConfig:
    """Create the defense cross-examination configuration.

    No MCP servers or tools - cross-exam uses only 
    existing evidence from the discovery phase.
    """
    return AgentConfig(
        role="defense",
        models=DEFENSE_MODELS,
        system_prompt=DEFENSE_CROSS_PROMPT,
    )
