import { sha256 } from "../hash.js";

export function createHttpTool({ harness, name = "http.fetch", allowLive = false } = {}) {
  if (!harness) {
    throw new Error("createHttpTool requires a harness");
  }

  return harness.wrapTool(name, async ({ url, method = "GET", headers = {}, body }) => {
    if (!allowLive) {
      return {
        mocked: true,
        status: 599,
        body: "Live HTTP disabled. Pass allowLive=true for staging-only recording.",
        requestHash: sha256({ url, method, headers, body })
      };
    }

    const response = await fetch(url, { method, headers, body });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  });
}
