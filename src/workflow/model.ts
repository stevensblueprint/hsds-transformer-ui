/** Frontend demo concepts only. These are not agreed backend/HSDS contracts. */
export type Step = "source" | "mapping" | "run" | "review" | "export";
export type Decision =
  | "proposed"
  | "unresolved"
  | "unsupported"
  | "unmapped"
  | "rejected"
  | "approved";

export interface Source {
  id: string;
  name: string;
  version: number;
  inspected: boolean;
  files: string[];
  rows: Array<Record<string, string>>;
}

export interface MappingRow {
  id: string;
  sourceField: string;
  evidence: string;
  entity: string;
  targetPaths: string[];
  transformation: string;
  decision: Decision;
  clarification?: string;
  answer?: string;
}

export interface Approval {
  sourceId: string;
  sourceVersion: number;
  mappingVersion: number;
  contractVersion: string;
}

export interface Finding {
  id: string;
  /** Present only for explicitly stable fixture identity; never inferred from text. */
  stableId?: string;
  code: string;
  severity: "error" | "warning" | "info";
  layer: string;
  stage: string;
  rule: string;
  entity: string;
  sourceFile?: string;
  sourceRow?: number;
  sourceField?: string;
  targetPath?: string;
  evidence?: string;
  message: string;
}

export type CheckStatus = "passed" | "failed" | "not run" | "unavailable";
export interface CheckLayer {
  name: string;
  status: CheckStatus;
  detail: string;
}
export type RunStatus =
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "unknown"
  | "cancel requested"
  | "cancelled";
export interface Run {
  id: string;
  sourceId: string;
  parentRunId?: string;
  sourceVersion: number;
  mappingVersion: number;
  contractVersion: string;
  status: RunStatus;
  scenario: Scenario;
  stage: number;
  stages: string[];
  mappings: MappingRow[];
  findings: Finding[];
  checks: CheckLayer[];
  artifact: "available" | "unavailable" | "expired";
  correctionVersion?: number;
  correctionAfter?: string;
  counts: {
    source: number;
    transformed: number;
    filtered: number;
    rejected: number;
    emitted: number;
    unprocessed: number;
  };
}

export interface Correction {
  id: string;
  findingId: string;
  before: string;
  after: string;
  reason: string;
  scope: string;
  version: number;
  decision: "proposed" | "rejected" | "approved";
  basedOnRunId: string | null;
  approvedFor?: Approval;
}

export type Scenario =
  | "normal"
  | "model-timeout"
  | "model-malformed"
  | "conflict"
  | "partial"
  | "system-failure";
export interface WorkflowState {
  step: Step;
  source: Source | null;
  mappingVersion: number;
  contractVersion: string;
  mappings: MappingRow[];
  approval: Approval | null;
  runs: Run[];
  activeRunId: string | null;
  correction: Correction;
  modelStatus: "available" | "timeout" | "malformed";
  scenario: Scenario;
  notice: string;
}

export type WorkflowAction =
  | { type: "LOAD_SOURCE" }
  | { type: "INSPECT_SOURCE" }
  | { type: "NAVIGATE"; step: Step }
  | { type: "CLARIFY"; id: string; answer: string }
  | { type: "REJECT_MAPPING"; id: string }
  | {
      type: "REVISE_MAPPING";
      id: string;
      targetPaths: string[];
      transformation: string;
    }
  | { type: "APPROVE_ROW"; id: string }
  | { type: "MARK_UNMAPPED"; id: string }
  | { type: "APPROVE_MAPPING" }
  | { type: "CHANGE_SOURCE" }
  | { type: "CHANGE_CONTRACT" }
  | { type: "START_RUN" }
  | { type: "ADVANCE_RUN"; runId?: string }
  | { type: "INTERRUPT_RUN" }
  | { type: "REQUEST_CANCEL" }
  | { type: "ACKNOWLEDGE_CANCEL" }
  | { type: "RECONNECT" }
  | { type: "SET_SCENARIO"; scenario: Scenario }
  | { type: "REJECT_CORRECTION" }
  | { type: "REVISE_CORRECTION"; after: string; reason: string }
  | { type: "APPROVE_CORRECTION" }
  | { type: "EXPIRE_ARTIFACT" }
  | { type: "RESET" };

export interface FindingComparison {
  resolved: Finding[];
  remaining: Finding[];
  newFindings: Finding[];
  uncertain: Finding[];
}
