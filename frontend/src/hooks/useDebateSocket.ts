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
  evidence: [],
  validationFlags: [],
  confidence: { defense: 50, prosecution: 50 },
  courtDirectives: [],
  crossExamMessages: [],
  activeAgent: null,
  interruptPending: false,
};

export function useDebateSocket(url: string) {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toolCallCounter = useRef(0);
  const crossExamCounter = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const readyState = wsRef.current?.readyState;
    if (
      readyState === WebSocket.OPEN ||
      readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };

    ws.onclose = () => {
      setState((prev) => {
        // Don't auto-reconnect if debate finished or component unmounted
        const terminal = prev.phase === "COMPLETE";
        if (!mountedRef.current || terminal) {
          return { ...prev, connected: false };
        }
        reconnectTimer.current = setTimeout(connect, 3000);
        return { ...prev, connected: false };
      });
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
          const isCrossExam =
            prev.phase === "CROSS_EXAM_1" ||
            prev.phase === "CROSS_EXAM_2";

          const updates: Partial<DebateState> = {
            activeAgent: msg.done ? null : msg.agent,
          };

          // Interrupted — discard partial output
          if (msg.interrupted) {
            if (isCrossExam) {
              const msgs = [...prev.crossExamMessages];
              if (msgs.length > 0 && !msgs[msgs.length - 1].done) {
                msgs.pop();
              }
              updates.crossExamMessages = msgs;
            } else if (msg.agent === "defense") {
              updates.defenseText = "";
              updates.defenseInterrupted = true;
            } else if (msg.agent === "prosecution") {
              updates.prosecutionText = "";
              updates.prosecutionInterrupted = true;
            }
            return { ...prev, ...updates };
          }

          // Normal streaming
          if (isCrossExam) {
            const msgs = [...prev.crossExamMessages];
            const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;

            if (last && last.agent === msg.agent && !last.done) {
              msgs[msgs.length - 1] = {
                ...last,
                content: last.content + msg.content,
                done: msg.done,
              };
            } else if (!msg.done || msg.content) {
              msgs.push({
                id: crossExamCounter.current++,
                agent: msg.agent as "defense" | "prosecution",
                content: msg.content,
                done: msg.done,
              });
            }
            updates.crossExamMessages = msgs;
          } else if (msg.agent === "defense") {
            updates.defenseText = prev.defenseText + msg.content;
          } else if (msg.agent === "prosecution") {
            updates.prosecutionText =
              prev.prosecutionText + msg.content;
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

      case "evidence":
        setState((prev) => ({
          ...prev,
          evidence: [
            ...prev.evidence,
            {
              id: msg.id,
              source: msg.source,
              title: msg.title,
              snippet: msg.snippet,
              source_type: msg.source_type,
              date: msg.date,
              url: msg.url,
            },
          ],
        }));
        break;
    }
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Inside useDebateSocket.ts
  const startDebate = (dilemma: string, filePaths: string[] = []) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: "start", 
        dilemma, 
        file_paths: filePaths 
      }));
    }
  };

  const sendInterrupt = useCallback(() => {
    send({ type: "interrupt" });
    setState((prev) => ({ ...prev, interruptPending: true }));
  }, [send]);

  const dismissInterrupt = useCallback(() => {
    setState((prev) => ({ ...prev, interruptPending: false }));
  }, []);

  const sendIntervention = useCallback(
    (content: string) => {
      send({ type: "intervention", content });
      setState((prev) => ({
        ...prev,
        interruptPending: false,
      }));
    },
    [send]
  );

  const startCrossExam = useCallback(() => {
    send({ type: "start_cross_exam" });
  }, [send]);

  const resetDebate = useCallback(() => {
    wsRef.current?.close();
    toolCallCounter.current = 0;
    crossExamCounter.current = 0;
    setState({ ...INITIAL_STATE, connected: false });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    state,
    startDebate,
    sendInterrupt,
    dismissInterrupt,
    sendIntervention,
    startCrossExam,
    resetDebate,
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
      return "defense";
    case "PROSECUTION_OPENING":
      return "prosecution";
    case "CROSS_EXAM_1":
      return "prosecution";
    case "CROSS_EXAM_2":
      return "defense";
    case "VERDICT":
      return "judge";
    default:
      return null;
  }
}
