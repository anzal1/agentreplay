import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { assertionSummary, diffTraces, evaluateAssertions } from "../index.js";
import { validateTrace } from "../schema.js";
import { FileTraceStore } from "../store/fileStore.js";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

export function createAgentReplayServer(options = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const publicDir = resolve(options.publicDir ?? join(rootDir, "public"));
  const store = options.store ?? new FileTraceStore({ rootDir: options.traceDir ?? join(rootDir, "traces") });

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/api/traces") {
        return json(response, await store.list());
      }

      if (url.pathname === "/api/trace") {
        const trace = await store.load(requiredParam(url, "id"));
        return json(response, trace);
      }

      if (url.pathname === "/api/gate") {
        const trace = await store.load(requiredParam(url, "id"));
        return json(response, assertionSummary(evaluateAssertions(trace)));
      }

      if (url.pathname === "/api/validate") {
        const trace = await store.load(requiredParam(url, "id"));
        return json(response, validateTrace(trace));
      }

      if (url.pathname === "/api/diff") {
        const left = await store.load(requiredParam(url, "left"));
        const right = await store.load(requiredParam(url, "right"));
        return json(response, diffTraces(left, right));
      }

      const staticPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(join(publicDir, staticPath));
      if (!filePath.startsWith(publicDir)) {
        response.writeHead(403);
        return response.end("Forbidden");
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream"
      });
      response.end(body);
    } catch (error) {
      json(response, { error: error.message }, error.code === "ENOENT" ? 404 : 500);
    }
  });
}

export function listen(server, { port = 4177, host = "127.0.0.1" } = {}) {
  return new Promise((resolveListen) => {
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      resolveListen({
        port: resolvedPort,
        host,
        url: `http://${host}:${resolvedPort}`
      });
    });
  });
}

function json(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function requiredParam(url, name) {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new Error(`Missing query parameter: ${name}`);
  }

  return value;
}
