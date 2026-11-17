// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkHealth, MAX_ARTIFACT_BYTES, transformZip } from "./adapter";

afterEach(() => vi.unstubAllGlobals());
const file = () => new File(["synthetic"], "fixture.zip");
const signal = () => new AbortController().signal;
const zipBytes = () => {
  const bytes = new Uint8Array(22);
  new DataView(bytes.buffer).setUint32(0, 0x06054b50, true);
  return bytes;
};

describe("verified legacy HTTP boundary (mock transport, not live backend)", () => {
  it("bounds streamed artifact bytes even when content-length understates the body", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_ARTIFACT_BYTES + 1));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 201,
          headers: {
            "content-type": "application/zip",
            "content-length": "1",
          },
        }),
      ),
    );
    await expect(transformZip(file(), signal())).rejects.toMatchObject({
      kind: "unknown",
      message: expect.stringContaining("100 MiB"),
    });
  });
  it.each([401, 403, 404, 408, 429])(
    "classifies infrastructure/auth/rate-limit HTTP%s as system failure, not invalid source data",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );
      await expect(transformZip(file(), signal())).rejects.toMatchObject({
        kind: "system-failure",
        status,
      });
    },
  );
  it("posts zip_file multipart and accepts HTTP201 ZIP with safely decoded logs", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(zipBytes(), {
        status: 201,
        headers: {
          "content-type": "application/zip",
          "x-transformer-logs": "synthetic%20log",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await transformZip(file(), signal());
    expect(fetch.mock.calls[0][0]).toMatch(/\/transform$/);
    const options = fetch.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.body.get("zip_file").name).toBe("fixture.zip");
    expect(options.credentials).toBe("omit");
    expect(result.blob.size).toBe(22);
    expect(result.logs).toBe("synthetic log");
  });
  it("uses a separate health request with no implication of transformation success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(checkHealth(signal())).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toMatch(/\/health$/);
  });
  it.each([
    [422, "invalid-data"],
    [500, "system-failure"],
  ])(
    "classifies HTTP%s as %s and retains text evidence",
    async (status, kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail: "<b>literal source</b>" }), {
            status: Number(status),
          }),
        ),
      );
      await expect(transformZip(file(), signal())).rejects.toMatchObject({
        kind,
        message: expect.stringContaining("<b>literal source</b>"),
      });
    },
  );
  it("does not retry disconnected requests or acknowledge cancellation", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(transformZip(file(), signal())).rejects.toMatchObject({
      kind: "unknown",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a truncated ZIP signature instead of presenting transformation completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          status: 201,
          headers: { "content-type": "application/zip" },
        }),
      ),
    );
    await expect(transformZip(file(), signal())).rejects.toMatchObject({
      kind: "unknown",
    });
  });
  it("rejects an oversized advertised artifact before buffering it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(zipBytes(), {
          status: 201,
          headers: {
            "content-type": "application/zip",
            "content-length": String(110 * 1024 * 1024),
          },
        }),
      ),
    );
    await expect(transformZip(file(), signal())).rejects.toMatchObject({
      kind: "unknown",
    });
  });
  it.each([
    [200, "application/zip", zipBytes()],
    [201, "application/json", "{}"],
    [201, "application/zip", "bad"],
  ])(
    "rejects unexpected/malformed successful responses",
    async (status, type, body) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(body, { status, headers: { "content-type": type } }),
          ),
      );
      await expect(transformZip(file(), signal())).rejects.toMatchObject({
        kind: "unknown",
      });
    },
  );
});

it("ignores completion if aborted during asynchronous ZIP envelope inspection", async () => {
  const OriginalBlob = Blob;
  let reached!: () => void;
  const inspecting = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  class GatedBlob extends OriginalBlob {
    override slice(start?: number, end?: number, type?: string): Blob {
      const result = super.slice(start, end, type);
      const arrayBuffer = result.arrayBuffer.bind(result);
      result.arrayBuffer = async () => {
        reached();
        await gate;
        return arrayBuffer();
      };
      return result;
    }
  }
  vi.stubGlobal("Blob", GatedBlob);
  const bytes = new Uint8Array(22);
  new DataView(bytes.buffer).setUint32(0, 0x06054b50, true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 201,
        headers: { "content-type": "application/zip" },
      }),
    ),
  );
  const abort = new AbortController();
  const request = transformZip(
    new File(["synthetic"], "fixture.zip"),
    abort.signal,
  );
  await inspecting;
  abort.abort();
  release();
  await expect(request).rejects.toMatchObject({ kind: "unknown" });
});

it("sends JSON input_format with the existing ZIP multipart boundary", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(zipBytes(), {
      status: 201,
      headers: { "content-type": "application/zip" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await transformZip(file(), signal(), "json");
  expect(fetch.mock.calls[0][1].body.get("input_format")).toBe("json");
  expect(fetch.mock.calls[0][1].body.get("zip_file").name).toBe("fixture.zip");
});
