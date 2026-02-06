import { useState } from "react";
import { Gavel, SendHorizonal } from "lucide-react";
import type { DebatePhase } from "../types";

interface InterventionBarProps {
  phase: DebatePhase;
  onIntervene: (content: string) => void;
}

const ACTIVE_PHASES: Set<DebatePhase> = new Set([
  "DEFENSE_OPENING",
  "PROSECUTION_OPENING",
  "CROSS_EXAM_1",
  "CROSS_EXAM_2",
  "DEFENSE_CLOSING",
  "PROSECUTION_CLOSING",
]);

export function InterventionBar({
  phase,
  onIntervene,
}: InterventionBarProps) {
  const [input, setInput] = useState("");
  const isActive = ACTIVE_PHASES.has(phase);

  if (!isActive) return null;

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onIntervene(trimmed);
    setInput("");
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="border-t border-gold/30 bg-court-surface px-6 py-3"
      style={{
        animation: "pulse-glow 3s infinite",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <Gavel className="h-5 w-5 shrink-0 text-gold" />
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Interject — redirect the court's attention..."
            className="w-full rounded-lg border border-gold/30 bg-court-panel px-4 py-2.5 text-sm text-court-text placeholder-court-text-muted outline-none transition-colors focus:border-gold"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-court-bg transition-all hover:shadow-lg hover:shadow-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizonal className="h-4 w-4" />
          Intervene
        </button>
      </div>
    </div>
  );
}
