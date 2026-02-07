"""Local tool functions for debate agents.

These are plain Python functions that the Dedalus SDK
exposes as tools automatically (it extracts schemas from
type hints and docstrings). MCP servers handle the actual
searching; these tools handle evidence formatting.
"""

from __future__ import annotations

import asyncio
import uuid


class Citation:
    """
    Keeps track of citation information
    """

    def __init__(self) -> None:
        self.evidence_queue: asyncio.Queue[dict[str, str]] = asyncio.Queue()

    def add_evidence(self, evidence_dict: dict[str, str]) -> None:
        """Adds evidence to the queue for immediate forwarding."""
        self.evidence_queue.put_nowait(evidence_dict)

    def make_format_evidence_tool(self):
        """Creates the make format evidence tool for the MCP"""
        print("MAKE FORMAT EVIDENCE TOOL CALLED")

        def make_format_evidence(
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
            print("CALLLEEEEEEEED")
            evidence_id = f"tool_{uuid.uuid4().hex[:6]}"

            evidence = {
                "id": evidence_id,
                "title": title,
                "snippet": snippet,
                "source": source,
                "source_type": source_type,
                "date": date,
                "url": url,
            }
            self.add_evidence(evidence)

            return evidence

        return make_format_evidence

    def make_deduplicate_sources_tool(self):
        def make_duplicate_sources(
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
            print("SOURCES FORMATTED??")
            seen_titles: set[str] = set()
            unique: list[dict[str, str]] = []
            for src in sources:
                normalized = src.get("title", "").strip().lower()
                if normalized and normalized not in seen_titles:
                    seen_titles.add(normalized)
                    unique.append(src)
            return unique

        return make_duplicate_sources
