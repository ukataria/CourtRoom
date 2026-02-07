import { useEffect, useMemo, useRef } from "react";
import { Shield, Sword, Swords } from "lucide-react";
import type {
  CrossExamMessage,
  DebateState,
  EvidenceItem,
  ToolCallEvent,
} from "../types";
import { InlineText, type SourceEntry } from "./CourtPanel";

interface CrossExamViewProps {
  messages: CrossExamMessage[];
  activeAgent: DebateState["activeAgent"];
  evidence: EvidenceItem[];
  toolCalls: ToolCallEvent[];
  onCitationClick: (evidenceId: string) => void;
}

export function CrossExamView({
  messages,
  activeAgent,
  evidence,
  toolCalls,
  onCitationClick,
}: CrossExamViewProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sourceMap = useMemo(() => {
    const map = new Map<string, SourceEntry>();
    for (let i = 0; i < evidence.length; i++) {
      map.set(evidence[i].id, {
        index: i + 1,
        evidenceId: evidence[i].id,
      });
    }
    for (const tc of toolCalls) {
      if (tc.result_id && !map.has(tc.result_id)) {
        const evMatch = evidence.find(
          (ev) => ev.id === tc.result_id
        );
        if (evMatch) {
          const existing = map.get(evMatch.id);
          if (existing) map.set(tc.result_id, existing);
        }
      }
    }
    return map;
  }, [evidence, toolCalls]);

  // Scroll the section into view when it first mounts
  useEffect(() => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // Scroll to bottom as new messages stream in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  return (
    <div
      ref={sectionRef}
      className="shrink-0 border-t border-gold/20 px-6 py-4"
      style={{ animation: "fade-in 0.4s ease-out" }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <Swords className="h-5 w-5 text-gold" />
        <h2 className="text-lg font-bold text-gold">
          Cross-Examination
        </h2>
      </div>

      {/* Messages */}
      <div className="mx-auto max-w-4xl space-y-4">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            sourceMap={sourceMap}
            onCitationClick={onCitationClick}
          />
        ))}

        {activeAgent &&
          (activeAgent === "defense" ||
            activeAgent === "prosecution") &&
          (messages.length === 0 ||
            messages[messages.length - 1].done) && (
            <TypingIndicator agent={activeAgent} />
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  sourceMap,
  onCitationClick,
}: {
  message: CrossExamMessage;
  sourceMap: Map<string, SourceEntry>;
  onCitationClick: (evidenceId: string) => void;
}) {
  const isProsecution = message.agent === "prosecution";

  return (
    <div
      className={`flex ${
        isProsecution ? "justify-start" : "justify-end"
      }`}
      style={{ animation: "bubble-in 0.3s ease-out" }}
    >
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
          isProsecution
            ? "rounded-tl-sm border border-prosecution/20 bg-prosecution/15"
            : "rounded-tr-sm border border-defense/20 bg-defense/15"
        }`}
      >
        {/* Agent label */}
        <div
          className={`mb-1 flex items-center gap-1.5 text-m font-bold ${
            isProsecution ? "text-prosecution" : "text-defense"
          }`}
        >
          {isProsecution ? (
            <Sword className="h-5 w-5" />
          ) : (
            <Shield className="h-5 w-5" />
          )}
          {isProsecution ? "Prosecution" : "Defense"}
        </div>

        {/* Message text */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-court-text">
          <InlineText
            text={message.content}
            sourceMap={sourceMap}
            onCitationClick={onCitationClick}
          />
          {!message.done && (
            <span
              className={`ml-0.5 inline-block h-3.5 w-0.5 ${
                isProsecution
                  ? "bg-prosecution"
                  : "bg-defense"
              }`}
              style={{ animation: "typing-dot 1s infinite" }}
            />
          )}
        </p>
      </div>
    </div>
  );
}

function TypingIndicator({
  agent,
}: {
  agent: "defense" | "prosecution";
}) {
  const isProsecution = agent === "prosecution";

  return (
    <div
      className={`flex ${
        isProsecution ? "justify-start" : "justify-end"
      }`}
    >
      <div
        className={`flex items-center gap-1 rounded-2xl px-4 py-2.5 ${
          isProsecution
            ? "rounded-tl-sm bg-prosecution/10"
            : "rounded-tr-sm bg-defense/10"
        }`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isProsecution ? "bg-prosecution" : "bg-defense"
            }`}
            style={{
              animation: `typing-dot 1.4s infinite ${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
