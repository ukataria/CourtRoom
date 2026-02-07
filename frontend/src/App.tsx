import { useCallback, useRef, useState } from "react";
import { Scale, Wifi, WifiOff, Play, Swords } from "lucide-react";
import { useDebateSocket } from "./hooks/useDebateSocket";
import { useDemoMode } from "./hooks/useDemoMode";
import { DilemmaInput } from "./components/DilemmaInput";
import { CaseBrief } from "./components/CaseBrief";
import { CourtPanel } from "./components/CourtPanel";
import { EvidenceTrail } from "./components/EvidenceTrail";
// InterventionBar temporarily disabled
// import { InterventionBar } from "./components/InterventionBar";
import { CourtDirective } from "./components/CourtDirective";
import { JudgeSummary } from "./components/JudgeSummary";
import { PhaseIndicator } from "./components/PhaseIndicator";
import { CrossExamView } from "./components/CrossExamView";
import "./index.css";

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (window.location.protocol === "https:"
    ? window.location.origin
    : "http://localhost:8000");

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (window.location.protocol === "https:"
    ? `wss://${window.location.host}/ws/session`
    : "ws://localhost:8000/ws/session");

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

  const resetDebate = useCallback(() => {
    startedLive.current = false;
    ws.resetDebate();
  }, [ws]);
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
          apiBase={API_BASE}
        />
      )}

      {/* COURTROOM: Main Layout */}
      {showCourtroom && (
        <>
          {/* Top Bar */}
          <header className="flex items-center justify-between border-b border-court-border bg-court-surface px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={resetDebate}
                className="rounded-lg p-1 transition-colors hover:bg-gold/10"
                title="Back to dilemma"
              >
                <Scale className="h-10 w-10 text-gold" />
              </button>
              <h1 className="text-3xl font-bold text-court-text">
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
                <span className="text-sm text-court-text-muted">
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

          {/* Two-Column Layout: Main Content + Evidence Sidebar */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Scrollable Main Content */}
            <div className="flex flex-1 flex-col overflow-y-auto">
              {/* Opening Statements — side by side */}
              <div
                className={`flex gap-4 p-4 ${
                  showCrossExam || state.judgeText
                    ? "h-[60vh] shrink-0"
                    : "flex-1"
                }`}
              >
                <div className="flex-1">
                  <CourtPanel
                    role="defense"
                    text={state.defenseText}
                    isActive={state.phase === "DEFENSE_OPENING" && state.activeAgent === "defense"}
                    interrupted={state.defenseInterrupted}
                    validationFlags={state.validationFlags}
                    evidence={state.evidence}
                    toolCalls={state.toolCalls}
                    onCitationClick={handleCitationClick}
                  />
                </div>
                <div className="flex-1">
                  <CourtPanel
                    role="prosecution"
                    text={state.prosecutionText}
                    isActive={state.phase === "PROSECUTION_OPENING" && state.activeAgent === "prosecution"}
                    interrupted={state.prosecutionInterrupted}
                    validationFlags={state.validationFlags}
                    evidence={state.evidence}
                    toolCalls={state.toolCalls}
                    onCitationClick={handleCitationClick}
                  />
                </div>
              </div>

              {/* Cross-Exam Button */}
              {state.phase === "AWAITING_CROSS_EXAM" && (
                <div className="flex justify-center px-4 pb-4">
                  <button
                    onClick={startCrossExam}
                    className="flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-8 py-3.5 text-sm font-bold text-gold transition-all duration-300 hover:bg-gold/20 hover:shadow-lg hover:shadow-gold/20"
                    style={{
                      animation:
                        "fade-in 0.4s ease-out, pulse-glow 3s infinite",
                    }}
                  >
                    <Swords className="h-5 w-5" />
                    Begin Cross-Examination
                  </button>
                </div>
              )}

              {/* Cross-Examination */}
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

            {/* Right: Evidence Trail Sidebar */}
            <div className="flex w-90 shrink-0 flex-col border-l border-court-border p-4">
              <EvidenceTrail
                toolCalls={state.toolCalls}
                evidence={state.evidence}
                researcherText={state.researcherText}
                isResearchActive={
                  state.activeAgent === "researcher"
                }
                highlightedId={highlightedEvidenceId}
              />
            </div>
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