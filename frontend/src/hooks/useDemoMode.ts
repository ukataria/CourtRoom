import { useCallback, useRef, useState } from "react";
import type { DebateState, ToolCallEvent } from "../types";

const INITIAL_STATE: DebateState = {
  phase: "INTAKE",
  connected: false,
  caseBrief: null,
  defenseText: "",
  prosecutionText: "",
  researcherText: "",
  judgeText: "",
  defenseInterrupted: false,
  prosecutionInterrupted: false,
  toolCalls: [],
  evidence: [],
  validationFlags: [],
  confidence: { defense: 50, prosecution: 50 },
  courtDirectives: [],
  verdict: null,
  epistemicMap: null,
  crossExamMessages: [],
  activeAgent: null,
};

const MOCK_CASE_BRIEF = {
  axes: [
    "Academic Freedom vs. Curriculum Standards",
    "Student Employability vs. Ethical Preparedness",
    "Short-Term Cost vs. Long-Term Industry Trust",
    "Individual Choice vs. Institutional Responsibility",
  ],
  summary:
    "This dilemma centers on whether mandating AI ethics coursework strengthens or constrains a computer science program. The core tensions involve balancing curricular freedom with standardization, immediate career readiness with long-term societal impact, and institutional costs with reputational benefits.",
};

const MOCK_TOOL_CALLS: Omit<ToolCallEvent, "id">[] = [
  {
    agent: "researcher",
    tool: "search_papers",
    query: "AI ethics curriculum computer science universities",
    status: "pending",
  },
  {
    agent: "researcher",
    tool: "brave_search",
    query: "CMU AI ethics course requirements 2024 2025",
    status: "pending",
  },
  {
    agent: "researcher",
    tool: "exa",
    query: "impact of ethics training on software engineer decision making",
    status: "pending",
  },
  {
    agent: "researcher",
    tool: "search_papers",
    query: "employer demand AI ethics skills hiring",
    status: "pending",
  },
];

const MOCK_TOOL_RESULTS: {
  tool: string;
  snippet: string;
  result_id: string;
}[] = [
  {
    tool: "search_papers",
    snippet:
      "72% of top-50 CS programs now offer at least one AI ethics course, up from 34% in 2019 (Zhang et al., 2024)",
    result_id: "tool_001",
  },
  {
    tool: "brave_search",
    snippet:
      "Carnegie Mellon's School of Computer Science introduced an optional AI Ethics minor in Fall 2023, with 340 students enrolled in the first semester.",
    result_id: "tool_002",
  },
  {
    tool: "exa",
    snippet:
      "Engineers who completed ethics training were 2.3x more likely to identify potential harms in system design reviews (MIT Tech Review, 2024)",
    result_id: "tool_003",
  },
  {
    tool: "search_papers",
    snippet:
      "68% of tech hiring managers consider ethics awareness a 'valuable' or 'essential' skill, though only 12% formally test for it (IEEE Survey, 2024)",
    result_id: "tool_004",
  },
];

const MOCK_DEFENSE =
  `I will now present a well-organized argument IN FAVOR of requiring AI ethics courses at CMU.
1. Industry Standard Adoption: A comprehensive survey of top-50 CS programs shows that 72% now offer AI ethics coursework [TOOL:tool_001], indicating this is rapidly becoming an industry standard rather than an outlier position. CMU risks falling behind peer institutions by not requiring it.
2. Proven Student Demand: CMU has already demonstrated organic demand — 340 students voluntarily enrolled in the AI Ethics minor in its first semester [TOOL:tool_002]. A requirement ensures equitable access rather than leaving ethical training to self-selection bias.
3. Measurable Engineering Impact: MIT research demonstrates that engineers with ethics training are 2.3 times more likely to identify potential harms during design reviews [TOOL:tool_003]. In an era where AI systems affect hiring decisions, criminal sentencing, and healthcare allocation, this is a core engineering competency.
4. Employability Advantage: 68% of tech hiring managers now consider ethics awareness valuable or essential [TOOL:tool_004]. CMU graduates who lack this training risk being less competitive in a market that increasingly values responsible AI development.
5. Institutional Responsibility: The cost of inaction is clear — CMU risks producing technically brilliant engineers who build systems that cause measurable harm, and the reputational damage flows back to the institution. In conclusion, the evidence strongly supports requiring AI ethics courses as both an academic and moral imperative.`;

const MOCK_PROSECUTION =
  `While the defense presents compelling data, a mandatory requirement is the wrong mechanism. Let me address why.
1. Misleading Adoption Statistics: The 72% figure [TOOL:tool_001] conflates "offering" with "requiring." Most top programs offer ethics as an elective, recognizing that curriculum mandates reduce flexibility. Stanford, MIT, and Berkeley all offer robust ethics coursework without making it mandatory.
2. Voluntary Demand Undermines the Mandate: The 340-student enrollment at CMU [TOOL:tool_002] actually undermines the case for a requirement. Strong voluntary enrollment proves students already seek this education when available. A mandate replaces intrinsic motivation with compliance, risking resentment and superficial engagement.
3. Correlation vs Causation: Regarding the MIT study [TOOL:tool_003], engineers who voluntarily take ethics courses may already be predisposed to ethical thinking. Forcing the same coursework on uninterested students is unlikely to replicate the 2.3x improvement.
4. Weak Market Signal: The hiring survey [TOOL:tool_004] reveals that while 68% value ethics awareness, only 12% formally test for it. Ethics awareness can be developed through integrated modules, capstone projects, and professional development — without adding credit requirements.
5. Resource and Quality Concerns: Who teaches these courses? CS faculty lack formal ethics training, and philosophy departments lack AI expertise. Forced cross-departmental teaching often produces mediocre courses that satisfy no one. Therefore, a mandate is premature and counterproductive.`;

const MOCK_VERDICT = {
  ruling:
    "The Defense presents a stronger evidence-based case. The trend toward AI ethics education is clear and accelerating, and the measured impact on engineering practice is significant. However, the Prosecution raises valid concerns about the specific mechanism of a hard mandate versus strong integration.",
  confidence: 68,
  decisive_evidence: [
    {
      id: "tool_003",
      title: "MIT Ethics Training Impact Study",
      impact:
        "The 2.3x improvement in harm identification directly addresses the practical value question.",
    },
    {
      id: "tool_001",
      title: "Top-50 CS Program Survey (Zhang et al.)",
      impact:
        "Establishes the broader trend, though the defense conflates offering with requiring.",
    },
    {
      id: "tool_004",
      title: "IEEE Hiring Manager Survey",
      impact:
        "Shows market demand exists but hasn't crystallized into formal requirements.",
    },
  ],
  unresolved: [
    "What is the optimal delivery mechanism — standalone course vs. integrated modules?",
    "Who is qualified to teach AI ethics effectively in a CS department?",
    "Does mandatory ethics education actually change engineering behavior, or only voluntary engagement?",
  ],
  flip_conditions: [
    "Evidence that mandatory ethics courses produce comparable outcomes to voluntary enrollment",
    "Data showing CMU graduates have caused specific harms attributable to lack of ethics training",
    "A viable staffing plan for quality ethics instruction at scale",
  ],
};

const MOCK_EPISTEMIC_MAP = {
  confirmed: [
    "AI ethics coursework is expanding across top CS programs",
    "Students at CMU show strong voluntary interest in AI ethics",
    "Ethics training correlates with better harm identification in practice",
    "Tech employers increasingly value ethics awareness",
  ],
  contested: [
    "Whether mandatory requirements produce the same outcomes as voluntary enrollment",
    "Whether the 2.3x improvement is causal or reflects selection bias",
    "Whether market demand for ethics skills is strong enough to justify a mandate",
  ],
  unknown: [
    "Long-term career outcomes of ethics-trained vs. non-trained CS graduates",
    "Optimal faculty qualifications for teaching AI ethics in CS contexts",
    "Whether integrated ethics modules are as effective as standalone courses",
    "Student sentiment toward mandatory vs. elective ethics coursework at CMU",
  ],
};

const MOCK_CROSS_EXAM_EXCHANGES: {
  agent: "prosecution" | "defense";
  content: string;
}[] = [
  {
    agent: "prosecution",
    content:
      "You cite 72% of programs offering ethics courses, but offering is not requiring. How many of those programs mandate it? Isn't your core statistic misleading?",
  },
  {
    agent: "defense",
    content:
      "The trend line matters more than the current mandate count. The direction is clear — from 34% to 72% in five years. Early adopters of requirements will lead, not follow.",
  },
  {
    agent: "prosecution",
    content:
      "The MIT study shows correlation, not causation. Engineers who choose ethics courses self-select. How do you account for that?",
  },
  {
    agent: "defense",
    content:
      "Self-selection is precisely why a mandate is needed — it ensures all engineers, not just the already-ethical ones, develop harm-identification skills.",
  },
];

const TOKEN_DELAY = 18;
const PHASE_DELAY = 1200;

export function useDemoMode() {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelled = useRef(false);

  const schedule = useCallback(
    (fn: () => void, delay: number) => {
      const id = setTimeout(() => {
        if (!cancelled.current) fn();
      }, delay);
      timers.current.push(id);
      return id;
    },
    []
  );

  const streamText = useCallback(
    (
      text: string,
      field: "defenseText" | "prosecutionText",
      agent: DebateState["activeAgent"],
      startDelay: number,
      onDone?: () => void
    ): number => {
      const chars = text.split("");
      let elapsed = startDelay;

      schedule(() => {
        setState((prev) => ({ ...prev, activeAgent: agent }));
      }, elapsed);

      for (const char of chars) {
        elapsed += TOKEN_DELAY;
        const c = char;
        schedule(() => {
          setState((prev) => ({
            ...prev,
            [field]: prev[field] + c,
          }));
        }, elapsed);
      }

      elapsed += 200;
      schedule(() => {
        setState((prev) => ({ ...prev, activeAgent: null }));
        onDone?.();
      }, elapsed);

      return elapsed;
    },
    [schedule]
  );

  const startDebate = useCallback(
    (_dilemma: string) => {
      cancelled.current = false;
      let t = 0;

      // Phase: CASE_BRIEF
      t += 500;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: "CASE_BRIEF",
        }));
      }, t);

      t += 800;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          caseBrief: MOCK_CASE_BRIEF,
        }));
      }, t);

      // Phase: DISCOVERY
      t += PHASE_DELAY;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: "DISCOVERY",
          activeAgent: "researcher",
        }));
      }, t);

      // Tool calls appear one by one
      for (let i = 0; i < MOCK_TOOL_CALLS.length; i++) {
        const tc = MOCK_TOOL_CALLS[i];
        t += 600;
        const tcIndex = i;
        schedule(() => {
          setState((prev) => ({
            ...prev,
            toolCalls: [
              ...prev.toolCalls,
              { ...tc, id: `tc_${tcIndex}`, status: "pending" },
            ],
          }));
        }, t);

        // Complete after a delay
        t += 1200;
        schedule(() => {
          const result = MOCK_TOOL_RESULTS[tcIndex];
          setState((prev) => ({
            ...prev,
            toolCalls: prev.toolCalls.map((existing) =>
              existing.id === `tc_${tcIndex}`
                ? {
                    ...existing,
                    status: "complete" as const,
                    snippet: result.snippet,
                    result_id: result.result_id,
                  }
                : existing
            ),
          }));
        }, t);
      }

      t += 500;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          activeAgent: null,
        }));
      }, t);

      // Phase: DEFENSE_OPENING
      t += PHASE_DELAY;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: "DEFENSE_OPENING",
        }));
      }, t);

      t = streamText(
        MOCK_DEFENSE,
        "defenseText",
        "defense",
        t + 400,
        () => {
          setState((prev) => ({
            ...prev,
            confidence: { defense: 65, prosecution: 50 },
          }));
        }
      );

      // Phase: PROSECUTION_OPENING
      t += PHASE_DELAY;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: "PROSECUTION_OPENING",
        }));
      }, t);

      t = streamText(
        MOCK_PROSECUTION,
        "prosecutionText",
        "prosecution",
        t + 400,
        () => {
          setState((prev) => ({
            ...prev,
            confidence: { defense: 58, prosecution: 62 },
            validationFlags: [
              {
                agent: "prosecution",
                claim:
                  "Forced cross-departmental teaching often produces mediocre courses",
                status: "unsupported",
              },
            ],
          }));
        }
      );

      // Phase: AWAITING_CROSS_EXAM
      t += PHASE_DELAY;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: "AWAITING_CROSS_EXAM",
          activeAgent: null,
        }));
      }, t);
    },
    [schedule, streamText]
  );

  const startCrossExam = useCallback(() => {
    let t = 0;
    let msgId = 0;

    for (const exchange of MOCK_CROSS_EXAM_EXCHANGES) {
      const phase =
        exchange.agent === "prosecution"
          ? "CROSS_EXAM_1"
          : "CROSS_EXAM_2";
      const id = msgId++;

      t += 800;
      const startId = id;
      const startAgent = exchange.agent;
      const startPhase = phase;
      schedule(() => {
        setState((prev) => ({
          ...prev,
          phase: startPhase as DebateState["phase"],
          activeAgent: startAgent,
          crossExamMessages: [
            ...prev.crossExamMessages,
            {
              id: startId,
              agent: startAgent,
              content: "",
              done: false,
            },
          ],
        }));
      }, t);

      for (const char of exchange.content.split("")) {
        t += TOKEN_DELAY;
        const c = char;
        schedule(() => {
          setState((prev) => {
            const msgs = [...prev.crossExamMessages];
            const last = msgs[msgs.length - 1];
            msgs[msgs.length - 1] = {
              ...last,
              content: last.content + c,
            };
            return { ...prev, crossExamMessages: msgs };
          });
        }, t);
      }

      t += 200;
      schedule(() => {
        setState((prev) => {
          const msgs = [...prev.crossExamMessages];
          const last = msgs[msgs.length - 1];
          msgs[msgs.length - 1] = { ...last, done: true };
          return {
            ...prev,
            activeAgent: null,
            crossExamMessages: msgs,
          };
        });
      }, t);
    }

    // After cross-exam, show verdict
    t += PHASE_DELAY * 2;
    schedule(() => {
      setState((prev) => ({
        ...prev,
        phase: "VERDICT",
        confidence: { defense: 62, prosecution: 55 },
      }));
    }, t);

    t += 2000;
    schedule(() => {
      setState((prev) => ({
        ...prev,
        verdict: MOCK_VERDICT,
      }));
    }, t);

    t += 2500;
    schedule(() => {
      setState((prev) => ({
        ...prev,
        phase: "EPISTEMIC_MAP",
        epistemicMap: MOCK_EPISTEMIC_MAP,
      }));
    }, t);
  }, [schedule]);

  const sendIntervention = useCallback(
    (content: string) => {
      setState((prev) => ({
        ...prev,
        courtDirectives: [...prev.courtDirectives, content],
      }));
    },
    []
  );

  return {
    state,
    startDebate,
    sendIntervention,
    startCrossExam,
    connected: false,
    isDemo: true,
  };
}
