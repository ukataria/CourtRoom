import { Scale, AlertCircle, RefreshCw } from "lucide-react";
import type { DecisiveEvidence } from "../types";

interface VerdictDisplayProps {
  ruling: string;
  confidence: number;
  decisiveEvidence: DecisiveEvidence[];
  unresolved: string[];
  flipConditions: string[];
}

export function VerdictDisplay({
  ruling,
  confidence,
  decisiveEvidence,
  unresolved,
  flipConditions,
}: VerdictDisplayProps) {
  return (
    <div
      className="mx-auto max-w-4xl px-6 py-8"
      style={{ animation: "fade-in 0.6s ease-out" }}
    >
      <div className="rounded-2xl border border-gold/30 bg-court-surface p-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <Scale className="mx-auto mb-3 h-10 w-10 text-gold" />
          <h2 className="text-2xl font-bold text-court-text">
            Verdict
          </h2>
          <div className="mt-2 inline-flex items-center rounded-full bg-gold/10 px-4 py-1">
            <span className="text-sm font-semibold text-gold">
              {confidence}% Confidence
            </span>
          </div>
        </div>

        {/* Ruling */}
        <div className="mb-8 rounded-xl border border-court-border bg-court-panel p-6">
          <p className="text-center text-lg leading-relaxed text-court-text">
            {ruling}
          </p>
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Decisive Evidence */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gold">
              <Scale className="h-3.5 w-3.5" />
              Decisive Evidence
            </h3>
            <div className="space-y-2">
              {decisiveEvidence.map((ev, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-court-border bg-court-panel p-3"
                >
                  <p className="text-sm font-medium text-court-text">
                    {ev.title}
                  </p>
                  <p className="mt-1 text-xs text-court-text-dim">
                    {ev.impact}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Unresolved */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-unknown">
              <AlertCircle className="h-3.5 w-3.5" />
              Unresolved
            </h3>
            <div className="space-y-2">
              {unresolved.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-unknown/20 bg-unknown/5 p-3"
                >
                  <p className="text-sm text-court-text-dim">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Flip Conditions */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-contested">
              <RefreshCw className="h-3.5 w-3.5" />
              Would Change Ruling
            </h3>
            <div className="space-y-2">
              {flipConditions.map((cond, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-contested/20 bg-contested/5 p-3"
                >
                  <p className="text-sm text-court-text-dim">
                    {cond}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
