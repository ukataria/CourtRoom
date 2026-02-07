import type { DebatePhase } from "../types";

interface PhaseIndicatorProps {
  phase: DebatePhase;
}

const PHASES: { key: DebatePhase; label: string }[] = [
  { key: "CASE_BRIEF", label: "Brief" },
  { key: "DISCOVERY", label: "Discovery" },
  { key: "DEFENSE_OPENING", label: "Defense" },
  { key: "PROSECUTION_OPENING", label: "Prosecution" },
  { key: "AWAITING_CROSS_EXAM", label: "Cross-Exam" },
  { key: "VERDICT", label: "Judge" },
];

export function PhaseIndicator({
  phase,
}: PhaseIndicatorProps) {
  const currentIndex = PHASES.findIndex((p) => {
    if (p.key === "AWAITING_CROSS_EXAM") {
      return (
        phase === "AWAITING_CROSS_EXAM" ||
        phase === "CROSS_EXAM_1" ||
        phase === "CROSS_EXAM_2"
      );
    }
    return p.key === phase;
  });

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-6 py-2">
      {PHASES.map((p, i) => {
        const isActive =
          p.key === phase ||
          (p.key === "AWAITING_CROSS_EXAM" &&
            (phase === "CROSS_EXAM_1" ||
              phase === "CROSS_EXAM_2"));
        const isPast = i < currentIndex;
        return (
          <div key={p.key} className="flex items-center">
            {i > 0 && (
              <div
                className={`mx-1 h-px w-4 ${
                  isPast
                    ? "bg-gold"
                    : "bg-court-border"
                }`}
              />
            )}
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1 text-base font-medium transition-colors ${
                isActive
                  ? "bg-gold/20 text-gold"
                  : isPast
                    ? "text-gold/60"
                    : "text-court-text-muted"
              }`}
            >
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
