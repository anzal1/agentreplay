import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentReplayHarness,
  assertionSummary,
  createRedactor,
  diffTraces,
  evaluateAssertions
} from "../src/index.js";

test("records tool calls and evaluates deterministic assertions", async () => {
  const harness = new AgentReplayHarness({
    project: "test",
    agent: { name: "unit-agent" }
  });
  const tool = harness.wrapTool("billing.refund", async ({ amount }) => ({ ok: true, amount }));

  harness.recordInput({ message: "refund" });
  await tool({ amount: 10 });
  harness.recordFinalOutput({ status: "done" });

  const trace = harness.finalize({
    expectedOutcome: {
      assertions: [
        { type: "tool_called", tool: "billing.refund" },
        { type: "tool_not_called", tool: "gmail.send" },
        { type: "arg_equals", tool: "billing.refund", path: "amount", value: 10 }
      ]
    }
  });
  const summary = assertionSummary(evaluateAssertions(trace));

  assert.equal(summary.passed, true);
  assert.equal(trace.events.filter((event) => event.type === "tool_call").length, 1);
});

test("diffs tool sequence and argument changes", async () => {
  const left = await traceWithTool("stripe.refund", { invoiceId: "a" });
  const right = await traceWithTool("gmail.send", { to: "customer@example.com" });
  const diff = diffTraces(left, right);

  assert.equal(diff.changed, true);
  assert.equal(diff.changes.some((change) => change.type === "tool_changed"), true);
  assert.equal(diff.changes.some((change) => change.type === "args_changed"), true);
});

test("replay returns recorded tool responses and records mismatches", async () => {
  const original = await traceWithTool("stripe.refund", { invoiceId: "a" });
  const replay = new AgentReplayHarness({
    mode: "replay",
    project: "test",
    trace: original
  });
  const tool = replay.wrapTool("stripe.refund", async () => {
    throw new Error("should not call real handler");
  });

  const response = await tool({ invoiceId: "b" });
  const replayTrace = replay.finalize();

  assert.deepEqual(response, { ok: true });
  assert.equal(replayTrace.replayMismatches.length, 1);
  assert.equal(replayTrace.replayMismatches[0].kind, "tool_args_mismatch");
});

test("replay records missing expected tool calls", async () => {
  const original = new AgentReplayHarness({
    project: "test",
    agent: { name: "unit-agent" }
  });
  const first = original.wrapTool("stripe.search", async () => ({ ok: true }));
  const second = original.wrapTool("stripe.refund", async () => ({ ok: true }));
  await first({ customer: "Acme" });
  await second({ invoiceId: "in_1" });
  const sourceTrace = original.finalize();

  const replay = new AgentReplayHarness({
    mode: "replay",
    project: "test",
    trace: sourceTrace
  });
  const replayedFirst = replay.wrapTool("stripe.search", async () => ({ ok: false }));
  await replayedFirst({ customer: "Acme" });
  const replayTrace = replay.finalize();

  assert.equal(replayTrace.replayMismatches.length, 1);
  assert.equal(replayTrace.replayMismatches[0].kind, "missing_expected_tool_call");
  assert.equal(replayTrace.replayMismatches[0].expectedTool, "stripe.refund");
});

test("custom redactor removes market-specific sensitive fields and values", async () => {
  const harness = new AgentReplayHarness({
    project: "redaction",
    agent: { name: "unit-agent" },
    redact: createRedactor({
      keys: ["customerName"],
      patterns: [/^inv_secret_\d+$/]
    })
  });
  const tool = harness.wrapTool("billing.lookup", async ({ invoiceId }) => ({
    invoiceId,
    customerName: "Ada Lovelace"
  }));

  await tool({
    invoiceId: "inv_secret_123",
    customerName: "Ada Lovelace"
  });
  const serialized = JSON.stringify(harness.finalize());

  assert.equal(serialized.includes("inv_secret_123"), false);
  assert.equal(serialized.includes("Ada Lovelace"), false);
});

async function traceWithTool(name, args) {
  const harness = new AgentReplayHarness({
    project: "test",
    agent: { name: "unit-agent" }
  });
  const tool = harness.wrapTool(name, async () => ({ ok: true }));
  await tool(args);
  return harness.finalize();
}
