/** Metadata preflight only. The server must independently validate and safely extract. */
export const ZIP_LIMITS = {
  compressedBytes: 10 * 1024 * 1024,
  expandedBytes: 50 * 1024 * 1024,
  entries: 100,
} as const;

export interface ZipInspection {
  entries: { name: string; expandedBytes: number }[];
  expandedBytes: number;
}

export async function inspectZip(
  file: File,
  inputFormat: "csv" | "json" = "csv",
): Promise<ZipInspection> {
  if (!file.name.toLowerCase().endsWith(".zip"))
    throw new Error(
      "Unsupported file. Choose a ZIP containing source files and their matching mappings.",
    );
  if (file.size > ZIP_LIMITS.compressedBytes)
    throw new Error("Archive exceeds the provisional 10 MiB compressed limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const invalid = () =>
    new Error(
      "Malformed or unsupported ZIP. Use a standard, single-volume ZIP containing source and mapping files.",
    );
  if (bytes.length < 22) throw invalid();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) throw invalid();
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryStart = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 0 ||
    count === 65535 ||
    directoryStart + directorySize !== end
  )
    throw invalid();
  if (count > ZIP_LIMITS.entries)
    throw new Error("Archive exceeds the provisional 100-entry limit.");
  const entries: ZipInspection["entries"] = [];
  const names = new Set<string>();
  let expandedBytes = 0;
  let cursor = directoryStart;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw invalid();
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const expanded = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      view.getUint16(cursor + 34, true) !== 0 ||
      compressed === 0xffffffff ||
      expanded === 0xffffffff ||
      localOffset === 0xffffffff
    )
      throw invalid();
    if (flags & 0x41 || (method !== 0 && method !== 8))
      throw new Error(
        "Encrypted archives and unsupported compression methods cannot be inspected. Re-export a standard ZIP.",
      );
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      );
    } catch {
      throw invalid();
    }
    const normalized = name.replaceAll("\\", "/").normalize("NFC");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      [...normalized].some(
        (char) =>
          char === ":" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      normalized.split("/").some((part) => part === ".." || part === ".") ||
      ((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000
    )
      throw new Error(
        "Unsafe archive path or symbolic link. Remove absolute paths, traversal entries and links.",
      );
    if (names.has(normalized.toLowerCase()))
      throw new Error(
        "Conflicting duplicate archive paths. Rename duplicate entries before retrying.",
      );
    names.add(normalized.toLowerCase());
    if (
      localOffset + 30 > directoryStart ||
      view.getUint32(localOffset, true) !== 0x04034b50
    )
      throw invalid();
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart =
      localOffset +
      30 +
      localNameLength +
      view.getUint16(localOffset + 28, true);
    if (
      dataStart + compressed > directoryStart ||
      view.getUint16(localOffset + 6, true) !== flags ||
      view.getUint16(localOffset + 8, true) !== method ||
      localNameLength !== nameLength ||
      bytes
        .subarray(localOffset + 30, localOffset + 30 + localNameLength)
        .some((v, j) => v !== bytes[cursor + 46 + j])
    )
      throw invalid();
    if (
      !(flags & 8) &&
      (view.getUint32(localOffset + 18, true) !== compressed ||
        view.getUint32(localOffset + 22, true) !== expanded)
    )
      throw invalid();
    expandedBytes += expanded;
    if (
      expandedBytes > ZIP_LIMITS.expandedBytes ||
      expanded > Math.max(1, compressed) * 100
    )
      throw new Error(
        "Archive expansion exceeds the provisional safety limit (50 MiB total or 100:1 ratio).",
      );
    if (!normalized.endsWith("/")) {
      if (!normalized.toLowerCase().endsWith(`.${inputFormat}`))
        throw new Error(
          `Unsupported archive entry. Selected format requires .${inputFormat} source and mapping files only.`,
        );
      entries.push({ name, expandedBytes: expanded });
    }
    cursor = next;
  }
  if (cursor !== end || entries.length === 0) throw invalid();
  return { entries, expandedBytes };
}
