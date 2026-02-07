import { useEffect, useMemo, useRef } from "react";
import {
  Shield,
  Sword,
  Gavel,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { EvidenceItem, ToolCallEvent, ValidationFlag } from "../types";

interface CourtPanelProps {
  role: "defense" | "prosecution";
  text: string;
  isActive: boolean;
  interrupted: boolean;
  confidence: number;
  validationFlags: ValidationFlag[];
  evidence: EvidenceItem[];
  toolCalls: ToolCallEvent[];
  onCitationClick: (evidenceId: string) => void;
}

const ROLE_CONFIG = {
  defense: {
    label: "Defense",
    icon: Shield,
    color: "text-defense",
    borderColor: "border-defense/30",
    bgActive: "bg-defense/5",
    barColor: "bg-defense",
    cardBorder: "border-defense/15",
    cardBg: "bg-defense/5",
    chipBg: "bg-defense/10",
    chipText: "text-defense",
    numberBg: "bg-defense/15",
    numberText: "text-defense",
  },
  prosecution: {
    label: "Prosecution",
    icon: Sword,
    color: "text-prosecution",
    borderColor: "border-prosecution/30",
    bgActive: "bg-prosecution/5",
    barColor: "bg-prosecution",
    cardBorder: "border-prosecution/15",
    cardBg: "bg-prosecution/5",
    chipBg: "bg-prosecution/10",
    chipText: "text-prosecution",
    numberBg: "bg-prosecution/15",
    numberText: "text-prosecution",
  },
} as const;

interface ParsedArgument {
  number: number;
  title: string;
  body: string;
}

function parseArguments(text: string): {
  preamble: string;
  arguments: ParsedArgument[];
  conclusion: string;
} {
  // Find all numbered points: "1." preceded by any boundary
  // (start, newline, period, colon, bracket, whitespace)
  // Must be sequential numbers to avoid false positives
  const allMatches: { index: number; num: number; contentStart: number }[] = [];
  const pattern = /(?:^|[.\]:\n]\s*)(\d+)\.\s+/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    allMatches.push({
      index: m.index,
      num: parseInt(m[1], 10),
      contentStart: m.index + m[0].length,
    });
  }

  // Filter to only sequential numbers (1, 2, 3... or starting from where we find 1)
  const sequential: typeof allMatches = [];
  let expected = 1;
  for (const match of allMatches) {
    if (match.num === expected) {
      sequential.push(match);
      expected++;
    }
  }

  if (sequential.length < 2) {
    return { preamble: text, arguments: [], conclusion: "" };
  }

  const preamble = text.slice(0, sequential[0].index).trim();
  const args: ParsedArgument[] = [];

  for (let i = 0; i < sequential.length; i++) {
    const cur = sequential[i];
    const contentEnd =
      i + 1 < sequential.length
        ? sequential[i + 1].index
        : text.length;
    const rawContent = text
      .slice(cur.contentStart, contentEnd)
      .trim();

    // Split title from body: use colon if present near the start,
    // otherwise take the first sentence
    const { title, body } = splitTitleBody(rawContent);
    args.push({ number: cur.num, title, body });
  }

  // Extract conclusion from last argument
  let conclusion = "";
  if (args.length > 0) {
    const lastArg = args[args.length - 1];
    const markers = [
      "in conclusion",
      "in sum,",
      "to summarize",
      "in summary",
      "to conclude",
      "thus,",
      "therefore,",
      "overall,",
    ];
    for (const marker of markers) {
      const idx = lastArg.body
        .toLowerCase()
        .lastIndexOf(marker);
      if (idx !== -1) {
        const before = lastArg.body.slice(0, idx);
        const lastPeriod = before.lastIndexOf(".");
        const splitIdx =
          lastPeriod !== -1 ? lastPeriod + 1 : idx;
        conclusion = lastArg.body.slice(splitIdx).trim();
        lastArg.body = lastArg.body
          .slice(0, splitIdx)
          .trim();
        break;
      }
    }
  }

  return { preamble, arguments: args, conclusion };
}

function splitTitleBody(content: string): {
  title: string;
  body: string;
} {
  // If there's a colon within the first ~80 chars, use it
  const colonIdx = content.indexOf(":");
  if (colonIdx > 0 && colonIdx < 80) {
    return {
      title: content.slice(0, colonIdx).trim(),
      body: content.slice(colonIdx + 1).trim(),
    };
  }

  // Otherwise take the first sentence (up to first period followed by space)
  const sentenceEnd = content.search(/\.\s/);
  if (sentenceEnd > 0 && sentenceEnd < 120) {
    return {
      title: content.slice(0, sentenceEnd).trim(),
      body: content.slice(sentenceEnd + 1).trim(),
    };
  }

  // Fallback: first 8 words
  const words = content.split(/\s+/);
  const cut = Math.min(8, words.length);
  return {
    title: words.slice(0, cut).join(" "),
    body: words.slice(cut).join(" "),
  };
}

export function CourtPanel({
  role,
  text,
  isActive,
  interrupted,
  confidence,
  validationFlags,
  evidence,
  toolCalls,
  onCitationClick,
}: CourtPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [text]);

  const agentFlags = validationFlags.filter(
    (f) => f.agent === role
  );

  const parsed = useMemo(() => parseArguments(text), [text]);
  const hasStructure = parsed.arguments.length > 0;

  // Build lookup: tool ID → evidence index (1-based) + original ID
  const sourceMap = useMemo(() => {
    const map = new Map<string, { index: number; evidenceId: string }>();
    for (let i = 0; i < evidence.length; i++) {
      map.set(evidence[i].id, { index: i + 1, evidenceId: evidence[i].id });
    }
    for (const tc of toolCalls) {
      if (tc.result_id && !map.has(tc.result_id)) {
        // Try matching by result_id to an evidence item
        const evMatch = evidence.find((ev) => ev.id === tc.result_id);
        if (evMatch) {
          const existing = map.get(evMatch.id);
          if (existing) map.set(tc.result_id, existing);
        }
      }
    }
    return map;
  }, [evidence, toolCalls]);

  return (
    <div
      className={`flex h-full flex-col rounded-xl border ${
        isActive
          ? `${config.borderColor} ${config.bgActive}`
          : "border-court-border bg-court-surface"
      } transition-colors duration-300`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-court-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span
            className={`text-sm font-semibold ${config.color}`}
          >
            {config.label}
          </span>
          {isActive && (
            <span className="flex items-center gap-1 text-xs text-court-text-muted">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${config.barColor}`}
                style={{
                  animation: "typing-dot 1.4s infinite",
                }}
              />
              Speaking...
            </span>
          )}
          {interrupted && (
            <span className="flex items-center gap-1 rounded-md bg-gold/10 px-2 py-0.5 text-xs text-gold">
              <Gavel className="h-3 w-3" />
              Interrupted
            </span>
          )}
        </div>
        {hasStructure && !isActive && (
          <span className="text-xs text-court-text-muted">
            {parsed.arguments.length} arguments
          </span>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ minHeight: "300px", maxHeight: "60vh" }}
      >
        {text ? (
          hasStructure ? (
            <StructuredView
              parsed={parsed}
              config={config}
              isActive={isActive}
              sourceMap={sourceMap}
              onCitationClick={onCitationClick}
            />
          ) : (
            <div className="px-1 text-sm leading-relaxed text-court-text">
              <InlineText text={text} sourceMap={sourceMap} onCitationClick={onCitationClick} />
              {isActive && (
                <BlinkingCursor color={config.color} />
              )}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-court-text-muted">
            {isActive
              ? "Preparing argument..."
              : "Awaiting turn..."}
          </div>
        )}
      </div>

      {/* Validation Flags */}
      {agentFlags.length > 0 && (
        <div className="border-t border-court-border px-4 py-2">
          {agentFlags.map((flag, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1 text-xs"
            >
              <AlertTriangle
                className={`mt-0.5 h-3 w-3 shrink-0 ${
                  flag.status === "unsupported"
                    ? "text-contested"
                    : "text-gold"
                }`}
              />
              <span className="text-court-text-dim">
                {flag.claim}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Confidence Bar */}
      <div className="border-t border-court-border px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-court-text-muted">
            Confidence
          </span>
          <span
            className={`font-mono font-semibold ${config.color}`}
          >
            {confidence}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-court-panel">
          <div
            className={`h-full rounded-full ${config.barColor} transition-all duration-700 ease-out`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type SourceEntry = { index: number; evidenceId: string };

function StructuredView({
  parsed,
  config,
  isActive,
  sourceMap,
  onCitationClick,
}: {
  parsed: ReturnType<typeof parseArguments>;
  config: (typeof ROLE_CONFIG)[keyof typeof ROLE_CONFIG];
  isActive: boolean;
  sourceMap: Map<string, SourceEntry>;
  onCitationClick: (evidenceId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {/* Preamble - shown as a subtle intro */}
      {parsed.preamble && (
        <p className="px-1 text-xs leading-relaxed text-court-text-muted">
          <InlineText text={parsed.preamble} sourceMap={sourceMap} onCitationClick={onCitationClick} />
        </p>
      )}

      {/* Argument Cards */}
      {parsed.arguments.map((arg, i) => (
        <div
          key={i}
          className={`rounded-lg border ${config.cardBorder} ${config.cardBg} p-3`}
          style={{
            animation: `fade-in 0.3s ease-out ${i * 0.05}s both`,
          }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${config.numberBg} text-xs font-bold ${config.numberText}`}
            >
              {arg.number}
            </span>
            <h4
              className={`text-xs font-semibold ${config.chipText}`}
            >
              {arg.title}
            </h4>
          </div>
          <p className="text-xs leading-relaxed text-court-text-dim">
            <InlineText text={arg.body} sourceMap={sourceMap} onCitationClick={onCitationClick} />
          </p>
        </div>
      ))}

      {/* Conclusion */}
      {parsed.conclusion && (
        <div className="mt-1 flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/5 p-3">
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
          <p className="text-xs font-medium leading-relaxed text-court-text">
            <InlineText text={parsed.conclusion} sourceMap={sourceMap} onCitationClick={onCitationClick} />
          </p>
        </div>
      )}

      {isActive && (
        <BlinkingCursor color={config.color} />
      )}
    </div>
  );
}

function InlineText({
  text,
  sourceMap,
  onCitationClick,
}: {
  text: string;
  sourceMap: Map<string, SourceEntry>;
  onCitationClick: (evidenceId: string) => void;
}) {
  const renderCitation = (id: string, key: string) => {
    const entry = sourceMap.get(id);
    if (!entry) return null;

    return (
      <button
        key={key}
        type="button"
        onClick={() => onCitationClick(entry.evidenceId)}
        className="mx-0.5 inline-flex cursor-pointer items-center rounded bg-evidence/15 px-1.5 py-0.5 align-text-bottom font-mono text-[10px] font-bold text-evidence transition-colors hover:bg-evidence/30"
        title="Jump to evidence"
      >
        [{entry.index}]
      </button>
    );
  };

  const parts = text.split(/(\[TOOL:[^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("[TOOL:")) {
          const id = part.slice(6, -1);
          return renderCitation(id, String(i));
        }
        // Also handle bare tool_XXXX references (no brackets)
        const bareToolParts = part.split(
          /(tool_[a-f0-9]{4,8})/gi
        );
        if (bareToolParts.length > 1) {
          return bareToolParts.map((sub, j) => {
            if (/^tool_[a-f0-9]{4,8}$/i.test(sub)) {
              return renderCitation(sub, `${i}-${j}`);
            }
            return <span key={`${i}-${j}`}>{sub}</span>;
          });
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function BlinkingCursor({ color }: { color: string }) {
  return (
    <span
      className={`ml-0.5 inline-block h-4 w-0.5 ${color.replace("text-", "bg-")}`}
      style={{
        animation: "typing-dot 1s infinite",
      }}
    />
  );
}
