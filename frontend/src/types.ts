export type DebatePhase =
  | "INTAKE"
  | "CASE_BRIEF"
  | "DISCOVERY"
  | "DEFENSE_OPENING"
  | "PROSECUTION_OPENING"
  | "AWAITING_CROSS_EXAM"
  | "CROSS_EXAM_1"
  | "CROSS_EXAM_2"
  | "DEFENSE_CLOSING"
  | "PROSECUTION_CLOSING"
  | "VERDICT"
  | "EPISTEMIC_MAP"
  | "COMPLETE";

export type AgentRole =
  | "defense"
  | "prosecution"
  | "researcher"
  | "judge";

export type ServerMessage =
  | { type: "phase_change"; phase: DebatePhase }
  | { type: "case_brief"; axes: string[]; summary: string }
  | {
      type: "agent_stream";
      agent: AgentRole;
      content: string;
      done: boolean;
      interrupted?: boolean;
    }
  | {
      type: "tool_call";
      agent: string;
      tool: string;
      query: string;
      status: "pending" | "complete";
    }
  | {
      type: "tool_result";
      agent: string;
      tool: string;
      result_id: string;
      snippet: string;
    }
  | {
      type: "validation_flag";
      agent: string;
      claim: string;
      status: "unsupported" | "weak";
    }
  | {
      type: "confidence_update";
      defense: number;
      prosecution: number;
    }
  | { type: "court_directive"; content: string }
  | {
      type: "verdict";
      ruling: string;
      confidence: number;
      decisive_evidence: DecisiveEvidence[];
      unresolved: string[];
      flip_conditions: string[];
    }
  | {
      type: "epistemic_map";
      confirmed: string[];
      contested: string[];
      unknown: string[];
    }
  | {
      type: "evidence";
      id: string;
      source: string;
      title: string;
      snippet: string;
      source_type: string;
      date: string;
      url: string;
    };

export type ClientMessage =
  | { type: "start"; dilemma: string; image_data: string | null }
  | { type: "intervention"; content: string }
  | { type: "start_cross_exam" };

export interface DecisiveEvidence {
  id: string;
  title: string;
  impact: string;
}

export interface ToolCallEvent {
  id: string;
  agent: string;
  tool: string;
  query: string;
  status: "pending" | "complete";
  snippet?: string;
  result_id?: string;
}

export interface EvidenceItem {
  id: string;
  source: string;
  title: string;
  snippet: string;
  source_type: string;
  date: string;
  url: string;
}

export interface CrossExamMessage {
  id: number;
  agent: "defense" | "prosecution";
  content: string;
  done: boolean;
}

export interface ValidationFlag {
  agent: string;
  claim: string;
  status: "unsupported" | "weak";
}

export interface DebateState {
  phase: DebatePhase;
  connected: boolean;
  caseBrief: { axes: string[]; summary: string } | null;
  defenseText: string;
  prosecutionText: string;
  researcherText: string;
  judgeText: string;
  defenseInterrupted: boolean;
  prosecutionInterrupted: boolean;
  toolCalls: ToolCallEvent[];
  evidence: EvidenceItem[];
  validationFlags: ValidationFlag[];
  confidence: { defense: number; prosecution: number };
  courtDirectives: string[];
  verdict: {
    ruling: string;
    confidence: number;
    decisive_evidence: DecisiveEvidence[];
    unresolved: string[];
    flip_conditions: string[];
  } | null;
  epistemicMap: {
    confirmed: string[];
    contested: string[];
    unknown: string[];
  } | null;
  crossExamMessages: CrossExamMessage[];
  activeAgent: AgentRole | null;
}
