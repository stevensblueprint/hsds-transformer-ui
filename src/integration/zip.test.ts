// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inspectZip, ZIP_LIMITS } from "./zip";

function archive(
  name = "source.csv",
  options: {
    flags?: number;
    expanded?: number;
    external?: number;
    method?: number;
  } = {},
): File {
  const nameBytes = new TextEncoder().encode(name);
  const localSize = 30 + nameBytes.length + 1;
  const centralSize = 46 + nameBytes.length;
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(6, options.flags ?? 0, true);
  v.setUint16(8, options.method ?? 0, true);
  v.setUint32(18, 1, true);
  v.setUint32(22, options.expanded ?? 1, true);
  v.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  bytes[localSize - 1] = 65;
  v.setUint32(localSize, 0x02014b50, true);
  v.setUint16(localSize + 8, options.flags ?? 0, true);
  v.setUint16(localSize + 10, options.method ?? 0, true);
  v.setUint32(localSize + 20, 1, true);
  v.setUint32(localSize + 24, options.expanded ?? 1, true);
  v.setUint16(localSize + 28, nameBytes.length, true);
  v.setUint32(localSize + 38, options.external ?? 0, true);
  bytes.set(nameBytes, localSize + 46);
  const end = localSize + centralSize;
  v.setUint32(end, 0x06054b50, true);
  v.setUint16(end + 8, 1, true);
  v.setUint16(end + 10, 1, true);
  v.setUint32(end + 12, centralSize, true);
  v.setUint32(end + 16, localSize, true);
  return new File([bytes], "synthetic.zip", { type: "application/zip" });
}

describe("ZIP metadata preflight", () => {
  it("inspects a bounded inventory without reading source values", async () => {
    await expect(inspectZip(archive())).resolves.toEqual({
      entries: [{ name: "source.csv", expandedBytes: 1 }],
      expandedBytes: 1,
    });
  });
  it.each([
    "../source.csv",
    "/source.csv",
    "C:\\source.csv",
    "nested/../../source.csv",
    "nested\\..\\source.csv",
    "evil\0.csv",
  ])("rejects unsafe path %s", async (name) => {
    await expect(inspectZip(archive(name))).rejects.toThrow("Unsafe archive");
  });
  it("rejects symbolic links and encrypted entries", async () => {
    await expect(
      inspectZip(archive("source.csv", { external: 0xa0000000 })),
    ).rejects.toThrow("Unsafe archive");
    await expect(
      inspectZip(archive("source.csv", { flags: 1 })),
    ).rejects.toThrow("Encrypted");
  });
  it("rejects extreme declared expansion and unsupported compression", async () => {
    await expect(
      inspectZip(
        archive("source.csv", { expanded: ZIP_LIMITS.expandedBytes + 1 }),
      ),
    ).rejects.toThrow("expansion");
    await expect(
      inspectZip(archive("source.csv", { method: 99 })),
    ).rejects.toThrow("compression");
  });
  it("rejects malformed, direct-file, oversized and non-CSV entries", async () => {
    await expect(inspectZip(new File(["x"], "bad.zip"))).rejects.toThrow(
      "Malformed",
    );
    await expect(inspectZip(new File(["x"], "source.csv"))).rejects.toThrow(
      "Unsupported file",
    );
    await expect(
      inspectZip(
        new File([new Uint8Array(ZIP_LIMITS.compressedBytes + 1)], "large.zip"),
      ),
    ).rejects.toThrow("10 MiB");
    await expect(inspectZip(archive("instructions.html"))).rejects.toThrow(
      "Unsupported archive entry",
    );
  });
});

it("accepts JSON archive entries only when JSON input format is explicit", async () => {
  await expect(inspectZip(archive("orgs.json"), "json")).resolves.toMatchObject(
    { entries: [{ name: "orgs.json" }] },
  );
  await expect(inspectZip(archive("orgs.json"))).rejects.toThrow(
    "Unsupported archive entry",
  );
});
