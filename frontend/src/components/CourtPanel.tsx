import { useEffect, useRef } from "react";
import {
  Shield,
  Sword,
  Gavel,
  AlertTriangle,
} from "lucide-react";
import type { ValidationFlag } from "../types";

interface CourtPanelProps {
  role: "defense" | "prosecution";
  text: string;
  isActive: boolean;
  interrupted: boolean;
  confidence: number;
  validationFlags: ValidationFlag[];
}

const ROLE_CONFIG = {
  defense: {
    label: "Defense",
    icon: Shield,
    color: "text-defense",
    borderColor: "border-defense/30",
    bgActive: "bg-defense/5",
    barColor: "bg-defense",
    accentDim: "text-defense-dim",
  },
  prosecution: {
    label: "Prosecution",
    icon: Sword,
    color: "text-prosecution",
    borderColor: "border-prosecution/30",
    bgActive: "bg-prosecution/5",
    barColor: "bg-prosecution",
    accentDim: "text-prosecution-dim",
  },
} as const;

export function CourtPanel({
  role,
  text,
  isActive,
  interrupted,
  confidence,
  validationFlags,
}: CourtPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const agentFlags = validationFlags.filter(
    (f) => f.agent === role
  );

  return (
    <div
      className={`flex flex-col rounded-xl border ${
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
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ minHeight: "300px", maxHeight: "60vh" }}
      >
        {text ? (
          <div className="text-sm leading-relaxed text-court-text">
            <FormattedText text={text} />
            {isActive && <BlinkingCursor color={config.color} />}
          </div>
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
          <span className={`font-mono font-semibold ${config.color}`}>
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

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\[TOOL:[^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("[TOOL:")) {
          const id = part.slice(6, -1);
          return (
            <span
              key={i}
              className="mx-0.5 inline-flex items-center rounded bg-evidence/10 px-1.5 py-0.5 text-xs font-mono text-evidence"
              title={`Evidence: ${id}`}
            >
              {id}
            </span>
          );
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
