import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cloneJson, createTraceId, sha256, stableStringify } from "./hash.js";
import { defaultRedactor } from "./redaction.js";

export class AgentReplayHarness {
  constructor(options = {}) {
    this.mode = options.mode ?? "record";
    this.project = options.project ?? "default";
    this.agent = options.agent ?? {};
    this.trace = options.trace ?? null;
    this.traceId = this.trace?.traceId ?? options.traceId ?? createTraceId();
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.events = [];
    this.toolManifest = cloneJson(options.toolManifest ?? []);
    this.replayCursor = 0;
    this.replayMismatches = [];
    this.redact = options.redact ?? defaultRedactor;
  }

  recordInput(input) {
    this.events.push({
      id: eventId(this.events.length),
      type: "user_input",
      ts: new Date().toISOString(),
      input: this.redact(cloneJson(input))
    });
  }

  recordFinalOutput(output) {
    this.events.push({
      id: eventId(this.events.length),
      type: "final_output",
      ts: new Date().toISOString(),
      output: this.redact(cloneJson(output))
    });
  }

  wrapTool(name, handler, options = {}) {
    this.#registerTool(name, options);

    return async (args = {}, context = {}) => {
      const started = Date.now();
      const safeArgs = this.redact(cloneJson(args));

      if (this.mode === "replay") {
        return this.#replayToolCall(name, safeArgs, context, started);
      }

      const preState = options.snapshot
        ? this.redact(cloneJson(await options.snapshot(args, context)))
        : undefined;

      let response;
      let error;
      try {
        response = await handler(args, context);
      } catch (caught) {
        error = {
          name: caught.name,
          message: caught.message
        };
      }

      const postState = options.snapshot
        ? this.redact(cloneJson(await options.snapshot(args, context)))
        : undefined;
      const sideEffects = options.diff
        ? this.redact(cloneJson(await options.diff(preState, postState, args, response, context)))
        : diffState(preState, postState);
      const safeResponse = this.redact(cloneJson(response));

      const event = {
        id: eventId(this.events.length),
        type: "tool_call",
        ts: new Date().toISOString(),
        tool: name,
        args: safeArgs,
        argHash: sha256(safeArgs),
        response: safeResponse,
        responseHash: sha256(safeResponse ?? null),
        error,
        approval: context.approval ?? null,
        preState,
        postState,
        sideEffects,
        durationMs: Date.now() - started
      };

      this.events.push(stripUndefined(event));

      if (error) {
        const thrown = new Error(error.message);
        thrown.name = error.name;
        throw thrown;
      }

      return response;
    };
  }

  finalize(options = {}) {
    if (this.mode === "replay") {
      this.#recordMissingReplayToolCalls();
    }

    return stripUndefined({
      schemaVersion: "agentreplay.trace.v1",
      traceId: this.traceId,
      project: this.project,
      agent: this.agent,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      sourceTraceId: this.trace?.traceId,
      replayMismatches: this.replayMismatches,
      toolManifest: this.toolManifest,
      events: this.events,
      expectedOutcome: options.expectedOutcome,
      metadata: options.metadata
    });
  }

  async save(filePath, options = {}) {
    const trace = this.finalize(options);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(trace, null, 2)}\n`);
    return trace;
  }

  #replayToolCall(name, safeArgs, context, started) {
    const expectedTools = this.trace.events.filter((event) => event.type === "tool_call");
    const expected = expectedTools[this.replayCursor];
    this.replayCursor += 1;

    if (!expected) {
      const mismatch = {
        kind: "unexpected_tool_call",
        tool: name,
        args: safeArgs
      };
      this.replayMismatches.push(mismatch);
      throw new ReplayMismatchError(mismatch);
    }

    const mismatch = compareExpectedToolCall(expected, name, safeArgs);
    if (mismatch) {
      this.replayMismatches.push(mismatch);
    }

    const event = stripUndefined({
      id: eventId(this.events.length),
      type: "tool_call",
      ts: new Date().toISOString(),
      tool: name,
      args: safeArgs,
      argHash: sha256(safeArgs),
      response: cloneJson(expected.response),
      responseHash: sha256(expected.response ?? null),
      approval: context.approval ?? null,
      preState: cloneJson(expected.preState),
      postState: cloneJson(expected.postState),
      sideEffects: cloneJson(expected.sideEffects),
      replay: {
        expectedTool: expected.tool,
        expectedArgHash: expected.argHash,
        matched: !mismatch
      },
      durationMs: Date.now() - started
    });

    this.events.push(event);

    if (expected.error) {
      const thrown = new Error(expected.error.message);
      thrown.name = expected.error.name;
      throw thrown;
    }

    return cloneJson(expected.response);
  }

  #recordMissingReplayToolCalls() {
    const expectedTools = this.trace.events.filter((event) => event.type === "tool_call");

    for (let index = this.replayCursor; index < expectedTools.length; index += 1) {
      const expected = expectedTools[index];
      const alreadyRecorded = this.replayMismatches.some(
        (mismatch) =>
          mismatch.kind === "missing_expected_tool_call" &&
          mismatch.expectedEventId === expected.id
      );

      if (!alreadyRecorded) {
        this.replayMismatches.push({
          kind: "missing_expected_tool_call",
          expectedEventId: expected.id,
          expectedTool: expected.tool,
          expectedIndex: index
        });
      }
    }
  }

  #registerTool(name, options) {
    if (this.toolManifest.some((tool) => tool.name === name)) {
      return;
    }

    this.toolManifest.push(
      stripUndefined({
        name,
        description: options.description,
        inputSchema: options.inputSchema,
        outputSchema: options.outputSchema,
        hasSnapshot: Boolean(options.snapshot),
        hasDiff: Boolean(options.diff)
      })
    );
  }
}

export class ReplayMismatchError extends Error {
  constructor(mismatch) {
    super(`Replay mismatch: ${mismatch.kind}`);
    this.name = "ReplayMismatchError";
    this.mismatch = mismatch;
  }
}

function compareExpectedToolCall(expected, tool, args) {
  if (expected.tool !== tool) {
    return {
      kind: "tool_name_mismatch",
      expected: expected.tool,
      actual: tool
    };
  }

  if (stableStringify(expected.args) !== stableStringify(args)) {
    return {
      kind: "tool_args_mismatch",
      tool,
      expected: expected.args,
      actual: args
    };
  }

  return null;
}

function diffState(before, after) {
  if (before === undefined || after === undefined) {
    return [];
  }

  if (stableStringify(before) === stableStringify(after)) {
    return [];
  }

  return [
    {
      type: "state_changed",
      beforeHash: sha256(before),
      afterHash: sha256(after)
    }
  ];
}

function eventId(index) {
  return `evt_${String(index + 1).padStart(4, "0")}`;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, stripUndefined(nested)])
    );
  }

  return value;
}
