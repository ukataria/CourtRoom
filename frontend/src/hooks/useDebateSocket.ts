import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  DebateState,
  ServerMessage,
  ToolCallEvent,
} from "../types";

const INITIAL_STATE: DebateState = {
  phase: "INTAKE",
  connected: false,
  caseBrief: null,
  defenseText: "",
  prosecutionText: "",
  researcherText: "",
  judgeText: "",
  defenseInterrupted: false,
  prosecutionInterrupted: false,
  toolCalls: [],
  validationFlags: [],
  confidence: { defense: 50, prosecution: 50 },
  courtDirectives: [],
  verdict: null,
  epistemicMap: null,
  activeAgent: null,
};

export function useDebateSocket(url: string) {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toolCallCounter = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, connected: false }));
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      handleMessage(msg);
    };
  }, [url]);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "phase_change":
        setState((prev) => ({
          ...prev,
          phase: msg.phase,
          activeAgent: getActiveAgent(msg.phase),
        }));
        break;

      case "case_brief":
        setState((prev) => ({
          ...prev,
          caseBrief: { axes: msg.axes, summary: msg.summary },
        }));
        break;

      case "agent_stream":
        setState((prev) => {
          const updates: Partial<DebateState> = {
            activeAgent: msg.done ? null : msg.agent,
          };

          if (msg.agent === "defense") {
            updates.defenseText = prev.defenseText + msg.content;
            if (msg.interrupted) updates.defenseInterrupted = true;
          } else if (msg.agent === "prosecution") {
            updates.prosecutionText =
              prev.prosecutionText + msg.content;
            if (msg.interrupted)
              updates.prosecutionInterrupted = true;
          } else if (msg.agent === "researcher") {
            updates.researcherText =
              prev.researcherText + msg.content;
          } else if (msg.agent === "judge") {
            updates.judgeText = prev.judgeText + msg.content;
          }

          return { ...prev, ...updates };
        });
        break;

      case "tool_call": {
        const tcId = `tc_${toolCallCounter.current++}`;
        setState((prev) => {
          if (msg.status === "complete") {
            return {
              ...prev,
              toolCalls: prev.toolCalls.map((tc) =>
                tc.tool === msg.tool &&
                tc.query === msg.query &&
                tc.status === "pending"
                  ? { ...tc, status: "complete" as const }
                  : tc
              ),
            };
          }
          const newCall: ToolCallEvent = {
            id: tcId,
            agent: msg.agent,
            tool: msg.tool,
            query: msg.query,
            status: msg.status,
          };
          return {
            ...prev,
            toolCalls: [...prev.toolCalls, newCall],
          };
        });
        break;
      }

      case "tool_result":
        setState((prev) => ({
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.tool === msg.tool && tc.agent === msg.agent
              ? {
                  ...tc,
                  status: "complete" as const,
                  snippet: msg.snippet,
                  result_id: msg.result_id,
                }
              : tc
          ),
        }));
        break;

      case "validation_flag":
        setState((prev) => ({
          ...prev,
          validationFlags: [
            ...prev.validationFlags,
            {
              agent: msg.agent,
              claim: msg.claim,
              status: msg.status,
            },
          ],
        }));
        break;

      case "confidence_update":
        setState((prev) => ({
          ...prev,
          confidence: {
            defense: msg.defense,
            prosecution: msg.prosecution,
          },
        }));
        break;

      case "court_directive":
        setState((prev) => ({
          ...prev,
          courtDirectives: [
            ...prev.courtDirectives,
            msg.content,
          ],
        }));
        break;

      case "verdict":
        setState((prev) => ({
          ...prev,
          verdict: {
            ruling: msg.ruling,
            confidence: msg.confidence,
            decisive_evidence: msg.decisive_evidence,
            unresolved: msg.unresolved,
            flip_conditions: msg.flip_conditions,
          },
        }));
        break;

      case "epistemic_map":
        setState((prev) => ({
          ...prev,
          epistemicMap: {
            confirmed: msg.confirmed,
            contested: msg.contested,
            unknown: msg.unknown,
          },
        }));
        break;
    }
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const startDebate = useCallback(
    (dilemma: string, imageData: string | null = null) => {
      send({ type: "start", dilemma, image_data: imageData });
    },
    [send]
  );

  const sendIntervention = useCallback(
    (content: string) => {
      send({ type: "intervention", content });
    },
    [send]
  );

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    state,
    startDebate,
    sendIntervention,
    connected: state.connected,
  };
}

function getActiveAgent(
  phase: string
): DebateState["activeAgent"] {
  switch (phase) {
    case "DISCOVERY":
      return "researcher";
    case "DEFENSE_OPENING":
    case "CROSS_EXAM_1":
    case "DEFENSE_CLOSING":
      return "defense";
    case "PROSECUTION_OPENING":
    case "CROSS_EXAM_2":
    case "PROSECUTION_CLOSING":
      return "prosecution";
    case "VERDICT":
      return "judge";
    default:
      return null;
  }
}
