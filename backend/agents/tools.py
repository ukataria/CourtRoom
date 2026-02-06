"""Local tool functions for debate agents.

These are plain Python functions that the Dedalus SDK
exposes as tools automatically (it extracts schemas from
type hints and docstrings). MCP servers handle the actual
searching; these tools handle evidence formatting.
"""

from __future__ import annotations

import uuid


def format_evidence(
    title: str,
    snippet: str,
    source: str,
    source_type: str = "web",
    date: str = "",
    url: str = "",
) -> dict[str, str]:
    """Format a piece of evidence into the standard court format.

    Call this after finding relevant information from a search.
    Returns a structured evidence object with a unique ID that
    agents can cite using [TOOL:<id>] notation.

    Args:
        title: Title of the source (article, paper, page).
        snippet: Key excerpt or finding (1-3 sentences).
        source: Name of the source (e.g. "BBC News", "Nature").
        source_type: One of "web", "academic", "news", "data".
        date: Publication date if available (e.g. "2025-03").
        url: URL of the source if available.
    """
    evidence_id = f"tool_{uuid.uuid4().hex[:6]}"
    return {
        "id": evidence_id,
        "title": title,
        "snippet": snippet,
        "source": source,
        "source_type": source_type,
        "date": date,
        "url": url,
    }


def deduplicate_sources(
    sources: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Remove duplicate evidence sources based on title similarity.

    Call this after gathering evidence from multiple search tools
    to eliminate redundant results before presenting to the court.

    Args:
        sources: List of evidence objects from format_evidence.

    Returns:
        Deduplicated list of evidence objects.
    """
    seen_titles: set[str] = set()
    unique: list[dict[str, str]] = []
    for src in sources:
        normalized = src.get("title", "").strip().lower()
        if normalized and normalized not in seen_titles:
            seen_titles.add(normalized)
            unique.append(src)
    return unique
