import { useCallback, useRef, useState } from "react";
import { Scale, Wifi, WifiOff, Play, Swords } from "lucide-react";
import { useDebateSocket } from "./hooks/useDebateSocket";
import { useDemoMode } from "./hooks/useDemoMode";
import { DilemmaInput } from "./components/DilemmaInput";
import { CaseBrief } from "./components/CaseBrief";
import { CourtPanel } from "./components/CourtPanel";
import { EvidenceTrail } from "./components/EvidenceTrail";
import { InterventionBar } from "./components/InterventionBar";
import { CourtDirective } from "./components/CourtDirective";
import { JudgeSummary } from "./components/JudgeSummary";
import { PhaseIndicator } from "./components/PhaseIndicator";
import { CrossExamView } from "./components/CrossExamView";
import "./index.css";

const WS_URL =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/session";

function App() {
  const ws = useDebateSocket(WS_URL);
  const demo = useDemoMode();
  const startedLive = useRef(false);

  // Once a live debate starts, never fall back to demo mid-session
  if (ws.connected && ws.state.phase !== "INTAKE") {
    startedLive.current = true;
  }
  const useDemo = !ws.connected && !startedLive.current;
  
  // Destructure the appropriate startDebate function
  const { state, startDebate, sendIntervention, startCrossExam } = useDemo ? demo : ws;
  const connected = ws.connected;

  const isIntake = state.phase === "INTAKE";
  const showCourtroom = !isIntake;
  const showCrossExam = state.crossExamMessages.length > 0;

  const [highlightedEvidenceId, setHighlightedEvidenceId] =
    useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCitationClick = useCallback((id: string) => {
    clearTimeout(highlightTimer.current);
    setHighlightedEvidenceId(id);
    highlightTimer.current = setTimeout(() => {
      setHighlightedEvidenceId(null);
    }, 3000);
  }, []);

  // Wrapper to handle the type signature difference if useDemoMode hasn't been updated yet
  const handleStart = (dilemma: string, filePaths: string[]) => {
    // If demo mode is active, it might not accept filePaths, but JS will just ignore the extra arg
    // If it is the WS version, it will receive the filePaths
    startDebate(dilemma, filePaths);
  };

  return (
    <div className="flex h-screen flex-col bg-court-bg">
      {/* INTAKE: Dilemma Input */}
      {isIntake && (
        <DilemmaInput
          onSubmit={handleStart}
          isDemo={useDemo}
        />
      )}

      {/* COURTROOM: Main Layout */}
      {showCourtroom && (
        <>
          {/* Top Bar */}
          <header className="flex items-center justify-between border-b border-court-border bg-court-surface px-6 py-3">
            <div className="flex items-center gap-3">
              <Scale className="h-6 w-6 text-gold" />
              <h1 className="text-xl font-bold text-court-text">
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

          {/* Scrollable Content Area */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {/* Three-Panel Layout — always visible */}
            <main
              className={`flex gap-4 overflow-hidden p-4 ${
                showCrossExam
                  ? "h-[70vh] shrink-0"
                  : "flex-1"
              }`}
            >
              {/* Defense Panel */}
              <div className="flex-1">
                <CourtPanel
                  role="defense"
                  text={state.defenseText}
                  isActive={state.activeAgent === "defense"}
                  interrupted={state.defenseInterrupted}
                  validationFlags={state.validationFlags}
                  evidence={state.evidence}
                  toolCalls={state.toolCalls}
                  onCitationClick={handleCitationClick}
                />
              </div>

              {/* Evidence Trail + Cross-Exam Button */}
              <div className="flex w-80 shrink-0 flex-col">
                <EvidenceTrail
                  toolCalls={state.toolCalls}
                  evidence={state.evidence}
                  researcherText={state.researcherText}
                  isResearchActive={
                    state.activeAgent === "researcher"
                  }
                  highlightedId={highlightedEvidenceId}
                />

                {state.phase === "AWAITING_CROSS_EXAM" && (
                  <button
                    onClick={startCrossExam}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-6 py-3.5 text-sm font-bold text-gold transition-all duration-300 hover:bg-gold/20 hover:shadow-lg hover:shadow-gold/20"
                    style={{
                      animation:
                        "fade-in 0.4s ease-out, pulse-glow 3s infinite",
                    }}
                  >
                    <Swords className="h-5 w-5" />
                    Begin Cross-Examination
                  </button>
                )}
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
                  validationFlags={state.validationFlags}
                  evidence={state.evidence}
                  toolCalls={state.toolCalls}
                  onCitationClick={handleCitationClick}
                />
              </div>
            </main>

            {/* Cross-Examination — appears below panels */}
            {showCrossExam && (
              <CrossExamView
                messages={state.crossExamMessages}
                activeAgent={state.activeAgent}
                evidence={state.evidence}
                toolCalls={state.toolCalls}
                onCitationClick={handleCitationClick}
              />
            )}

            {/* Judge Summary */}
            {state.judgeText && (
              <JudgeSummary
                text={state.judgeText}
                isActive={state.activeAgent === "judge"}
                evidence={state.evidence}
                toolCalls={state.toolCalls}
                onCitationClick={handleCitationClick}
              />
            )}
          </div>

          {/* Intervention Bar */}
          {/* <InterventionBar
            phase={state.phase}
            onIntervene={sendIntervention}
          /> */}
        </>
      )}
    </div>
  );
}

export default App;