import { inspectZip, ZIP_LIMITS } from "../integration/zip";
import { makeArchive, readArchive } from "./archive";
import { parseCsv } from "./mapping";
import type { InputFile, InputFormat, PreparedInput } from "./model";

export const TEXT_INSPECTION_BYTES = 1024 * 1024;
const mappingName = /^(.+)_([A-Za-z0-9]+)_mapping\.(csv|json)$/;
export const isMappingFile = (name: string) =>
  /_mapping\.(csv|json)$/.test(name);

function normalizeRoot(files: File[]): File[] {
  const paths = files.map((file) => file.name.split("/"));
  if (paths.every((parts) => parts.length === 1)) return files;
  const root = paths[0][0];
  if (!paths.every((parts) => parts.length === 2 && parts[0] === root))
    throw new Error(
      "Keep source and mapping files together at the ZIP root, or inside one enclosing folder. Nested datasets cannot be inspected by this flow.",
    );
  return files.map(
    (file, index) => new File([file], paths[index][1], { type: file.type }),
  );
}

function checkPairs(files: File[], format: InputFormat): void {
  const mappings = files.filter((file) => isMappingFile(file.name));
  const sources = files.filter((file) => !isMappingFile(file.name));
  if (!sources.length)
    throw new Error("Add the source data file as well as its mapping.");
  if (!mappings.length)
    throw new Error(
      `Add a matching mapping file named <source>_<entity>_mapping.${format}. Mapping generation is not connected.`,
    );
  const mappedSources = new Set<string>();
  for (const file of mappings) {
    const match = mappingName.exec(file.name);
    if (!match)
      throw new Error(
        `Unsupported mapping name: ${file.name}. Use <source>_<entity>_mapping.${format}.`,
      );
    const sourceName = `${match[1]}.${format}`;
    if (!sources.some((source) => source.name === sourceName))
      throw new Error(
        `Mapping ${file.name} needs source ${sourceName}. Add the matching source with the same spelling and case.`,
      );
    mappedSources.add(sourceName);
  }
  for (const file of sources)
    if (!mappedSources.has(file.name))
      throw new Error(
        `Source ${file.name} has no matching mapping. Add ${file.name.slice(0, -(format.length + 1))}_<entity>_mapping.${format}.`,
      );
}

async function inspectText(
  files: File[],
  format: InputFormat,
  signal: AbortSignal,
) {
  const warnings: string[] = [];
  const inputs: InputFile[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    if (!file.size)
      throw new Error(
        `${file.name} is empty. Choose a non-empty source or mapping file.`,
      );
    if (file.size > TEXT_INSPECTION_BYTES) {
      if (isMappingFile(file.name))
        throw new Error(
          `${file.name} exceeds the 1 MiB mapping inspection limit. Split the mapping before continuing.`,
        );
      warnings.push(
        `${file.name}: source text preview unavailable above 1 MiB; original bytes are preserved.`,
      );
      inputs.push({ name: file.name, file, text: null });
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      throw new Error(
        `${file.name} is not valid UTF-8. Re-export the file as UTF-8.`,
      );
    }
    if (format === "csv") {
      try {
        parseCsv(text);
      } catch (cause) {
        throw new Error(
          `${file.name} contains malformed CSV. ${cause instanceof Error ? cause.message : "Correct the quoting before continuing."}`,
        );
      }
    }
    if (format === "json") {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new Error(
          `${file.name} contains malformed JSON. Correct the JSON syntax before continuing.`,
        );
      }
      if (
        !isMappingFile(file.name) &&
        (!Array.isArray(value) ||
          !value.length ||
          value.some(
            (row) => !row || typeof row !== "object" || Array.isArray(row),
          ))
      )
        throw new Error(
          `${file.name} must contain a non-empty JSON array of record objects for the existing transformer.`,
        );
    }
    inputs.push({ name: file.name, file, text });
  }
  signal.throwIfAborted();
  return { inputs, warnings };
}

/** Select locally, inspect locally, then explicitly upload only when the user runs. */
export async function prepareInput(
  selected: File[],
  signal: AbortSignal,
): Promise<PreparedInput> {
  signal.throwIfAborted();
  if (!selected.length)
    throw new Error(
      "Choose CSV/JSON source and mapping files, or one ZIP containing them.",
    );
  if (selected.length > ZIP_LIMITS.entries)
    throw new Error("Choose no more than 100 files.");
  const archives = selected.filter((file) =>
    file.name.toLowerCase().endsWith(".zip"),
  );
  let files: File[];
  let archive: File;
  let format: InputFormat;
  if (archives.length) {
    if (archives.length !== 1 || selected.length !== 1)
      throw new Error(
        "Choose one ZIP on its own, or choose source and mapping files together. Do not mix ZIP and loose files.",
      );
    archive = archives[0];
    format = "csv";
    try {
      await inspectZip(archive, "csv");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("Unsupported archive entry.")
      )
        throw error;
      try {
        await inspectZip(archive, "json");
        format = "json";
      } catch (jsonError) {
        if (
          jsonError instanceof Error &&
          jsonError.message.startsWith("Unsupported archive entry.")
        )
          throw new Error(
            "A ZIP must contain CSV source/mapping files or JSON source/mapping files, not mixed formats or unsupported files.",
          );
        throw jsonError;
      }
    }
    files = normalizeRoot(await readArchive(archive, format, signal));
  } else {
    if (
      selected.reduce((size, file) => size + file.size, 0) >
      ZIP_LIMITS.compressedBytes
    )
      throw new Error(
        "Selected files exceed the 10 MiB browser intake limit. Reduce the input or supply a compressed ZIP.",
      );
    const formats = new Set(
      selected.map((file) => file.name.split(".").at(-1)),
    );
    if (formats.size !== 1 || (!formats.has("csv") && !formats.has("json")))
      throw new Error(
        "Choose matching CSV files or matching JSON files. Mixed formats and other extensions are unsupported.",
      );
    format = formats.has("json") ? "json" : "csv";
    files = normalizeRoot(selected);
    archive = await makeArchive(files);
    await inspectZip(archive, format);
  }
  signal.throwIfAborted();
  checkPairs(files, format);
  const { inputs, warnings } = await inspectText(files, format, signal);
  return {
    name:
      selected.length === 1
        ? selected[0].name
        : `${inputs
            .filter((file) => !isMappingFile(file.name))
            .map((file) => file.name)
            .join(", ")}`,
    format,
    files: inputs,
    archive,
    warnings,
  };
}

/** Change only mapping bytes; source File objects and the prior PreparedInput remain intact. */
export async function rebuildInput(
  input: PreparedInput,
  replacements: Record<string, string>,
  signal: AbortSignal,
): Promise<PreparedInput> {
  signal.throwIfAborted();
  const knownNames = new Set(input.files.map((file) => file.name));
  for (const name of Object.keys(replacements)) {
    if (!knownNames.has(name) || !isMappingFile(name))
      throw new Error(
        "Only existing mapping files can be revised. Source files remain unchanged.",
      );
  }
  const files = input.files.map((entry) =>
    Object.hasOwn(replacements, entry.name)
      ? new File([replacements[entry.name]], entry.name, {
          type: entry.file.type,
        })
      : entry.file,
  );
  const archive = await makeArchive(files);
  signal.throwIfAborted();
  const prepared = await prepareInput([archive], signal);
  return {
    ...prepared,
    files: prepared.files.map((entry) =>
      isMappingFile(entry.name)
        ? entry
        : (input.files.find((original) => original.name === entry.name) ??
          entry),
    ),
    name: input.name,
    provenance: input.provenance,
  };
}
