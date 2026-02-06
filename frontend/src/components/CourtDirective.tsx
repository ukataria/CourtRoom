import { Gavel } from "lucide-react";

interface CourtDirectiveProps {
  directives: string[];
}

export function CourtDirective({
  directives,
}: CourtDirectiveProps) {
  if (directives.length === 0) return null;

  const latest = directives[directives.length - 1];

  return (
    <div
      className="border-b border-gold/30 bg-gold/5 px-6 py-3"
      style={{ animation: "slide-down 0.4s ease-out" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20">
          <Gavel className="h-4 w-4 text-gold" />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-gold">
            Court Directive
          </span>
          <p className="text-sm text-court-text">
            &ldquo;{latest}&rdquo;
          </p>
        </div>
        {directives.length > 1 && (
          <span className="ml-auto rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">
            +{directives.length - 1} prior
          </span>
        )}
      </div>
    </div>
  );
}
