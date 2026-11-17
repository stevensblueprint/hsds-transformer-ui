import type {
  InputFile,
  InputFormat,
  MappingDocument,
  MappingRow,
} from "./model";

const MAX_REVIEW_ROWS = 200;
const transformCache = new WeakMap<
  MappingDocument,
  { text: string; values: Map<number, string | undefined> }
>();
const sourceCache = new WeakMap<
  InputFile,
  { text: string | null; record?: Record<string, unknown> }
>();
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const field = (value: unknown, label: string, required = false) => {
  if (value !== undefined && typeof value !== "string")
    throw new Error(`${label} must be text.`);
  const text = (value as string | undefined)?.trim() ?? "";
  if (required && !text) throw new Error(`${label} is required.`);
  return text;
};

/** CSV reading only. Values remain literal text and never execute as formulas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === ",") {
      row.push(value);
      value = "";
      closed = false;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      closed = false;
    } else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error("Malformed CSV quoting.");
      value += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  if (value || row.length || closed) rows.push([...row, value]);
  return rows;
}

function serializeCsv(rows: string[][]) {
  return (
    rows
      .map((row) =>
        row
          .map((value) =>
            /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
          )
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}

function rowFromValues(
  filename: string,
  index: number,
  values: unknown[],
): MappingRow {
  const inputPath = field(values[1], "Source field", true);
  if (!inputPath.split(";").some((part) => part.trim()))
    throw new Error("Source field must include a field name.");
  return {
    id: `${filename}#${index}`,
    inputPath,
    outputPath: field(values[0], "Target path", true),
    split: field(values[2], "Split separator") || undefined,
    strip: field(values[3], "Strip characters") || undefined,
  };
}

function parseDocument(file: InputFile, format: InputFormat): MappingDocument {
  const match = file.name.match(
    new RegExp(`^(.+)_([A-Za-z0-9]+)_mapping\\.${format}$`, "i"),
  );
  const doc: MappingDocument = {
    filename: file.name,
    sourceFile: match ? `${match[1]}.${format}` : "Unavailable",
    entity: match?.[2] ?? "Unavailable",
    text: file.text ?? "",
    rows: [],
  };
  try {
    if (!match)
      throw new Error(
        "Mapping name must match <source>_<entity>_mapping and the source file format.",
      );
    if (file.text === null)
      throw new Error(
        "Mapping text is unavailable within the inspection limit.",
      );
    if (new TextEncoder().encode(file.text).length > 1024 * 1024)
      throw new Error("Mapping exceeds the 1 MiB browser inspection limit.");
    if (format === "json") {
      const raw: unknown = JSON.parse(file.text);
      if (!object(raw) || !Array.isArray(raw.mappings) || !raw.mappings.length)
        throw new Error(
          "Expected a JSON object with a non-empty mappings array.",
        );
      if (raw.filter !== undefined && raw.filter !== null) {
        if (!object(raw.filter)) throw new Error("Filter must be an object.");
        const column = field(raw.filter.column, "Filter column");
        const value = field(raw.filter.value, "Filter value");
        if (column && value) doc.filter = `${column} = ${value}`;
      }
      doc.rows = raw.mappings.map((entry: unknown, index: number) => {
        if (!object(entry))
          throw new Error(`Mapping ${index + 1} must be an object.`);
        field(entry.transform, "Custom transform");
        return rowFromValues(file.name, index, [
          entry.output_path,
          entry.input_path,
          entry.split,
          entry.strip,
        ]);
      });
    } else {
      const rows = parseCsv(file.text);
      if (rows.length < 3)
        throw new Error(
          "CSV mappings need a header, a filter row (blank if unused), then mapping rows.",
        );
      if (rows[1][0]?.trim() && rows[1][1]?.trim())
        doc.filter = `${rows[1][0].trim()} = ${rows[1][1].trim()}`;
      doc.rows = rows.slice(2).flatMap((row, index) => {
        if (row.every((value) => !value.trim())) return [];
        field(row[4], "Custom transform");
        return [rowFromValues(file.name, index + 2, row)];
      });
      if (!doc.rows.length)
        throw new Error("Mapping contains no reviewable rows.");
    }
    if (doc.rows.length > MAX_REVIEW_ROWS)
      throw new Error(
        `Mapping exceeds the ${MAX_REVIEW_ROWS}-row browser review limit. Split it into smaller mapping files.`,
      );
  } catch (error) {
    doc.rows = [];
    doc.error =
      error instanceof Error
        ? error.message
        : "Mapping could not be inspected.";
  }
  return doc;
}

/** Describes the supplied backend mapping format; it does not run or validate the mapping engine. */
export function parseMappings(
  files: InputFile[],
  format: InputFormat,
): MappingDocument[] {
  return files
    .filter((file) => new RegExp(`_mapping\\.${format}$`, "i").test(file.name))
    .map((file) => parseDocument(file, format));
}

export function reviseMapping(
  document: MappingDocument,
  row: MappingRow,
  changes: Pick<MappingRow, "inputPath" | "outputPath" | "split" | "strip">,
): string {
  const index = Number(row.id.slice(row.id.lastIndexOf("#") + 1));
  rowFromValues(document.filename, index, [
    changes.outputPath,
    changes.inputPath,
    changes.split,
    changes.strip,
  ]);
  let text: string;
  if (document.filename.toLowerCase().endsWith(".json")) {
    const raw = JSON.parse(document.text) as Record<string, unknown> & {
      mappings: Record<string, unknown>[];
    };
    const entry = raw.mappings[index];
    if (!entry)
      throw new Error(
        "Mapping row is no longer current. Close the editor and inspect the current mapping.",
      );
    const next: Record<string, unknown> = {
      ...entry,
      input_path: changes.inputPath.trim(),
      output_path: changes.outputPath.trim(),
    };
    for (const key of ["split", "strip"] as const) {
      const value = changes[key]?.trim();
      if (value) next[key] = value;
      else delete next[key];
    }
    raw.mappings[index] = next;
    text = JSON.stringify(raw, null, 2) + "\n";
  } else {
    const rows = parseCsv(document.text);
    if (!rows[index])
      throw new Error(
        "Mapping row is no longer current. Close the editor and inspect the current mapping.",
      );
    const next = [...rows[index]];
    next[0] = changes.outputPath.trim();
    next[1] = changes.inputPath.trim();
    next[2] = changes.split?.trim() ?? "";
    next[3] = changes.strip?.trim() ?? "";
    rows[index] = next;
    text = serializeCsv(rows);
  }
  validateMappingText(document, text);
  return text;
}

export function validateMappingText(
  document: MappingDocument,
  text: string,
): void {
  const file = {
    name: document.filename,
    file: new File([text], document.filename),
    text,
  };
  const next = parseDocument(
    file,
    document.filename.toLowerCase().endsWith(".json") ? "json" : "csv",
  );
  if (next.error) throw new Error(next.error);
}

export function transformationDescription(
  document: MappingDocument,
  row: MappingRow,
): string {
  const index = Number(row.id.slice(row.id.lastIndexOf("#") + 1));
  let cached = transformCache.get(document);
  if (!cached || cached.text !== document.text) {
    const values = new Map<number, string | undefined>();
    if (document.filename.toLowerCase().endsWith(".json")) {
      const raw = JSON.parse(document.text) as {
        mappings: Record<string, unknown>[];
      };
      raw.mappings.forEach((entry, entryIndex) =>
        values.set(
          entryIndex,
          typeof entry.transform === "string" ? entry.transform : undefined,
        ),
      );
    } else
      parseCsv(document.text).forEach((entry, entryIndex) =>
        values.set(entryIndex, entry[4]),
      );
    cached = { text: document.text, values };
    transformCache.set(document, cached);
  }
  const transform = cached.values.get(index);
  const descriptions = [
    row.inputPath.includes(";")
      ? "Combine supplied source fields"
      : "Copy supplied value",
    row.split ? `Split on ${JSON.stringify(row.split)}` : "",
    row.strip ? `Strip ${JSON.stringify(row.strip)}` : "",
    transform ? `Custom transform: ${transform} (backend)` : "",
  ];
  return descriptions.filter(Boolean).join(" · ");
}

export function sourceEvidence(
  document: MappingDocument,
  row: MappingRow,
  sources: InputFile[],
): string {
  const source = sources.find((file) => file.name === document.sourceFile);
  if (!source?.text)
    return "Unavailable — source preview was not supplied within the inspection limit.";
  try {
    let cached = sourceCache.get(source);
    if (!cached || cached.text !== source.text) {
      let record: Record<string, unknown> | undefined;
      if (source.name.toLowerCase().endsWith(".json")) {
        const value: unknown = JSON.parse(source.text);
        const first = Array.isArray(value) ? value[0] : value;
        if (object(first)) record = first;
      } else {
        const rows = parseCsv(source.text);
        if (rows.length > 1)
          record = Object.fromEntries(
            rows[0].map((name, index) => [name, rows[1][index]]),
          );
      }
      cached = { text: source.text, record };
      sourceCache.set(source, cached);
    }
    const record = cached.record;
    if (!record)
      return "Unavailable — no first source record could be inspected.";
    return row.inputPath
      .split(";")
      .map((key) => {
        key = key.trim();
        const value = Object.hasOwn(record ?? {}, key)
          ? record?.[key]
          : undefined;
        const display =
          value === undefined
            ? "Unavailable — field not supplied"
            : typeof value === "string"
              ? value
              : JSON.stringify(value);
        return `${key}: ${display.slice(0, 500)}${display.length > 500 ? "…" : ""}`;
      })
      .join("; ")
      .slice(0, 2000);
  } catch {
    return "Unavailable — source preview could not be read.";
  }
}
