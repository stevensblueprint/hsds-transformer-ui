// @vitest-environment node
import { describe, expect, it } from "vitest";
import sourceText from "../assets/repository-json/orgs.json?raw";
import mappingText from "../assets/repository-json/orgs_organization_mapping.json?raw";
import {
  parseCsv,
  parseMappings,
  reviseMapping,
  sourceEvidence,
  transformationDescription,
  validateMappingText,
} from "./mapping";
import type { InputFile } from "./model";

const file = (name: string, text: string | null): InputFile => ({
  name,
  text,
  file: new File([text ?? ""], name),
});
const upstream = () =>
  parseMappings(
    [file("orgs_organization_mapping.json", mappingText)],
    "json",
  )[0];

describe("supplied mapping review boundary", () => {
  it("reads upstream JSON paths, repeated fields and source evidence without executing content", () => {
    const doc = upstream();
    expect(doc.error).toBeUndefined();
    expect(doc.filter).toBe("Status = Active");
    expect(doc.rows).toHaveLength(8);
    expect(doc.rows[4].inputPath).toBe("Phone1;Phone2");
    expect(doc.rows[4].outputPath).toBe("phones[].number");
    expect(
      sourceEvidence(doc, doc.rows[2], [file("orgs.json", sourceText)]),
    ).toContain("<p>Clean Me</p>");
    expect(
      sourceEvidence(doc, doc.rows[4], [file("orgs.json", sourceText)]),
    ).toContain("Phone2: 555-0101");
    expect(transformationDescription(doc, doc.rows[4])).toContain(
      "Combine supplied source fields",
    );
  });
  it("preserves filter, custom transforms and unknown metadata when revising one JSON instruction", () => {
    const raw = JSON.parse(mappingText);
    raw.owner = { note: "retain" };
    raw.mappings[0].transform = "existing_backend_transform";
    raw.mappings[0].future = { keep: true };
    const doc = parseMappings(
      [file("orgs_organization_mapping.json", JSON.stringify(raw))],
      "json",
    )[0];
    const revised = JSON.parse(
      reviseMapping(doc, doc.rows[0], {
        inputPath: "Name",
        outputPath: "name",
        split: ",",
        strip: "<p>;</p>",
      }),
    );
    expect(revised.filter).toEqual(raw.filter);
    expect(revised.owner).toEqual(raw.owner);
    expect(revised.mappings[0]).toEqual({
      ...raw.mappings[0],
      input_path: "Name",
      output_path: "name",
      split: ",",
      strip: "<p>;</p>",
    });
    expect(revised.mappings.slice(1)).toEqual(raw.mappings.slice(1));
    expect(transformationDescription(doc, doc.rows[0])).toContain(
      "existing_backend_transform (backend)",
    );
    expect(JSON.parse(doc.text)).toEqual(raw);
  });
  it("reads quoted CSV including multiline evidence and preserves positional filter/header/extra columns", () => {
    const csv =
      'path,input_field,split,strip,transform,future\r\nStatus,Active,,,,\r\nname,Name,,,normalize_name,retain\r\n"phones[].number","Phone1;Phone2",,,clean_phone,untouched\r\n';
    const doc = parseMappings(
      [file("orgs_organization_mapping.csv", csv)],
      "csv",
    )[0];
    expect(doc.error).toBeUndefined();
    expect(doc.filter).toBe("Status = Active");
    expect(doc.rows[1].inputPath).toBe("Phone1;Phone2");
    const revised = reviseMapping(doc, doc.rows[0], {
      ...doc.rows[0],
      inputPath: "Name, other",
    });
    const rows = parseCsv(revised);
    expect(rows[0]).toEqual(parseCsv(csv)[0]);
    expect(rows[1]).toEqual(parseCsv(csv)[1]);
    expect(rows[2]).toEqual([
      "name",
      "Name, other",
      "",
      "",
      "normalize_name",
      "retain",
    ]);
    expect(rows[3]).toEqual(parseCsv(csv)[3]);
    const evidence = sourceEvidence(doc, doc.rows[0], [
      file("orgs.csv", 'Name,Status\r\n"A, B\nC",Active\r\n'),
    ]);
    expect(evidence).toBe("Name: A, B\nC");
  });
  it("blocks malformed, unsupported and over-limit mapping shapes without partial approval rows", () => {
    for (const text of [
      "null",
      "[]",
      '{"mappings":[]}',
      '{"mappings":[{"input_path":"Name","output_path":"name"},{"output_path":"id"}]}',
      '{"mappings":[{"input_path":"; ;","output_path":"name"}]}',
      '{"mappings":[{"input_path":"Name","output_path":"name","split":3}]}',
      '{"mappings":[{"input_path":"Name","output_path":"name"}],"filter":[]}',
    ]) {
      const doc = parseMappings(
        [file("orgs_organization_mapping.json", text)],
        "json",
      )[0];
      expect(doc.error).toBeTruthy();
      expect(doc.rows).toEqual([]);
    }
    const many = JSON.stringify({
      mappings: Array.from({ length: 201 }, (_, i) => ({
        input_path: "Name",
        output_path: `name${i}`,
      })),
    });
    expect(
      parseMappings([file("orgs_organization_mapping.json", many)], "json")[0]
        .error,
    ).toContain("200-row");
    expect(
      parseMappings([file("orgs_organization_mapping.json", null)], "json")[0]
        .error,
    ).toContain("inspection limit");
    expect(
      parseMappings(
        [file("orgs_organization_mapping.csv", 'path,input\n,\nname,"bad')],
        "csv",
      )[0].error,
    ).toContain("unterminated");
    expect(() => validateMappingText(upstream(), "{}")).toThrow("mappings");
  });
  it("supports multiple target instructions for one source field and never guesses missing evidence", () => {
    const text = JSON.stringify({
      mappings: [
        { input_path: "Name", output_path: "name" },
        { input_path: "Name", output_path: "description" },
        { input_path: "Unknown", output_path: "id" },
      ],
    });
    const doc = parseMappings(
      [file("orgs_organization_mapping.json", text)],
      "json",
    )[0];
    expect(doc.rows).toHaveLength(3);
    expect(
      sourceEvidence(doc, doc.rows[2], [file("orgs.json", sourceText)]),
    ).toContain("Unavailable");
    expect(
      sourceEvidence(doc, doc.rows[0], [file("orgs.json", null)]),
    ).toContain("inspection limit");
  });
});

it("shows the backend-normalized source keys and withholds ambiguous evidence", () => {
  const doc = parseMappings(
    [
      file(
        "orgs_organization_mapping.json",
        '{"mappings":[{"input_path":"Name","output_path":"name"}]}',
      ),
    ],
    "json",
  )[0];
  expect(
    sourceEvidence(doc, doc.rows[0], [
      file(
        "orgs.json",
        JSON.stringify([{ "\u0085Name\u001c": "Backend value" }]),
      ),
    ]),
  ).toBe("Name: Backend value");
  expect(
    sourceEvidence(doc, doc.rows[0], [
      file("orgs.json", '[{"Name":"Public"," Name ":"Other"}]'),
    ]),
  ).toContain("Unavailable");
  const csv = parseMappings(
    [file("orgs_organization_mapping.csv", "output,input\n,\nname,Name\n")],
    "csv",
  )[0];
  expect(
    sourceEvidence(csv, csv.rows[0], [
      file("orgs.csv", " Name ,Status\nBackend value,Active\n"),
    ]),
  ).toBe("Name: Backend value");
  expect(
    sourceEvidence(csv, csv.rows[0], [
      file("orgs.csv", "\uFEFFName,Status\nBOM value,Active\n"),
    ]),
  ).toContain("Unavailable");
});

it("preserves FEFF in mapping field names because the backend does not trim it", () => {
  const text = JSON.stringify({
    mappings: [{ input_path: "\uFEFFName", output_path: "name" }],
  });
  const doc = parseMappings(
    [file("orgs_organization_mapping.json", text)],
    "json",
  )[0];
  expect(doc.rows[0].inputPath).toBe("\uFEFFName");
  expect(
    sourceEvidence(doc, doc.rows[0], [
      file("orgs.json", '[{"Name":"Wrong key"}]'),
    ]),
  ).toContain("Unavailable");
  expect(
    sourceEvidence(doc, doc.rows[0], [
      file("orgs.json", JSON.stringify([{ "\uFEFFName": "Correct key" }])),
    ]),
  ).toContain("Correct key");
});
