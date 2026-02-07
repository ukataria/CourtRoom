import { useState } from "react";
import { Gavel, Hand, SendHorizonal } from "lucide-react";
import type { DebatePhase } from "../types";

interface InterventionBarProps {
  phase: DebatePhase;
  interruptPending: boolean;
  onInterrupt: () => void;
  onDismiss: () => void;
  onIntervene: (content: string) => void;
}

const INTERRUPTIBLE_PHASES: Set<DebatePhase> = new Set([
  "DEFENSE_OPENING",
  "PROSECUTION_OPENING",
]);

export function InterventionBar({
  phase,
  interruptPending,
  onInterrupt,
  onDismiss: _onDismiss,
  onIntervene,
}: InterventionBarProps) {
  const [input, setInput] = useState("");
  const isActive = INTERRUPTIBLE_PHASES.has(phase);

  if (!isActive && !interruptPending) return null;

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

  // Mode 1: Interrupt button
  if (!interruptPending) {
    return (
      <button
        onClick={onInterrupt}
        className="mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition-all hover:bg-gold/20 hover:shadow-lg hover:shadow-gold/20"
      >
        <Hand className="h-4 w-4" />
        Interrupt
      </button>
    );
  }

  // Mode 2: Input — stays until user submits
  return (
    <div className="mt-3 flex shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 shrink-0 text-gold" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Direct the court..."
          className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-court-panel px-3 py-2 text-sm text-court-text placeholder-court-text-muted outline-none transition-colors focus:border-gold"
          autoFocus
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!input.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-court-bg transition-all hover:shadow-lg hover:shadow-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SendHorizonal className="h-4 w-4" />
        Submit
      </button>
    </div>
  );
}
