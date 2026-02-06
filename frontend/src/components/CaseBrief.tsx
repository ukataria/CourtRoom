import { FileText } from "lucide-react";

interface CaseBriefProps {
  axes: string[];
  summary: string;
}

export function CaseBrief({ axes, summary }: CaseBriefProps) {
  return (
    <div
      className="border-b border-court-border bg-court-surface px-6 py-4"
      style={{ animation: "slide-down 0.4s ease-out" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex items-start gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10">
            <FileText className="h-4 w-4 text-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gold">
              Case Brief
            </h2>
            <p className="mb-3 text-sm leading-relaxed text-court-text-dim">
              {summary}
            </p>
            <div className="flex flex-wrap gap-2">
              {axes.map((axis, i) => (
                <span
                  key={i}
                  className="rounded-md border border-court-border bg-court-panel px-3 py-1 text-xs font-medium text-court-text"
                >
                  {axis}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
