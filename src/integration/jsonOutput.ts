/** Bounded text preview of returned JSON. No extraction to disk or HTML execution. */
export async function previewJsonOutput(
  blob: Blob,
  signal: AbortSignal,
): Promise<{ name: string; text: string }[]> {
  signal.throwIfAborted();
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
  if (end < 0) throw new Error("ZIP directory unavailable for preview.");
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  if (count > 100 || size > 1024 * 1024 || start + size !== tailStart + end)
    throw new Error("Output exceeds bounded preview limits.");
  const directory = new DataView(
    await blob.slice(start, start + size).arrayBuffer(),
  );
  const files: { name: string; text: string }[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted();
    if (cursor + 46 > size || directory.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Malformed output directory.");
    const method = directory.getUint16(cursor + 10, true);
    const compressed = directory.getUint32(cursor + 20, true);
    const expanded = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const next =
      cursor +
      46 +
      nameLength +
      directory.getUint16(cursor + 30, true) +
      directory.getUint16(cursor + 32, true);
    if (next > size) throw new Error("Malformed output file name.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(directory.buffer, cursor + 46, nameLength),
    );
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").some((p) => p === "..")
    )
      throw new Error("Unsafe output path; preview withheld.");
    if (name.endsWith(".json") && files.length < 5) {
      if (expanded > 1024 * 1024)
        throw new Error(
          "JSON file exceeds the 1 MiB preview limit; use the original ZIP download.",
        );
      const offset = directory.getUint32(cursor + 42, true);
      if (offset + 30 > start)
        throw new Error("Malformed local output header.");
      const header = new DataView(
        await blob.slice(offset, offset + 30).arrayBuffer(),
      );
      if (header.getUint32(0, true) !== 0x04034b50)
        throw new Error("Malformed local output header.");
      const dataStart =
        offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
      if (dataStart + compressed > start)
        throw new Error("Malformed output size.");
      let stream = blob.slice(dataStart, dataStart + compressed).stream();
      if (method === 8)
        stream = stream.pipeThrough(new DecompressionStream("deflate-raw"), {
          signal,
        });
      else if (method !== 0)
        throw new Error(
          "Browser preview does not support this compression method.",
        );
      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let length = 0;
      let text = "";
      try {
        while (true) {
          signal.throwIfAborted();
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 1024 * 1024)
            throw new Error("Expanded JSON exceeds preview limit.");
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      if (length !== expanded)
        throw new Error("Output size does not match ZIP metadata.");
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      files.push({
        name,
        text:
          formatted.length > 12000
            ? formatted.slice(0, 12000) +
              "\n… Preview truncated; download contains the complete file."
            : formatted,
      });
    }
    cursor = next;
  }
  signal.throwIfAborted();
  return files;
}
