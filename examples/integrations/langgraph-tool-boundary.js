import { AgentReplayHarness } from "../../src/index.js";

export async function runLangGraphBoundaryExample({ tracePath } = {}) {
  const ticket = {
    id: "ticket_123",
    priority: "normal",
    assignee: null
  };
  const harness = new AgentReplayHarness({
    project: "langgraph-example",
    agent: {
      name: "support-graph",
      framework: "langgraph"
    }
  });

  const updateTicket = harness.wrapTool(
    "support.ticket.update",
    async ({ ticketId, fields }) => {
      Object.assign(ticket, fields);
      return { ticketId, updated: Object.keys(fields) };
    },
    {
      description: "Update support ticket state from a graph node",
      snapshot: async () => ({ ...ticket }),
      diff: async (before, after) =>
        before.priority !== after.priority || before.assignee !== after.assignee
          ? [{
              type: "ticket.updated",
              ticketId: after.id,
              priority: after.priority,
              assignee: after.assignee
            }]
          : []
    }
  );

  harness.recordInput({
    message: "Escalate this billing ticket to priority support."
  });
  await updateTicket(
    {
      ticketId: "ticket_123",
      fields: {
        priority: "high",
        assignee: "priority-support"
      }
    },
    {
      approval: {
        status: "approved",
        by: "policy.support_escalation"
      }
    }
  );
  harness.recordFinalOutput({ status: "escalated" });

  const saveOptions = {
    expectedOutcome: {
      assertions: [
        { type: "tool_called", tool: "support.ticket.update" },
        { type: "requires_approval", tool: "support.ticket.update" },
        { type: "side_effect_count", tool: "support.ticket.update", sideEffectType: "ticket.updated", count: 1 },
        { type: "arg_equals", tool: "support.ticket.update", path: "ticketId", value: "ticket_123" }
      ]
    },
    metadata: {
      integration: "Wrap LangGraph node tools or state mutation functions at the boundary."
    }
  };

  if (tracePath) {
    return harness.save(tracePath, saveOptions);
  }

  return harness.finalize(saveOptions);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const trace = await runLangGraphBoundaryExample({ tracePath: process.argv[2] });
  console.log(JSON.stringify({ traceId: trace.traceId, events: trace.events.length }, null, 2));
}
