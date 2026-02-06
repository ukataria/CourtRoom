import {
  Search,
  CheckCircle2,
  Loader2,
  BookOpen,
} from "lucide-react";
import type { ToolCallEvent } from "../types";

interface EvidenceTrailProps {
  toolCalls: ToolCallEvent[];
  researcherText: string;
  isResearchActive: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  brave_search: "Web Search",
  exa: "Semantic Search",
  search_papers: "Academic Search",
  get_paper_details: "Paper Details",
};

export function EvidenceTrail({
  toolCalls,
  researcherText,
  isResearchActive,
}: EvidenceTrailProps) {
  return (
    <div className="flex flex-col rounded-xl border border-court-border bg-court-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-court-border px-4 py-3">
        <BookOpen className="h-4 w-4 text-evidence" />
        <span className="text-sm font-semibold text-evidence">
          Evidence Trail
        </span>
        {isResearchActive && (
          <Loader2 className="h-3 w-3 animate-spin text-evidence" />
        )}
      </div>

      {/* Tool Calls Feed */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ minHeight: "300px", maxHeight: "60vh" }}
      >
        {toolCalls.length === 0 && !researcherText ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-court-text-muted">
            <Search className="h-6 w-6 opacity-40" />
            <span className="text-xs">
              Evidence will appear here
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCallEvent }) {
  const toolLabel =
    TOOL_ICONS[call.tool] ?? call.tool;
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
          {toolLabel}
        </span>
        <span className="text-xs text-court-text-muted">
          {call.agent}
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
          {call.result_id && (
            <span className="mt-1 inline-block rounded bg-evidence/10 px-1.5 py-0.5 font-mono text-xs text-evidence">
              {call.result_id}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
