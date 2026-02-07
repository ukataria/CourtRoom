import { useEffect, useRef, useState } from "react";
import {
  Search,
  Loader2,
  BookOpen,
  Globe,
  GraduationCap,
  FileText,
  ExternalLink,
  ChevronDown,
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

  // Auto-scroll to bottom when new evidence arrives
  const prevCountRef = useRef(evidence.length);
  useEffect(() => {
    if (
      evidence.length > prevCountRef.current &&
      scrollContainerRef.current
    ) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevCountRef.current = evidence.length;
  }, [evidence.length]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-court-border bg-court-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-court-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-evidence" />
          <span className="text-base font-semibold text-evidence">
            Evidence Trail
          </span>
          {isResearchActive && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-evidence" />
          )}
        </div>
        {evidence.length > 0 && (
          <span className="text-sm text-court-text-muted">
            {evidence.length} sources
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
      >
        {!hasContent ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-court-text-muted">
            <Search className="h-6 w-6 opacity-40" />
            <span className="text-sm">
              Evidence will appear here
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {evidence.map((ev, i) => (
              <EvidenceCard
                key={ev.id}
                evidence={ev}
                index={i + 1}
                isHighlighted={highlightedId === ev.id}
              />
            ))}

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
  const [expanded, setExpanded] = useState(false);
  const config =
    SOURCE_TYPE_CONFIG[evidence.source_type] ??
    SOURCE_TYPE_CONFIG.web;
  const Icon = config.icon;

  // Auto-expand when highlighted via citation click
  useEffect(() => {
    if (isHighlighted) setExpanded(true);
  }, [isHighlighted]);

  return (
    <div
      data-evidence-id={evidence.id}
      className={`overflow-hidden rounded-lg transition-all duration-300 ${
        expanded
          ? "border border-court-border bg-court-panel mb-4"
          : isHighlighted
            ? "border border-evidence bg-evidence/10 ring-1 ring-evidence/40"
            : "border border-transparent"
      }`}
      style={{
        animation: `evidence-whoosh 0.4s ease-out ${index * 0.15}s both`,
      }}
    >
      {/* Clickable row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-start gap-2.5 px-2 py-1.5 text-left transition-colors ${
          expanded ? "" : "hover:bg-court-border/10 rounded-lg"
        }`}
      >
        {/* Evidence ID badge */}
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-bold text-evidence">
          {index}
        </span>

        {/* Title — clamp to 2 lines when collapsed, full when open */}
        <p className={`min-w-0 flex-1 text-sm text-court-text ${
          expanded ? "" : "line-clamp-3"
        }`}>
          {evidence.title}
        </p>

        <ChevronDown
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-court-text-muted transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Collapsible body */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-2.5 pt-1">
            <p className="pl-7.5 text-xs leading-relaxed text-court-text-dim">
              {evidence.snippet}
            </p>

            <div className="mt-2 flex items-center justify-between pl-7.5">
              <span className="text-xs text-court-text-muted">
                {config.label}
                {"\u00B7"}
                {evidence.source}
                {evidence.date ? `\u00B7${evidence.date}` : ""}
              </span>
              {evidence.url && (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-xs text-evidence hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Source
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCallEvent }) {
  const isPending = call.status === "pending";

  return (
    <div
      className="rounded-lg border border-court-border bg-court-panel p-3"
      style={{ animation: "evidence-whoosh 0.4s ease-out" }}
    >
      <div className="mb-1 flex items-center gap-2">
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-evidence" />
        ) : (
          <span className="font-mono text-xs font-bold text-confirmed">
            done
          </span>
        )}
        <span className="text-sm font-medium text-evidence">
          {call.tool}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-court-text-dim">
        {call.query}
      </p>
      {call.snippet && (
        <div className="mt-2 rounded border border-court-border bg-court-bg/50 p-2">
          <p className="text-sm text-court-text-dim">
            {call.snippet}
          </p>
        </div>
      )}
    </div>
  );
}
