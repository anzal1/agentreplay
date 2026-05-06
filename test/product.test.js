import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createAgentReplayServer, listen } from "../src/server/server.js";
import {
  AgentReplayHarness,
  assertionSummary,
  createEntityStateAdapter,
  evaluateAssertions,
  FileTraceStore,
  replayTrace,
  sha256,
  toolEvents,
  validateTrace
} from "../src/index.js";
import { runDemo } from "../examples/billing-agent/demo.js";
import { runCrmAdversaryDemo, runCrmPilot } from "../examples/crm-agent-workflow/demo.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("billing demo proves bad trace fails and fixed trace passes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentreplay-demo-"));
  try {
    const result = await runDemo({
      badTracePath: join(dir, "bad.json"),
      fixedTracePath: join(dir, "fixed.json")
    });

    assert.equal(result.badGate.passed, false);
    assert.equal(result.fixedGate.passed, true);
    assert.equal(result.diff.changed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CRM adversarial workflow proves side-effect gates on external agent patterns", async () => {
  const result = await runCrmAdversaryDemo();
  const failedNames = result.badGate.results
    .filter((check) => !check.passed)
    .map((check) => check.name);

  assert.equal(result.badGate.passed, false);
  assert.equal(result.fixedGate.passed, true);
  assert.equal(result.diff.changed, true);
  assert.ok(failedNames.includes("query_injection_guard"));
  assert.ok(failedNames.includes("crm_update_requires_approval"));
  assert.ok(failedNames.includes("only_one_lead_updated"));
});

test("CRM pilot catches broad CRM mutation failures across adversarial prompts", async () => {
  const result = await runCrmPilot();

  assert.equal(result.totals.cases, 20);
  assert.equal(result.totals.caught, 20);
  assert.equal(result.totals.fixedClean, 20);
  assert.equal(result.totals.diffsChanged, 20);
  assert.equal(
    result.results.every((item) => item.badFailed.includes("crm_update_requires_approval")),
    true
  );
  assert.equal(
    result.results.some((item) => item.badFailed.includes("query_injection_guard")),
    true
  );
  assert.equal(
    result.results.some((item) => item.badFailed.includes("only_one_lead_updated")),
    true
  );
});

test("Node, Python, and Go SDKs produce validator-compatible trace semantics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentreplay-conformance-"));
  try {
    const nodeTracePath = join(dir, "node.json");
    const pythonTracePath = join(dir, "python.json");
    const goTracePath = join(dir, "go.json");

    await execFileAsync(process.execPath, ["./examples/conformance/node.js", nodeTracePath], { cwd: repoRoot });
    await execFileAsync("python3", ["./sdk/python/examples/conformance.py", pythonTracePath], { cwd: repoRoot });
    await execFileAsync("go", ["run", "./examples/conformance", goTracePath], {
      cwd: resolve(repoRoot, "sdk/go")
    });

    const traces = await Promise.all([nodeTracePath, pythonTracePath, goTracePath].map(readJsonFile));
    const hashes = traces.map((trace) => {
      const toolEvent = toolEvents(trace)[0];
      return {
        argHash: toolEvent.argHash,
        responseHash: toolEvent.responseHash
      };
    });

    for (const trace of traces) {
      const { expectedOutcome, ...tracePayload } = trace;
      const serializedPayload = JSON.stringify(tracePayload);
      assert.equal(validateTrace(trace).valid, true);
      assert.equal(assertionSummary(evaluateAssertions(trace)).passed, true);
      assert.equal(serializedPayload.includes("person@example.com"), false);
      assert.equal(serializedPayload.includes("secret-token"), false);
    }

    assert.deepEqual(hashes[0], hashes[1]);
    assert.deepEqual(hashes[1], hashes[2]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hand-written raw JSON trace validates and gates without an SDK", async () => {
  const trace = await readJsonFile(resolve(repoRoot, "examples/protocol/raw-trace.json"));

  assert.equal(validateTrace(trace).valid, true);
  assert.equal(assertionSummary(evaluateAssertions(trace)).passed, true);
});

test("public package surface has no private CRM pilot identifiers", async () => {
  const forbidden = "Kai|kai|/Users/anzal/work/kai|internal-crm-agent|kai-crm|kai-pilot";
  const result = await execFileAsync("rg", [
    "-n",
    forbidden,
    "README.md",
    "docs",
    "examples",
    "package.json",
    "src",
    "sdk",
    "traces"
  ], { cwd: repoRoot }).catch((error) => error);

  assert.equal(result.code, 1, result.stdout);
});

test("trace schema rejects incomplete artifacts", async () => {
  const validation = validateTrace({ schemaVersion: "agentreplay.trace.v1" });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("traceId")));
});

test("trace schema validates assertion contracts and event ids", async () => {
  const validation = validateTrace({
    schemaVersion: "agentreplay.trace.v1",
    traceId: "trace_1",
    project: "schema",
    agent: {},
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    events: [
      {
        id: "evt_1",
        type: "tool_call",
        ts: "2026-01-01T00:00:00.000Z",
        tool: "ops.noop",
        args: {},
        argHash: "hash",
        responseHash: "hash"
      },
      {
        id: "evt_1",
        type: "note",
        ts: "2026-01-01T00:00:00.000Z"
      }
    ],
    expectedOutcome: {
      assertions: [{ type: "arg_equals", tool: "ops.noop", path: "id" }]
    }
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("duplicate id")));
  assert.ok(validation.errors.some((error) => error.includes("arg_equals missing value")));
});

test("trace schema rejects tampered tool arguments and responses", async () => {
  const validation = validateTrace({
    schemaVersion: "agentreplay.trace.v1",
    traceId: "trace_1",
    project: "schema",
    agent: {},
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    events: [
      {
        id: "evt_1",
        type: "tool_call",
        ts: "2026-01-01T00:00:00.000Z",
        tool: "billing.refund",
        args: { invoiceId: "tampered" },
        argHash: sha256({ invoiceId: "original" }),
        response: { status: "tampered" },
        responseHash: sha256({ status: "original" })
      }
    ]
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("argHash does not match args")));
  assert.ok(validation.errors.some((error) => error.includes("responseHash does not match response")));
});

test("replayTrace gates under-called source traces", async () => {
  const sourceHarness = new AgentReplayHarness({
    project: "replay",
    agent: { name: "source-agent" }
  });
  const search = sourceHarness.wrapTool("stripe.searchInvoices", async () => [{ id: "in_1" }]);
  const refund = sourceHarness.wrapTool("stripe.refund", async () => ({ status: "succeeded" }));

  sourceHarness.recordInput({ message: "refund duplicate" });
  await search({ customer: "Acme" });
  await refund({ invoiceId: "in_1" });
  sourceHarness.recordFinalOutput({ status: "done" });

  const result = await replayTrace({
    sourceTrace: sourceHarness.finalize(),
    runAgent: async ({ harness }) => {
      const replayedSearch = harness.wrapTool("stripe.searchInvoices", async () => {
        throw new Error("live tool should not run");
      });

      await replayedSearch({ customer: "Acme" });
      return { status: "done" };
    }
  });

  assert.equal(result.gate.passed, false);
  assert.equal(result.replayedTrace.replayMismatches[0].kind, "missing_expected_tool_call");
});

test("file store saves, lists, and gates traces", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentreplay-store-"));
  try {
    const harness = new AgentReplayHarness({ project: "store", agent: { name: "agent" } });
    const tool = harness.wrapTool("ops.noop", async () => ({ ok: true }));
    await tool();
    const trace = harness.finalize({
      expectedOutcome: {
        assertions: [{ type: "tool_called", name: "noop_called", tool: "ops.noop" }]
      }
    });
    const store = new FileTraceStore({ rootDir: dir });

    await store.save(trace);
    const traces = await store.list();

    assert.equal(traces.length, 1);
    assert.equal(traces[0].gatePassed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("state adapter records concrete entity side effects", async () => {
  const entities = [{ id: "invoice_1", status: "paid" }];
  const adapter = createEntityStateAdapter({
    name: "invoice",
    getEntities: () => entities
  });

  const before = await adapter.snapshot();
  entities[0].status = "refunded";
  const after = await adapter.snapshot();
  const diff = await adapter.diff(before, after);

  assert.equal(diff.length, 1);
  assert.equal(diff[0].type, "invoice.updated");
  assert.equal(diff[0].after.status, "refunded");
});

test("redaction assertions catch leaked email addresses", async () => {
  const harness = new AgentReplayHarness({ project: "redaction", agent: { name: "agent" } });
  const tool = harness.wrapTool("gmail.draft", async ({ to }) => ({ to, status: "drafted" }));
  await tool({ to: "person@example.com" });
  const trace = harness.finalize({
    expectedOutcome: {
      assertions: [
        {
          type: "redaction_applied",
          name: "email_redacted",
          patterns: ["person@example\\.com"]
        }
      ]
    }
  });
  const summary = assertionSummary(evaluateAssertions(trace));

  assert.equal(summary.passed, true);
});

test("web API exposes traces and gate results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentreplay-server-"));
  let server;
  try {
    const harness = new AgentReplayHarness({ project: "server", agent: { name: "agent" } });
    const tool = harness.wrapTool("ops.noop", async () => ({ ok: true }));
    await tool();
    const trace = harness.finalize({
      expectedOutcome: {
        assertions: [{ type: "tool_called", name: "noop_called", tool: "ops.noop" }]
      }
    });
    const store = new FileTraceStore({ rootDir: dir });
    await store.save(trace);

    server = createAgentReplayServer({
      rootDir: new URL("..", import.meta.url).pathname,
      store
    });
    const bound = await listen(server, { port: 0 });
    const traces = await fetchJson(`${bound.url}/api/traces`);
    const gate = await fetchJson(`${bound.url}/api/gate?id=${trace.traceId}`);

    assert.equal(traces.length, 1);
    assert.equal(gate.passed, true);
  } finally {
    server?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI emits JSON gate and diff output for CI", async () => {
  const gate = await execFileJson([
    "./bin/agentreplay.js",
    "gate",
    "./traces/billing-fixed-run.json",
    "--json"
  ]);
  const diff = await execFileJson([
    "./bin/agentreplay.js",
    "diff",
    "./traces/billing-bad-run.json",
    "./traces/billing-fixed-run.json",
    "--json"
  ]);

  assert.equal(gate.passed, true);
  assert.equal(diff.changed, true);
  assert.ok(diff.changes.length > 0);
});

test("CLI JSON gate exits non-zero on failed traces", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "./bin/agentreplay.js",
      "gate",
      "./traces/billing-bad-run.json",
      "--json"
    ], { cwd: repoRoot }),
    (error) => {
      const output = JSON.parse(error.stdout);
      assert.equal(output.passed, false);
      assert.equal(output.failed > 0, true);
      return true;
    }
  );
});

async function fetchJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return response.json();
}

async function execFileJson(args) {
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: repoRoot });
  return JSON.parse(stdout);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
