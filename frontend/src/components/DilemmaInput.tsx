import { useState } from "react";
import { Scale, ArrowRight, Sparkles } from "lucide-react";

const EXAMPLE_CHIPS = [
  "Should CMU require AI ethics courses?",
  "Should I take a remote job offer over in-office?",
  "Should our company adopt open-source AI models?",
  "Is universal basic income viable for the US?",
];

interface DilemmaInputProps {
  onSubmit: (dilemma: string) => void;
  isDemo?: boolean;
}

export function DilemmaInput({
  onSubmit,
  isDemo,
}: DilemmaInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        {/* Logo / Title */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Scale className="h-10 w-10 text-gold" />
            <h1 className="text-5xl font-bold tracking-tight text-court-text">
              Courtroom
            </h1>
          </div>
          <p className="text-lg text-court-text-dim">
            Adversarial epistemology — AI agents competing on
            evidence quality, not rhetoric.
          </p>
          {isDemo && (
            <p className="mt-3 text-sm text-evidence">
              Demo mode — runs with mock data (no backend
              needed)
            </p>
          )}
        </div>

        {/* Input Area */}
        <div className="rounded-2xl border border-court-border bg-court-surface p-6">
          <label className="mb-3 block text-sm font-medium text-court-text-dim">
            I need to decide whether to...
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., require AI ethics courses in the CS curriculum"
            className="w-full resize-none rounded-xl border border-court-border bg-court-panel px-4 py-3 text-lg text-court-text placeholder-court-text-muted outline-none transition-colors focus:border-gold"
            rows={3}
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-court-text-muted">
              <Sparkles className="h-3 w-3" />
              <span>Press Enter to submit</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-court-bg transition-all hover:shadow-lg hover:shadow-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open Court
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Example Chips */}
        <div className="mt-6">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-court-text-muted">
            Try an example
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="rounded-full border border-court-border bg-court-panel px-4 py-2 text-sm text-court-text-dim transition-colors hover:border-gold/50 hover:text-court-text"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
