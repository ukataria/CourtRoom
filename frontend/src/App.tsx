import { Scale, Wifi, WifiOff, Play } from "lucide-react";
import { useDebateSocket } from "./hooks/useDebateSocket";
import { useDemoMode } from "./hooks/useDemoMode";
import { DilemmaInput } from "./components/DilemmaInput";
import { CaseBrief } from "./components/CaseBrief";
import { CourtPanel } from "./components/CourtPanel";
import { EvidenceTrail } from "./components/EvidenceTrail";
import { InterventionBar } from "./components/InterventionBar";
import { CourtDirective } from "./components/CourtDirective";
import { ConfidenceMeter } from "./components/ConfidenceMeter";
import { VerdictDisplay } from "./components/VerdictDisplay";
import { EpistemicMap } from "./components/EpistemicMap";
import { PhaseIndicator } from "./components/PhaseIndicator";
import "./index.css";

const WS_URL =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/session";

function App() {
  const ws = useDebateSocket(WS_URL);
  const demo = useDemoMode();

  // Use live WebSocket when connected, fall back to demo
  const useDemo = !ws.connected;
  const { state, startDebate, sendIntervention } = useDemo
    ? demo
    : ws;
  const connected = ws.connected;

  const isIntake = state.phase === "INTAKE";
  const showCourtroom = !isIntake;

  return (
    <div className="flex min-h-screen flex-col bg-court-bg">
      {/* INTAKE: Dilemma Input */}
      {isIntake && (
        <DilemmaInput
          onSubmit={startDebate}
          isDemo={useDemo}
        />
      )}

      {/* COURTROOM: Main Layout */}
      {showCourtroom && (
        <>
          {/* Top Bar */}
          <header className="flex items-center justify-between border-b border-court-border bg-court-surface px-6 py-3">
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-gold" />
              <h1 className="text-lg font-bold text-court-text">
                Courtroom
              </h1>
              {useDemo && (
                <span className="flex items-center gap-1 rounded-full bg-evidence/10 px-2.5 py-0.5 text-xs font-medium text-evidence">
                  <Play className="h-3 w-3" />
                  Demo Mode
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <PhaseIndicator phase={state.phase} />
              <div className="flex items-center gap-1.5">
                {connected ? (
                  <Wifi className="h-3.5 w-3.5 text-confirmed" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-unknown" />
                )}
                <span className="text-xs text-court-text-muted">
                  {connected ? "Live" : "Offline"}
                </span>
              </div>
            </div>
          </header>

          {/* Court Directive Banner */}
          <CourtDirective
            directives={state.courtDirectives}
          />

          {/* Case Brief Banner */}
          {state.caseBrief && (
            <CaseBrief
              axes={state.caseBrief.axes}
              summary={state.caseBrief.summary}
            />
          )}

          {/* Confidence Meter */}
          <ConfidenceMeter
            defense={state.confidence.defense}
            prosecution={state.confidence.prosecution}
          />

          {/* Three-Panel Layout */}
          <main className="flex flex-1 gap-4 overflow-hidden p-4">
            {/* Defense Panel */}
            <div className="flex-1">
              <CourtPanel
                role="defense"
                text={state.defenseText}
                isActive={state.activeAgent === "defense"}
                interrupted={state.defenseInterrupted}
                confidence={state.confidence.defense}
                validationFlags={state.validationFlags}
              />
            </div>

            {/* Evidence Trail */}
            <div className="w-80 shrink-0">
              <EvidenceTrail
                toolCalls={state.toolCalls}
                researcherText={state.researcherText}
                isResearchActive={
                  state.activeAgent === "researcher"
                }
              />
            </div>

            {/* Prosecution Panel */}
            <div className="flex-1">
              <CourtPanel
                role="prosecution"
                text={state.prosecutionText}
                isActive={
                  state.activeAgent === "prosecution"
                }
                interrupted={state.prosecutionInterrupted}
                confidence={state.confidence.prosecution}
                validationFlags={state.validationFlags}
              />
            </div>
          </main>

          {/* Intervention Bar */}
          <InterventionBar
            phase={state.phase}
            onIntervene={sendIntervention}
          />

          {/* Verdict */}
          {state.verdict && (
            <VerdictDisplay
              ruling={state.verdict.ruling}
              confidence={state.verdict.confidence}
              decisiveEvidence={
                state.verdict.decisive_evidence
              }
              unresolved={state.verdict.unresolved}
              flipConditions={state.verdict.flip_conditions}
            />
          )}

          {/* Epistemic Map */}
          {state.epistemicMap && (
            <EpistemicMap
              confirmed={state.epistemicMap.confirmed}
              contested={state.epistemicMap.contested}
              unknown={state.epistemicMap.unknown}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
