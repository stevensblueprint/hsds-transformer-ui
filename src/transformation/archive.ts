import { inspectZip, ZIP_LIMITS } from "../integration/zip";
import type { InputFormat } from "./model";

const encoder = new TextEncoder();
const decoder = () => new TextDecoder("utf-8", { fatal: true });
const crcTable = new Uint32Array(256).map((_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(name: string): void {
  if (
    !name ||
    name.includes("\\") ||
    name.startsWith("/") ||
    name.includes(":") ||
    [...name].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    name.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(
      "Unsafe file name. Use ordinary relative names without traversal paths.",
    );
}

/** Store bytes without transforming contents. ZIP headers/CRC are generated locally. */
export async function makeArchive(
  files: File[],
  name = "transformation-input.zip",
): Promise<File> {
  if (!files.length || files.length > ZIP_LIMITS.entries)
    throw new Error("Choose between 1 and 100 source/mapping files.");
  const names = new Set<string>();
  let size = 22;
  const entries: {
    name: Uint8Array<ArrayBuffer>;
    bytes: Uint8Array<ArrayBuffer>;
    crc: number;
  }[] = [];
  for (const file of files) {
    safeName(file.name);
    const key = file.name.normalize("NFC").toLowerCase();
    if (names.has(key))
      throw new Error(
        "Conflicting duplicate file names. Rename duplicates before retrying.",
      );
    names.add(key);
    const path = encoder.encode(file.name);
    if (
      size + 30 + path.length + file.size + 46 + path.length >
      ZIP_LIMITS.compressedBytes
    )
      throw new Error(
        "The locally packaged ZIP exceeds 10 MiB. Reduce the input or prepare a compressed ZIP outside the app.",
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (path.length > 65535)
      throw new Error("File name is too long for a standard ZIP.");
    size += 30 + path.length + bytes.length + 46 + path.length;
    if (size > ZIP_LIMITS.compressedBytes)
      throw new Error(
        "The locally packaged ZIP exceeds 10 MiB. Reduce the input or prepare a compressed ZIP outside the app.",
      );
    entries.push({ name: path, bytes, crc: crc32(bytes) });
  }
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const offsets: number[] = [];
  let cursor = 0;
  for (const entry of entries) {
    offsets.push(cursor);
    view.setUint32(cursor, 0x04034b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 0x800, true);
    view.setUint16(cursor + 12, 33, true); // 1980-01-01, deterministic archive metadata.
    view.setUint32(cursor + 14, entry.crc, true);
    view.setUint32(cursor + 18, entry.bytes.length, true);
    view.setUint32(cursor + 22, entry.bytes.length, true);
    view.setUint16(cursor + 26, entry.name.length, true);
    bytes.set(entry.name, cursor + 30);
    bytes.set(entry.bytes, cursor + 30 + entry.name.length);
    cursor += 30 + entry.name.length + entry.bytes.length;
  }
  const directoryStart = cursor;
  for (const [index, entry] of entries.entries()) {
    view.setUint32(cursor, 0x02014b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 20, true);
    view.setUint16(cursor + 8, 0x800, true);
    view.setUint16(cursor + 14, 33, true);
    view.setUint32(cursor + 16, entry.crc, true);
    view.setUint32(cursor + 20, entry.bytes.length, true);
    view.setUint32(cursor + 24, entry.bytes.length, true);
    view.setUint16(cursor + 28, entry.name.length, true);
    view.setUint32(cursor + 42, offsets[index], true);
    bytes.set(entry.name, cursor + 46);
    cursor += 46 + entry.name.length;
  }
  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 8, entries.length, true);
  view.setUint16(cursor + 10, entries.length, true);
  view.setUint32(cursor + 12, cursor - directoryStart, true);
  view.setUint32(cursor + 16, directoryStart, true);
  return new File([bytes], name, { type: "application/zip" });
}

/** Preflight, then bounded decompression and CRC checking into temporary browser memory. */
export async function readArchive(
  file: File,
  format: InputFormat,
  signal: AbortSignal,
): Promise<File[]> {
  signal.throwIfAborted();
  await inspectZip(file, format);
  signal.throwIfAborted();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (
    view.getUint32(end, true) !== 0x06054b50 ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length
  )
    end--;
  const count = view.getUint16(end + 10, true);
  const start = view.getUint32(end + 16, true);
  let cursor = start;
  let total = 0;
  const files: File[] = [];
  const directories: string[] = [];
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const nameLength = view.getUint16(cursor + 28, true);
    const name = decoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    const next =
      cursor +
      46 +
      nameLength +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    if (name.endsWith("/")) {
      safeName(name.slice(0, -1));
      directories.push(name);
      cursor = next;
      continue;
    }
    safeName(name);
    const offset = view.getUint32(cursor + 42, true);
    const dataStart =
      offset +
      30 +
      view.getUint16(offset + 26, true) +
      view.getUint16(offset + 28, true);
    const compressed = view.getUint32(cursor + 20, true);
    const expanded = view.getUint32(cursor + 24, true);
    const method = view.getUint16(cursor + 10, true);
    let stream = new Blob([
      bytes.subarray(dataStart, dataStart + compressed),
    ]).stream();
    if (method === 8)
      stream = stream.pipeThrough(new DecompressionStream("deflate-raw"), {
        signal,
      });
    const reader = stream.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        total += value.byteLength;
        if (length > expanded || total > ZIP_LIMITS.expandedBytes)
          throw new Error(
            "Actual ZIP expansion exceeds its declared size or the 50 MiB browser limit.",
          );
        chunks.push(new Uint8Array(value));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    if (length !== expanded)
      throw new Error("Archive content size does not match its ZIP metadata.");
    const content = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
      content.set(chunk, position);
      position += chunk.length;
    }
    if (crc32(content) !== view.getUint32(cursor + 16, true))
      throw new Error(
        "Archive content failed its CRC check. Re-export the ZIP before retrying.",
      );
    files.push(
      new File([content], name, {
        type: format === "json" ? "application/json" : "text/csv",
      }),
    );
    cursor = next;
  }
  const root = files[0]?.name.split("/")[0];
  if (
    files.some((entry) => entry.name.includes("/")) &&
    directories.some((directory) => !directory.startsWith(`${root}/`))
  )
    throw new Error(
      "ZIP contains extra top-level folders. Keep the dataset inside one enclosing folder so the backend can find its mappings.",
    );
  signal.throwIfAborted();
  return files;
}
