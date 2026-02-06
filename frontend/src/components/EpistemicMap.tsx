import {
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";

interface EpistemicMapProps {
  confirmed: string[];
  contested: string[];
  unknown: string[];
}

export function EpistemicMap({
  confirmed,
  contested,
  unknown,
}: EpistemicMapProps) {
  return (
    <div
      className="mx-auto max-w-4xl px-6 py-8"
      style={{ animation: "fade-in 0.6s ease-out" }}
    >
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-court-text">
          Epistemic Map
        </h2>
        <p className="mt-1 text-sm text-court-text-dim">
          What the evidence landscape looks like
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Confirmed */}
        <div className="rounded-xl border border-confirmed/30 bg-confirmed/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-confirmed" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-confirmed">
              Confirmed
            </h3>
          </div>
          <div className="space-y-2">
            {confirmed.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-confirmed/20 bg-court-surface p-3"
                style={{
                  animation: `fade-in 0.4s ease-out ${i * 0.1}s both`,
                }}
              >
                <p className="text-sm text-court-text">
                  {item}
                </p>
              </div>
            ))}
            {confirmed.length === 0 && (
              <p className="text-xs text-court-text-muted">
                No confirmed findings
              </p>
            )}
          </div>
        </div>

        {/* Contested */}
        <div className="rounded-xl border border-contested/30 bg-contested/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-contested" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-contested">
              Contested
            </h3>
          </div>
          <div className="space-y-2">
            {contested.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-contested/20 bg-court-surface p-3"
                style={{
                  animation: `fade-in 0.4s ease-out ${i * 0.1}s both`,
                }}
              >
                <p className="text-sm text-court-text">
                  {item}
                </p>
              </div>
            ))}
            {contested.length === 0 && (
              <p className="text-xs text-court-text-muted">
                No contested findings
              </p>
            )}
          </div>
        </div>

        {/* Unknown */}
        <div className="rounded-xl border border-unknown/30 bg-unknown/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-unknown" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-unknown">
              Unknown
            </h3>
          </div>
          <div className="space-y-2">
            {unknown.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-unknown/20 bg-court-surface p-3"
                style={{
                  animation: `fade-in 0.4s ease-out ${i * 0.1}s both`,
                }}
              >
                <p className="text-sm text-court-text">
                  {item}
                </p>
              </div>
            ))}
            {unknown.length === 0 && (
              <p className="text-xs text-court-text-muted">
                No unknown areas
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
