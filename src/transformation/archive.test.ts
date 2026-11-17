// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crc32, makeArchive, readArchive } from "./archive";

const signal = () => new AbortController().signal;
const file = (text: string, name = "orgs.json") => new File([text], name);

/** Small compressed fixture with correct headers/CRC, independent of the stored writer. */
async function deflatedFile(text: string, advertised?: number) {
  const name = new TextEncoder().encode("orgs.json");
  const content = new TextEncoder().encode(text);
  const compressed = new Uint8Array(
    await new Response(
      new Blob([content])
        .stream()
        .pipeThrough(new CompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );
  const local = 30 + name.length + compressed.length;
  const central = 46 + name.length;
  const bytes = new Uint8Array(local + central + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, 8, true);
  view.setUint32(14, crc32(content), true);
  view.setUint32(18, compressed.length, true);
  view.setUint32(22, advertised ?? content.length, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  bytes.set(compressed, 30 + name.length);
  view.setUint32(local, 0x02014b50, true);
  view.setUint16(local + 10, 8, true);
  view.setUint32(local + 16, crc32(content), true);
  view.setUint32(local + 20, compressed.length, true);
  view.setUint32(local + 24, advertised ?? content.length, true);
  view.setUint16(local + 28, name.length, true);
  bytes.set(name, local + 46);
  const end = local + central;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, central, true);
  view.setUint32(end + 16, local, true);
  return new File([bytes], "compressed.zip");
}

describe("browser archive boundary", () => {
  it("writes a standard CRC and round-trips original file bytes/names", async () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const originals = [
      file('[{"Name":"<p>literal</p>"}]'),
      file('{"mappings":[]}', "orgs_organization_mapping.json"),
    ];
    const zip = await makeArchive(originals);
    const restored = await readArchive(zip, "json", signal());
    expect(restored.map((item) => item.name)).toEqual(
      originals.map((item) => item.name),
    );
    for (const [index, item] of restored.entries())
      expect(await item.text()).toBe(await originals[index].text());
  });
  it("reads actual DEFLATE output and enforces actual expansion rather than trusting metadata", async () => {
    const text = JSON.stringify([{ Name: "Test Organization" }]);
    expect(
      await (
        await readArchive(await deflatedFile(text), "json", signal())
      )[0].text(),
    ).toBe(text);
    await expect(
      readArchive(await deflatedFile(text, 1), "json", signal()),
    ).rejects.toThrow("Actual ZIP expansion");
  });
  it("rejects altered content when metadata and extension remain plausible", async () => {
    const zip = await makeArchive([file("[]")]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    bytes[30 + "orgs.json".length] = 123;
    await expect(
      readArchive(new File([bytes], "bad.zip"), "json", signal()),
    ).rejects.toThrow("CRC");
  });
  it.each([
    "../orgs.json",
    "/orgs.json",
    "a\\orgs.json",
    "a/./orgs.json",
    "orgs\0.json",
  ])("rejects unsafe name %s before writing", async (name) => {
    await expect(makeArchive([file("[]", name)])).rejects.toThrow("Unsafe");
  });
  it("bounds archive construction and rejects duplicate paths", async () => {
    await expect(makeArchive([])).rejects.toThrow("between 1 and 100");
    await expect(
      makeArchive([file("[]"), file("[]", "ORGS.JSON")]),
    ).rejects.toThrow("duplicate");
    const oversized = file("x".repeat(10 * 1024 * 1024));
    await expect(makeArchive([oversized])).rejects.toThrow("10 MiB");
  });
  it("honors an already cancelled inspection without reading bytes", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      readArchive(new File([], "bad.zip"), "json", abort.signal),
    ).rejects.toThrow();
  });
});
