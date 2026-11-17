export const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:8000" : "/api")
).replace(/\/$/, "");

/** Provisional browser resource bound, not a backend retention/size contract. */
export const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;

async function readArtifact(response: Response): Promise<Blob> {
  const advertised = Number(response.headers.get("content-length"));
  if (advertised > MAX_ARTIFACT_BYTES) {
    await response.body?.cancel();
    throw new TransformError(
      "Artifact exceeds the provisional 100 MiB browser limit. Server outcome unknown.",
      "unknown",
    );
  }
  if (!response.body)
    throw new TransformError(
      "Artifact body unavailable. Server outcome unknown.",
      "unknown",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ARTIFACT_BYTES)
        throw new TransformError(
          "Artifact exceeds the provisional 100 MiB browser limit. Server outcome unknown.",
          "unknown",
        );
      chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Check the ZIP envelope only; no extraction or HSDS/content validity claim. */
async function hasZipEnvelope(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false;
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (
      tail.getUint32(i, true) === 0x06054b50 &&
      i + 22 + tail.getUint16(i + 20, true) === tail.byteLength
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || tail.getUint16(end + 4, true) || tail.getUint16(end + 6, true))
    return false;
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  if (
    count === 65535 ||
    count !== tail.getUint16(end + 8, true) ||
    start + size !== tailStart + end
  )
    return false;
  const directory = new DataView(
    await blob.slice(start, start + size).arrayBuffer(),
  );
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > size || directory.getUint32(cursor, true) !== 0x02014b50)
      return false;
    const next =
      cursor +
      46 +
      directory.getUint16(cursor + 28, true) +
      directory.getUint16(cursor + 30, true) +
      directory.getUint16(cursor + 32, true);
    const localOffset = directory.getUint32(cursor + 42, true);
    if (next > size || localOffset + 30 > start) return false;
    const local = new DataView(
      await blob.slice(localOffset, localOffset + 30).arrayBuffer(),
    );
    if (
      local.getUint32(0, true) !== 0x04034b50 ||
      localOffset +
        30 +
        local.getUint16(26, true) +
        local.getUint16(28, true) +
        directory.getUint32(cursor + 20, true) >
        start
    )
      return false;
    cursor = next;
  }
  return cursor === size;
}

export class TransformError extends Error {
  readonly kind: "invalid-data" | "system-failure" | "unknown";
  readonly status?: number;
  constructor(
    message: string,
    kind: "invalid-data" | "system-failure" | "unknown",
    status?: number,
  ) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

async function boundedText(
  response: Response,
  maximum = 8192,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (total < maximum) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maximum - total;
      total += value.byteLength;
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function checkHealth(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${API_URL}/health`, {
    signal,
    credentials: "omit",
  });
  return response.ok;
}

export async function transformZip(
  file: File,
  signal: AbortSignal,
): Promise<{ blob: Blob; logs: string | null }> {
  const data = new FormData();
  data.append("zip_file", file);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/transform`, {
      method: "POST",
      body: data,
      signal,
      credentials: "omit",
    });
  } catch {
    throw new TransformError(
      "Connection interrupted or request stopped. Server status is unknown; it may still be processing. There is no job reconciliation endpoint.",
      "unknown",
    );
  }
  if (!response.ok) {
    const body = await boundedText(response);
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        const value = p.detail ?? p.message ?? p.error ?? p.errors ?? p.logs;
        detail =
          typeof value === "string" ? value : JSON.stringify(value ?? parsed);
      }
    } catch {
      /* Plain text is rendered as data. */
    }
    throw new TransformError(
      `Transformation failed (HTTP ${response.status}). ${detail || "No details returned."}`,
      [400, 413, 415, 422].includes(response.status)
        ? "invalid-data"
        : "system-failure",
      response.status,
    );
  }
  const type = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (
    response.status !== 201 ||
    (type !== "application/zip" &&
      type !== "application/x-zip-compressed" &&
      type !== "application/octet-stream")
  )
    throw new TransformError(
      "Unexpected response: expected HTTP 201 with a ZIP artifact. Completion cannot be confirmed.",
      "unknown",
    );
  let blob: Blob;
  try {
    blob = await readArtifact(response);
  } catch (error) {
    if (error instanceof TransformError) throw error;
    throw new TransformError(
      "Artifact transfer interrupted. Server status is unknown.",
      "unknown",
    );
  }
  if (!(await hasZipEnvelope(blob)))
    throw new TransformError(
      "The response was not a ZIP artifact. Completion cannot be confirmed.",
      "unknown",
    );
  let logs: string | null = null;
  for (const name of [
    "x-transformer-logs",
    "x-transform-logs",
    "x-log-output",
    "x-logs",
  ]) {
    const value = response.headers.get(name);
    if (value) {
      try {
        logs = decodeURIComponent(value).slice(0, 8192);
      } catch {
        logs = value.slice(0, 8192);
      }
      break;
    }
  }
  if (signal.aborted)
    throw new TransformError(
      "Request interrupted during artifact inspection. Server status unknown.",
      "unknown",
    );
  return { blob, logs };
}
