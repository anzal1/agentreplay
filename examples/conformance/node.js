import { AgentReplayHarness } from "../../src/index.js";

const output = process.argv[2];
const harness = new AgentReplayHarness({
  project: "conformance",
  agent: { name: "node-sdk", language: "node" },
  traceId: "tr_node_conformance",
  startedAt: "2026-01-01T00:00:00.000Z"
});
const updateLead = harness.wrapTool(
  "crm.updateLead",
  async () => ({ ok: true, email: "person@example.com" }),
  {
    snapshot: async () => ({ lead_1: { status: "open" } }),
    diff: async () => [{ type: "crm.lead.updated", leadId: "lead_1" }]
  }
);

harness.recordInput({ message: "update a CRM lead", email: "person@example.com" });
await updateLead(
  { leadId: "lead_1", email: "person@example.com", token: "secret-token" },
  { approval: { status: "approved", by: "policy.crm_write" } }
);
harness.recordFinalOutput({ status: "done" });
await harness.save(output, {
  expectedOutcome: {
    assertions: [
      { type: "tool_called", tool: "crm.updateLead" },
      { type: "requires_approval", tool: "crm.updateLead" },
      { type: "side_effect_count", tool: "crm.updateLead", sideEffectType: "crm.lead.updated", count: 1 },
      { type: "redaction_applied", patterns: ["person@example\\.com", "secret-token"] }
    ]
  }
});
