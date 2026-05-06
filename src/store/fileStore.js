import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertionSummary, evaluateAssertions } from "../assertions.js";
import { traceStats, validateTrace } from "../schema.js";

export class FileTraceStore {
  constructor(options = {}) {
    this.rootDir = resolve(options.rootDir ?? "./traces");
  }

  async ensure() {
    await mkdir(this.rootDir, { recursive: true });
  }

  pathFor(traceId) {
    return join(this.rootDir, `${traceId}.json`);
  }

  async save(trace) {
    await this.ensure();
    const validation = validateTrace(trace);
    if (!validation.valid) {
      throw new Error(`Invalid trace: ${validation.errors.join("; ")}`);
    }

    const filePath = this.pathFor(trace.traceId);
    await writeFile(filePath, `${JSON.stringify(trace, null, 2)}\n`);
    return filePath;
  }

  async load(traceIdOrPath) {
    if (traceIdOrPath.endsWith(".json")) {
      const directPath = traceIdOrPath.includes("/")
        ? resolve(traceIdOrPath)
        : join(this.rootDir, traceIdOrPath);
      return JSON.parse(await readFile(directPath, "utf8"));
    }

    try {
      return JSON.parse(await readFile(this.pathFor(traceIdOrPath), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const traces = await this.#readValidTraces();
    const match = traces.find((entry) => entry.trace.traceId === traceIdOrPath);
    if (!match) {
      throw new Error(`Trace not found: ${traceIdOrPath}`);
    }

    return match.trace;
  }

  async list() {
    const files = await this.#readValidTraces();
    const traces = [];

    for (const { file, trace } of files) {
      const gate = assertionSummary(evaluateAssertions(trace));
      traces.push({
        traceId: trace.traceId,
        project: trace.project,
        agent: trace.agent?.name ?? "unknown",
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        gatePassed: gate.passed,
        stats: traceStats(trace),
        file
      });
    }

    return traces.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async #readValidTraces() {
    await this.ensure();
    const files = (await readdir(this.rootDir)).filter((file) => file.endsWith(".json"));
    const traces = [];

    for (const file of files) {
      const trace = JSON.parse(await readFile(join(this.rootDir, file), "utf8"));
      const validation = validateTrace(trace);
      if (validation.valid) {
        traces.push({ file, trace });
      }
    }

    return traces;
  }
}
