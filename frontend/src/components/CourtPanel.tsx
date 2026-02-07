import { useEffect, useMemo, useRef, useState } from "react";
import {
  Shield,
  Sword,
  Gavel,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { EvidenceItem, ToolCallEvent, ValidationFlag } from "../types";

// Minimized animations (Just a simple blink and a slow fade)
const ANIMATION_STYLES = `
  @keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  @keyframes slow-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

interface CourtPanelProps {
  role: "defense" | "prosecution";
  text: string;
  isActive: boolean;
  interrupted: boolean;
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
    cardBorder: "border-defense/30",
    cardBg: "bg-defense/10",
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
    cardBg: "bg-prosecution/10",
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

interface ParsedOpening {
  confidence: number | null;
  arguments: ParsedArgument[];
  conclusion: string;
}

function parseArguments(text: string): ParsedOpening {
  // Extract CONFIDENCE: N from the start
  let confidence: number | null = null;
  let body = text;
  const confMatch = body.match(/^CONFIDENCE:\s*(\d+)/);
  if (confMatch) {
    confidence = parseInt(confMatch[1], 10);
    body = body.slice(confMatch[0].length).trim();
  }

  // Extract CONCLUSION: ... from the end
  let conclusion = "";
  const concIdx = body.indexOf("CONCLUSION:");
  if (concIdx !== -1) {
    conclusion = body.slice(concIdx + "CONCLUSION:".length).trim();
    body = body.slice(0, concIdx).trim();
  }

  // Parse numbered arguments: "N. Title: Body"
  const argPattern = /(?:^|\n)\s*(\d+)\.\s+/g;
  const matches: { index: number; num: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = argPattern.exec(body)) !== null) {
    matches.push({
      index: m.index,
      num: parseInt(m[1], 10),
      start: m.index + m[0].length,
    });
  }

  // Keep only sequential (1, 2, 3...)
  const sequential: typeof matches = [];
  let expected = 1;
  for (const match of matches) {
    if (match.num === expected) {
      sequential.push(match);
      expected++;
    }
  }

  if (sequential.length === 0) {
    return { confidence, arguments: [], conclusion };
  }

  const args: ParsedArgument[] = [];
  for (let i = 0; i < sequential.length; i++) {
    const cur = sequential[i];
    const end =
      i + 1 < sequential.length
        ? sequential[i + 1].index
        : body.length;
    const raw = body.slice(cur.start, end).trim();
    const { title, body: argBody } = splitTitleBody(raw);
    args.push({ number: cur.num, title, body: argBody });
  }

  return { confidence, arguments: args, conclusion };
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
  validationFlags,
  evidence,
  toolCalls,
  onCitationClick,
}: CourtPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Simple auto-scroll logic
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShouldAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (shouldAutoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [text, shouldAutoScroll]);

  const agentFlags = validationFlags.filter((f) => f.agent === role);
  const parsed = useMemo(() => parseArguments(text), [text]);
  const hasStructure = parsed.arguments.length > 0;

  const sourceMap = useMemo(() => {
    const map = new Map<string, { index: number; evidenceId: string }>();
    for (let i = 0; i < evidence.length; i++) {
      map.set(evidence[i].id, { index: i + 1, evidenceId: evidence[i].id });
    }
    for (const tc of toolCalls) {
      if (tc.result_id && !map.has(tc.result_id)) {
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
    <>
      <style>{ANIMATION_STYLES}</style>
      <div
        className={`flex h-full flex-col rounded-xl border transition-colors duration-300 ${
          isActive
            ? `${config.borderColor} ${config.bgActive}`
            : "border-court-border bg-court-surface"
        }`}
      >
        {/* Header */}
        <div className="border-b border-court-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${config.color}`} />
              <span className={`text-base font-semibold ${config.color}`}>
                {config.label}
              </span>
              {isActive && (
                <span className="ml-2 text-xs text-court-text-muted" style={{ animation: "slow-pulse 2s infinite" }}>
                  Speaking...
                </span>
              )}
              {interrupted && (
                <span className="flex items-center gap-1 rounded bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold border border-gold/20">
                  <Gavel className="h-3 w-3" />
                  Interrupted
                </span>
              )}
            </div>
            {hasStructure && !isActive && (
              <span className="text-xs text-court-text-muted">
                {parsed.arguments.length} args
              </span>
            )}
          </div>
          
          {/* Simple Confidence Bar */}
          {parsed.confidence !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-court-panel">
                <div
                  className={`h-full rounded-full ${config.barColor} transition-all duration-300`}
                  style={{ width: `${parsed.confidence}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono ${config.color}`}>
                {parsed.confidence}%
              </span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ minHeight: "300px" }}
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
              <div className="text-sm leading-relaxed text-court-text whitespace-pre-wrap">
                <InlineText text={text} sourceMap={sourceMap} onCitationClick={onCitationClick} />
                {isActive && <Cursor color={config.color} />}
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-court-text-muted opacity-50">
              {isActive ? "Thinking..." : "Awaiting turn..."}
            </div>
          )}
        </div>

        {/* Validation Flags */}
        {agentFlags.length > 0 && (
          <div className="border-t border-court-border px-4 py-2 bg-black/5">
            {agentFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 py-1 text-[10px]">
                <AlertTriangle
                  className={`mt-0.5 h-3 w-3 shrink-0 ${
                    flag.status === "unsupported" ? "text-contested" : "text-gold"
                  }`}
                />
                <span className="text-court-text-dim">{flag.claim}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export type SourceEntry = { index: number; evidenceId: string };

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
    <div className="space-y-4">
      {/* Argument Cards */}
      {parsed.arguments.map((arg, i) => {
        // We only show the cursor if this is the LAST argument AND we aren't writing the conclusion yet
        const showCursor = isActive;

        return (
          <div
            key={i}
            className={`rounded-md border ${config.cardBorder} ${config.cardBg} p-3`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${config.numberBg} text-xs font-bold ${config.numberText}`}
              >
                {arg.number}
              </span>
              <h4 className={`text-xs font-semibold uppercase tracking-wide ${config.chipText}`}>
                {arg.title}
              </h4>
            </div>
            <div className="text-sm leading-relaxed text-court-text-dim">
              <InlineText text={arg.body} sourceMap={sourceMap} onCitationClick={onCitationClick} />
              {showCursor && <Cursor color={config.color} />}
            </div>
          </div>
        );
      })}

      {/* Conclusion */}
      {parsed.conclusion && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-gold/20 bg-gold/5 p-3">
          <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-gold" />
          <div className="text-sm font-medium leading-relaxed text-court-text italic">
            <InlineText text={parsed.conclusion} sourceMap={sourceMap} onCitationClick={onCitationClick} />
            {isActive && <Cursor color={config.color} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function InlineText({
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
        className="mx-0.5 inline-block rounded hover:bg-white/10 px-0.5 font-mono text-[10px] font-bold text-evidence transition-colors"
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
        
        const bareToolParts = part.split(/\[?(tool_[a-f0-9]{4,8})\]?/gi);
        
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

function Cursor({ color }: { color: string }) {
  // A simple, classic terminal pipe cursor.
  // "inline-block" ensures it sits right next to the last letter.
  return (
    <span
      className={`ml-0.5 inline-block h-3.5 w-0.5 align-middle ${color.replace("text-", "bg-")}`}
      style={{ animation: "cursor-blink 1s step-end infinite" }}
    />
  );
}