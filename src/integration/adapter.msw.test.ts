// @vitest-environment node
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { API_URL, transformZip } from "./adapter";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("exercises the multipart HTTP201 boundary through MSW, without a backend or model", async () => {
  const observed: {
    fileName?: string;
    fieldCount?: number;
    contentType?: string | null;
  } = {};
  const output = new Uint8Array(22);
  new DataView(output.buffer).setUint32(0, 0x06054b50, true);
  server.use(
    http.post(`${API_URL}/transform`, async ({ request }) => {
      const form = await request.formData();
      const file = form.get("zip_file");
      observed.fileName =
        typeof file === "object" && file ? file.name : undefined;
      observed.fieldCount = [...form.keys()].length;
      observed.contentType = request.headers.get("content-type");
      return new HttpResponse(output, {
        status: 201,
        headers: {
          "content-type": "application/zip",
          "x-transformer-logs": "synthetic%20fixture%20only",
        },
      });
    }),
  );
  const result = await transformZip(
    new File([output], "synthetic-input.zip", { type: "application/zip" }),
    new AbortController().signal,
  );
  expect(observed).toEqual({
    fileName: "synthetic-input.zip",
    fieldCount: 1,
    contentType: expect.stringMatching(/^multipart\/form-data; boundary=/),
  });
  expect(result.blob.size).toBe(22);
  expect(result.logs).toBe("synthetic fixture only");
});
