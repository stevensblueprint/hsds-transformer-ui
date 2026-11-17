/** Browser workflow concepts; these are not backend approval/job/report contracts. */
export type InputFormat = "csv" | "json";
export interface InputFile {
  name: string;
  file: File;
  /** Complete UTF-8 text only when within the bounded text-inspection limit. */
  text: string | null;
}
export interface PreparedInput {
  name: string;
  format: InputFormat;
  files: InputFile[];
  archive: File;
  warnings: string[];
  provenance?: string;
}
export type Decision = "pending" | "approved" | "rejected" | "unresolved";
export interface MappingRow {
  id: string;
  inputPath: string;
  outputPath: string;
  split?: string;
  strip?: string;
}
export interface MappingDocument {
  filename: string;
  sourceFile: string;
  entity: string;
  text: string;
  rows: MappingRow[];
  filter?: string;
  error?: string;
}
export interface ReviewReceipt {
  sourceVersion: number;
  mappingVersion: number;
  contractVersion: string;
}
export interface RunRecord {
  id: number;
  receipt: ReviewReceipt;
  inputName: string;
  inputSnapshot: PreparedInput;
  format: InputFormat;
  phase: "running" | "complete" | "invalid-data" | "system-failure" | "unknown";
  message: string;
  url?: string;
  expiresAt?: number;
  preview: { name: string; text: string }[];
  previewError?: string;
  logs?: string | null;
}
