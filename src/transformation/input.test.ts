// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeArchive, readArchive } from "./archive";
import { prepareInput, rebuildInput, TEXT_INSPECTION_BYTES } from "./input";

const source = (text = '[{"Name":"Test Organization"}]', name = "orgs.json") =>
  new File([text], name);
const mapping = (
  text = '{"mappings":[{"input_path":"Name","output_path":"name"}]}',
  name = "orgs_organization_mapping.json",
) => new File([text], name);
const signal = () => new AbortController().signal;

describe("unified source intake", () => {
  it("prepares direct JSON source/mapping files for the existing ZIP transport without changing source bytes", async () => {
    const files = [source(), mapping()];
    const result = await prepareInput(files, signal());
    expect(result.format).toBe("json");
    expect(result.files.map((file) => file.name)).toEqual(
      files.map((file) => file.name),
    );
    expect(result.files[0].text).toBe(await files[0].text());
    const extracted = await readArchive(result.archive, "json", signal());
    expect(await extracted[0].text()).toBe(await files[0].text());
  });
  it("accepts CSV and ZIP through the same interface, preserving an imported archive", async () => {
    const files = [
      source("Name\nTest Organization", "orgs.csv"),
      mapping(
        "input_path,output_path\nName,name",
        "orgs_organization_mapping.csv",
      ),
    ];
    const direct = await prepareInput(files, signal());
    expect(direct.format).toBe("csv");
    const archive = direct.archive;
    const imported = await prepareInput([archive], signal());
    expect(imported.archive).toBe(archive);
    expect(imported.files[0].text).toBe("Name\nTest Organization");
  });
  it("normalizes a single ZIP enclosing folder but blocks layouts the backend does not scan", async () => {
    const zipped = await makeArchive([
      source(undefined, "dataset/orgs.json"),
      mapping(undefined, "dataset/orgs_organization_mapping.json"),
    ]);
    const result = await prepareInput([zipped], signal());
    expect(result.files.map((file) => file.name)).toEqual([
      "orgs.json",
      "orgs_organization_mapping.json",
    ]);
    const nested = await makeArchive([
      source(undefined, "dataset/deeper/orgs.json"),
      mapping(undefined, "dataset/deeper/orgs_organization_mapping.json"),
    ]);
    await expect(prepareInput([nested], signal())).rejects.toThrow(
      "one enclosing folder",
    );
  });
  it("blocks missing/mismatched mappings, mixed formats, ZIP with loose files and duplicate names", async () => {
    await expect(prepareInput([source()], signal())).rejects.toThrow(
      "matching mapping",
    );
    await expect(prepareInput([mapping()], signal())).rejects.toThrow(
      "source data",
    );
    await expect(
      prepareInput([source(undefined, "other.json"), mapping()], signal()),
    ).rejects.toThrow("needs source orgs.json");
    await expect(
      prepareInput(
        [source(), mapping("x", "orgs_organization_mapping.csv")],
        signal(),
      ),
    ).rejects.toThrow("Mixed formats");
    const zip = await makeArchive([source(), mapping()]);
    await expect(prepareInput([zip, source()], signal())).rejects.toThrow(
      "Do not mix ZIP",
    );
    await expect(
      prepareInput([source(), source(), mapping()], signal()),
    ).rejects.toThrow("duplicate");
  });
  it("rejects malformed JSON, unsupported source shape, empty files and invalid UTF-8", async () => {
    await expect(
      prepareInput([source("{"), mapping()], signal()),
    ).rejects.toThrow("malformed JSON");
    await expect(
      prepareInput([source("\uFEFF[]"), mapping()], signal()),
    ).rejects.toThrow("malformed JSON");
    await expect(
      prepareInput([source("{}"), mapping()], signal()),
    ).rejects.toThrow("array of record objects");
    await expect(
      prepareInput([source("[]"), mapping()], signal()),
    ).rejects.toThrow("non-empty JSON array");
    await expect(
      prepareInput([source(""), mapping()], signal()),
    ).rejects.toThrow("empty");
    await expect(
      prepareInput(
        [new File([new Uint8Array([255])], "orgs.json"), mapping()],
        signal(),
      ),
    ).rejects.toThrow("UTF-8");
  });
  it("keeps large source bytes with a bounded-preview warning and blocks oversized mapping inspection", async () => {
    const text = '[{"Name":"' + "a".repeat(TEXT_INSPECTION_BYTES) + '"}]';
    const result = await prepareInput([source(text), mapping()], signal());
    expect(result.files[0].text).toBeNull();
    expect(result.warnings[0]).toContain("preview unavailable");
    expect(await result.files[0].file.text()).toBe(text);
    await expect(
      prepareInput(
        [source(), mapping(" ".repeat(TEXT_INSPECTION_BYTES + 1))],
        signal(),
      ),
    ).rejects.toThrow("mapping inspection limit");
  });
  it("revisions replace only existing mapping bytes while retaining original input and source", async () => {
    const original = await prepareInput([source(), mapping()], signal());
    const changed =
      '{"mappings":[{"input_path":"Name","output_path":"description"}]}';
    const result = await rebuildInput(
      original,
      { "orgs_organization_mapping.json": changed },
      signal(),
    );
    expect(result.files[1].text).toBe(changed);
    expect(result.files[0].file).toBe(original.files[0].file);
    expect(original.files[1].text).not.toBe(changed);
    expect(await result.files[0].file.text()).toBe(
      await original.files[0].file.text(),
    );
    await expect(
      rebuildInput(original, { "orgs.json": "[]" }, signal()),
    ).rejects.toThrow("Only existing mapping");
    await expect(
      rebuildInput(
        original,
        { "extra_organization_mapping.json": changed },
        signal(),
      ),
    ).rejects.toThrow("Only existing mapping");
  });
  it("honors cancellation before selection and before revision", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      prepareInput([source(), mapping()], abort.signal),
    ).rejects.toThrow();
    const prepared = await prepareInput([source(), mapping()], signal());
    await expect(rebuildInput(prepared, {}, abort.signal)).rejects.toThrow();
  });
  it("never publishes prepared input when cancellation arrives during file reading", async () => {
    const abort = new AbortController();
    const selected = source();
    const read = selected.arrayBuffer.bind(selected);
    selected.arrayBuffer = async () => {
      abort.abort();
      return read();
    };
    await expect(
      prepareInput([selected, mapping()], abort.signal),
    ).rejects.toThrow();
  });
});

it("rejects malformed CSV quoting before the source can be approved", async () => {
  await expect(
    prepareInput(
      [
        new File(['Name\n"unterminated'], "orgs.csv"),
        new File(
          ["output,input\nname,Name\n"],
          "orgs_organization_mapping.csv",
        ),
      ],
      new AbortController().signal,
    ),
  ).rejects.toThrow("orgs.csv contains malformed CSV");
});
