import { Shield, Sword } from "lucide-react";

interface ConfidenceMeterProps {
  defense: number;
  prosecution: number;
}

export function ConfidenceMeter({
  defense,
  prosecution,
}: ConfidenceMeterProps) {
  return (
    <div className="border-b border-court-border bg-court-surface/50 px-6 py-2">
      <div className="mx-auto flex max-w-7xl items-center gap-4">
        {/* Defense side */}
        <div className="flex flex-1 items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-defense" />
          <span className="text-xs font-semibold text-defense">
            {defense}%
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-court-panel">
            <div
              className="h-full rounded-full bg-defense transition-all duration-700 ease-out"
              style={{ width: `${defense}%` }}
            />
          </div>
        </div>

        <span className="text-xs font-bold text-court-text-muted">
          VS
        </span>

        {/* Prosecution side */}
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-court-panel">
            <div
              className="ml-auto h-full rounded-full bg-prosecution transition-all duration-700 ease-out"
              style={{ width: `${prosecution}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-prosecution">
            {prosecution}%
          </span>
          <Sword className="h-3.5 w-3.5 text-prosecution" />
        </div>
      </div>
    </div>
  );
}
