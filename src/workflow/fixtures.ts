import type {
  Correction,
  Finding,
  MappingRow,
  Source,
  WorkflowState,
} from "./model";

export const demoSource: Source = {
  id: "synthetic-harbor",
  name: "Harbor Community Directory",
  version: 1,
  inspected: false,
  files: ["services.csv", "locations.csv"],
  rows: [
    {
      source_id: "S-001",
      organization: "Harbor Resource Center",
      service: "Food pantry",
      phone: "201-555-01",
      location_ids: "L-01;L-02",
      notes: "Walk-ins welcome",
    },
    {
      source_id: "S-002",
      organization: "Harbor Resource Center",
      service: "Housing advice",
      phone: "201-555-0102",
      location_ids: "L-02",
      notes: "=This stays plain text",
    },
    {
      source_id: "S-003",
      organization: "Northside Care",
      service: "Community transport",
      phone: "201-555-0103",
      location_ids: "L-03",
      notes: "<script>also plain text</script>",
    },
  ],
};

export const demoMappings: MappingRow[] = [
  {
    id: "organization",
    sourceField: "organization",
    evidence: "Harbor Resource Center",
    entity: "organization + service",
    targetPaths: ["organization.name", "service.organization_id"],
    transformation: "Keep organization name; use reviewed source relation",
    decision: "proposed",
  },
  {
    id: "service",
    sourceField: "service",
    evidence: "Food pantry",
    entity: "service",
    targetPaths: ["service.name"],
    transformation: "Copy text",
    decision: "proposed",
  },
  {
    id: "phone",
    sourceField: "phone",
    evidence: "201-555-01",
    entity: "phone",
    targetPaths: ["phone.number"],
    transformation: "Copy text",
    decision: "unresolved",
    clarification:
      "Is this a public service contact number or an internal staff number?",
  },
  {
    id: "locations",
    sourceField: "location_ids",
    evidence: "L-01;L-02",
    entity: "service_at_location",
    targetPaths: [
      "service_at_location.location_id",
      "service_at_location.service_id",
    ],
    transformation: "Custom executable split (unsupported)",
    decision: "unsupported",
  },
  {
    id: "notes",
    sourceField: "notes",
    evidence: "Walk-ins welcome",
    entity: "None",
    targetPaths: [],
    transformation: "Intentionally omit; retain original source",
    decision: "unmapped",
  },
];

export const initialCorrection: Correction = {
  id: "phone-correction",
  findingId: "phone-length",
  before: "201-555-01",
  after: "201-555-0101",
  reason:
    "Illustrative replacement supplied by the synthetic fixture author; verify with a steward for real data.",
  scope: "services.csv · row 2 · phone · one output record",
  version: 1,
  decision: "proposed",
  basedOnRunId: null,
};

export const baseFindings: Finding[] = [
  {
    id: "phone-length",
    stableId: "demo:services:S-001:phone:length",
    code: "DEMO_PHONE_LENGTH",
    severity: "error",
    layer: "Synthetic deterministic checks",
    stage: "Check output",
    rule: "Demo fixture requires ten phone digits",
    entity: "phone / S-001",
    sourceFile: "services.csv",
    sourceRow: 2,
    sourceField: "phone",
    targetPath: "phone.number",
    evidence: "201-555-01 → 8 digits",
    message: "Contact number has fewer digits than this demo rule expects.",
  },
  {
    id: "reference-review",
    stableId: "demo:services:S-002:relation",
    code: "DEMO_RELATION_REVIEW",
    severity: "warning",
    layer: "Synthetic deterministic checks",
    stage: "Check output",
    rule: "Fixture review requires steward confirmation of shared location",
    entity: "service_at_location / S-002",
    sourceFile: "services.csv",
    sourceRow: 3,
    sourceField: "location_ids",
    targetPath: "service_at_location.location_id",
    evidence: "L-02 is shared by Food pantry and Housing advice",
    message: "Confirm that both services operate at the shared location.",
  },
  {
    id: "missing-provenance",
    code: "DEMO_PROVENANCE_UNKNOWN",
    severity: "info",
    layer: "Synthetic deterministic checks",
    stage: "Check output",
    rule: "Fixture deliberately omits a stable diagnostic identity",
    entity: "Unknown",
    message:
      "Source evidence and matching identity were not supplied for this finding.",
  },
];

export const rerunNewFinding: Finding = {
  id: "new-review",
  stableId: "demo:services:S-003:hours",
  code: "DEMO_HOURS_REVIEW",
  severity: "warning",
  layer: "Synthetic deterministic checks",
  stage: "Check output",
  rule: "Rerun fixture introduces an independently reviewable warning",
  entity: "service / S-003",
  sourceFile: "services.csv",
  sourceRow: 4,
  sourceField: "service",
  targetPath: "service.name",
  evidence: "Community transport",
  message: "Confirm operating hours before sharing this service externally.",
};

export const initialState: WorkflowState = {
  step: "source",
  source: null,
  mappingVersion: 1,
  contractVersion: "demo-contract-1 (not an agreed HSDS profile)",
  mappings: demoMappings,
  approval: null,
  runs: [],
  activeRunId: null,
  correction: initialCorrection,
  modelStatus: "available",
  scenario: "normal",
  notice:
    "Synthetic workspace. Nothing is uploaded or saved; reloading clears this session.",
};
