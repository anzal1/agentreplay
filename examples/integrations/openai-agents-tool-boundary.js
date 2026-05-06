import { AgentReplayHarness } from "../../src/index.js";

export async function runOpenAiAgentsBoundaryExample({ tracePath } = {}) {
  const harness = new AgentReplayHarness({
    project: "openai-agents-example",
    agent: {
      name: "refund-agent",
      framework: "openai-agents"
    }
  });

  const refundTool = harness.wrapTool(
    "billing.refund",
    async ({ invoiceId, amount }) => ({
      refundId: "rf_demo_001",
      invoiceId,
      amount,
      status: "succeeded"
    }),
    {
      description: "Refund a customer invoice",
      snapshot: async ({ invoiceId }) => ({
        invoiceId,
        status: "paid",
        refunded: false
      }),
      diff: async (before, after) => [
        {
          type: "invoice.refunded",
          invoiceId: after.invoiceId,
          beforeStatus: before.status,
          afterStatus: "refunded"
        }
      ]
    }
  );

  harness.recordInput({
    message: "Refund the duplicate invoice after approval."
  });
  await refundTool(
    { invoiceId: "in_duplicate", amount: 4999 },
    {
      approval: {
        status: "approved",
        by: "policy.billing_refund",
        reason: "User confirmed duplicate invoice"
      }
    }
  );
  harness.recordFinalOutput({ status: "done" });

  const saveOptions = {
    expectedOutcome: {
      assertions: [
        { type: "tool_called", tool: "billing.refund" },
        { type: "requires_approval", tool: "billing.refund" },
        { type: "side_effect_exists", tool: "billing.refund", sideEffectType: "invoice.refunded" },
        { type: "arg_equals", tool: "billing.refund", path: "invoiceId", value: "in_duplicate" }
      ]
    },
    metadata: {
      integration: "Wrap OpenAI Agents tool handlers before they call external APIs."
    }
  };

  if (tracePath) {
    return harness.save(tracePath, saveOptions);
  }

  return harness.finalize(saveOptions);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const trace = await runOpenAiAgentsBoundaryExample({ tracePath: process.argv[2] });
  console.log(JSON.stringify({ traceId: trace.traceId, events: trace.events.length }, null, 2));
}
