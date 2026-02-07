import { useEffect, useRef } from "react";
import {
  Search,
  CheckCircle2,
  Loader2,
  BookOpen,
  Globe,
  GraduationCap,
  FileText,
  ExternalLink,
} from "lucide-react";
import type { EvidenceItem, ToolCallEvent } from "../types";

interface EvidenceTrailProps {
  toolCalls: ToolCallEvent[];
  evidence: EvidenceItem[];
  researcherText: string;
  isResearchActive: boolean;
  highlightedId: string | null;
}

const SOURCE_TYPE_CONFIG: Record<
  string,
  { icon: typeof Globe; label: string }
> = {
  web: { icon: Globe, label: "Web" },
  academic: { icon: GraduationCap, label: "Academic" },
  news: { icon: FileText, label: "News" },
};

export function EvidenceTrail({
  toolCalls,
  evidence,
  researcherText,
  isResearchActive,
  highlightedId,
}: EvidenceTrailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasContent =
    evidence.length > 0 ||
    toolCalls.length > 0 ||
    !!researcherText;

  // Scroll to highlighted evidence card
  useEffect(() => {
    if (!highlightedId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(
      `[data-evidence-id="${highlightedId}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedId]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-court-border bg-court-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-court-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-evidence" />
          <span className="text-sm font-semibold text-evidence">
            Evidence Trail
          </span>
          {isResearchActive && (
            <Loader2 className="h-3 w-3 animate-spin text-evidence" />
          )}
        </div>
        {evidence.length > 0 && (
          <span className="text-xs text-court-text-muted">
            {evidence.length} sources
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ minHeight: "300px", maxHeight: "60vh" }}
      >
        {!hasContent ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-court-text-muted">
            <Search className="h-6 w-6 opacity-40" />
            <span className="text-xs">
              Evidence will appear here
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Evidence items from backend */}
            {evidence.map((ev, i) => (
              <EvidenceCard
                key={ev.id}
                evidence={ev}
                index={i + 1}
                isHighlighted={highlightedId === ev.id}
              />
            ))}

            {/* Tool calls (legacy / fallback) */}
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceCard({
  evidence,
  index,
  isHighlighted,
}: {
  evidence: EvidenceItem;
  index: number;
  isHighlighted: boolean;
}) {
  const config =
    SOURCE_TYPE_CONFIG[evidence.source_type] ??
    SOURCE_TYPE_CONFIG.web;
  const Icon = config.icon;

  return (
    <div
      data-evidence-id={evidence.id}
      className={`rounded-lg border p-3 transition-all duration-500 ${
        isHighlighted
          ? "border-evidence bg-evidence/10 ring-1 ring-evidence/40"
          : "border-court-border bg-court-panel"
      }`}
      style={{ animation: "fade-in 0.3s ease-out" }}
    >
      {/* Title + source type + index badge */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-evidence/15 font-mono text-[9px] font-bold text-evidence">
            {index}
          </span>
          <CheckCircle2 className="h-3 w-3 shrink-0 text-confirmed" />
          <p className="text-xs font-medium leading-snug text-court-text">
            {evidence.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Icon className="h-3 w-3 text-court-text-muted" />
          <span className="text-[10px] text-court-text-muted">
            {config.label}
          </span>
        </div>
      </div>

      {/* Snippet */}
      <p className="text-xs leading-relaxed text-court-text-dim">
        {evidence.snippet}
      </p>

      {/* Footer: source + date */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-court-text-muted">
          {evidence.source}
          {evidence.date ? ` \u00B7 ${evidence.date}` : ""}
        </span>
        {evidence.url && (
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-evidence hover:underline"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            Source
          </a>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCallEvent }) {
  const isPending = call.status === "pending";

  return (
    <div
      className="rounded-lg border border-court-border bg-court-panel p-3"
      style={{ animation: "fade-in 0.3s ease-out" }}
    >
      <div className="mb-1 flex items-center gap-2">
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin text-evidence" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-confirmed" />
        )}
        <span className="text-xs font-medium text-evidence">
          {call.tool}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-court-text-dim">
        {call.query}
      </p>
      {call.snippet && (
        <div className="mt-2 rounded border border-court-border bg-court-bg/50 p-2">
          <p className="text-xs text-court-text-dim">
            {call.snippet}
          </p>
        </div>
      )}
    </div>
  );
}
