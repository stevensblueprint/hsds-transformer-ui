// @vitest-environment node
import { describe, expect, it } from "vitest";
import { previewJsonOutput } from "./jsonOutput";

async function zip(name: string, text: string, method = 0, expanded?: number) {
  const path = new TextEncoder().encode(name);
  const data = new TextEncoder().encode(text);
  const body =
    method === 8
      ? new Uint8Array(
          await new Response(
            new Blob([data])
              .stream()
              .pipeThrough(new CompressionStream("deflate-raw")),
          ).arrayBuffer(),
        )
      : data;
  const local = 30 + path.length + body.length;
  const central = 46 + path.length;
  const bytes = new Uint8Array(local + central + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, method, true);
  view.setUint32(18, body.length, true);
  view.setUint32(22, expanded ?? data.length, true);
  view.setUint16(26, path.length, true);
  bytes.set(path, 30);
  bytes.set(body, 30 + path.length);
  view.setUint32(local, 0x02014b50, true);
  view.setUint16(local + 10, method, true);
  view.setUint32(local + 20, body.length, true);
  view.setUint32(local + 24, expanded ?? data.length, true);
  view.setUint16(local + 28, path.length, true);
  bytes.set(path, local + 46);
  const end = local + central;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 8, 1, true);
  view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, central, true);
  view.setUint32(end + 16, local, true);
  return new Blob([bytes]);
}
const signal = () => new AbortController().signal;
describe("bounded returned JSON preview", () => {
  it.each([0, 8])(
    "reads stored/deflated JSON (method %i) as literal text",
    async (method) => {
      const result = await previewJsonOutput(
        await zip(
          "organization_1.json",
          '{"name":"<img src=x onerror=alert(1)>","formula":"=1+1"}',
          method,
        ),
        signal(),
      );
      expect(result).toHaveLength(1);
      expect(JSON.parse(result[0].text).name).toContain("<img");
      expect(JSON.parse(result[0].text).formula).toBe("=1+1");
    },
  );
  it("rejects unsafe paths, malformed JSON and invalid envelopes", async () => {
    await expect(
      previewJsonOutput(await zip("../x.json", "{}"), signal()),
    ).rejects.toThrow("Unsafe");
    await expect(
      previewJsonOutput(await zip("x.json", "{broken"), signal()),
    ).rejects.toThrow();
    await expect(
      previewJsonOutput(new Blob(["not zip"]), signal()),
    ).rejects.toThrow("directory");
  });
  it("bounds advertised and actual expanded sizes independently", async () => {
    await expect(
      previewJsonOutput(await zip("x.json", "{}", 0, 2 ** 21), signal()),
    ).rejects.toThrow("1 MiB");
    const large = JSON.stringify({ value: "a".repeat(2 ** 20) });
    await expect(
      previewJsonOutput(await zip("x.json", large, 8, 2), signal()),
    ).rejects.toThrow("Expanded JSON");
    await expect(
      previewJsonOutput(await zip("x.json", "{}", 0, 1), signal()),
    ).rejects.toThrow("metadata");
  });
  it("truncates only the visible preview and honors cancellation", async () => {
    const result = await previewJsonOutput(
      await zip("x.json", JSON.stringify({ value: "a".repeat(13000) })),
      signal(),
    );
    expect(result[0].text).toContain("Preview truncated");
    const abort = new AbortController();
    abort.abort();
    await expect(
      previewJsonOutput(await zip("x.json", "{}"), abort.signal),
    ).rejects.toThrow();
  });
});
