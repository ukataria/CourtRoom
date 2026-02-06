"""MVP test — connects to the WebSocket and runs a defense turn.

Usage:
    1. Start the server:  uv run uvicorn backend.main:app --reload
    2. Run this script:   uv run python test_mvp.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import websockets

DILEMMA = "Should CMU require AI ethics courses for all CS majors?"
WS_URL = "ws://localhost:8000/ws/test-session-001"


async def main() -> None:
    """Connect, send a dilemma, and print streamed output."""
    print(f"Connecting to {WS_URL} ...")
    async with websockets.connect(WS_URL) as ws:
        # Send the start message
        start_msg = {
            "type": "start",
            "dilemma": DILEMMA,
            "image_data": None,
        }
        await ws.send(json.dumps(start_msg))
        print(f"Sent dilemma: {DILEMMA}\n")
        print("=" * 60)

        # Listen for messages until the debate completes
        async for raw in ws:
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "phase_change":
                phase = msg["phase"]
                print(f"\n--- Phase: {phase} ---\n")
                if phase == "COMPLETE":
                    break

            elif msg_type == "agent_stream":
                agent = msg["agent"]
                content = msg["content"]
                done = msg["done"]
                interrupted = msg.get("interrupted", False)

                if content:
                    # Print tokens inline (no newline)
                    sys.stdout.write(content)
                    sys.stdout.flush()

                if done:
                    print()  # newline after stream ends
                    if interrupted:
                        print(f"  [! {agent} was interrupted]")
                    else:
                        print(f"  [{agent} finished]")

            elif msg_type == "court_directive":
                print(f"\n  COURT DIRECTIVE: {msg['content']}\n")

            elif msg_type == "error":
                print(f"\n  ERROR: {msg['message']}")
                break

            else:
                print(f"  [{msg_type}]: {msg}")

    print("\n" + "=" * 60)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
