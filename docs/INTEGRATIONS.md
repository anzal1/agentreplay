# AgentReplay integrations

AgentReplay does not need to own your agent loop. The integration point is the tool boundary: wrap the functions that can read external state, write external state, or trigger an irreversible action.

The public contract is `agentreplay.trace.v1` JSON. The Node SDK is the reference implementation; Python and Go SDKs record compatible traces; every other bot or language can start by emitting raw trace JSON and running the same CLI gates.

## Generic agent tool

```js
import { AgentReplayHarness } from "@anzalabidi/agentreplay";

const harness = new AgentReplayHarness({
  project: "support-ops",
  agent: {
    name: "ticket-agent",
    model: "gpt-5.5",
    promptHash: "sha256:..."
  }
});

const updateTicket = harness.wrapTool(
  "zendesk.ticket.update",
  async ({ ticketId, fields }) => {
    return zendesk.tickets.update(ticketId, fields);
  },
  {
    snapshot: async ({ ticketId }) => zendesk.tickets.get(ticketId),
    diff: async (before, after) => [
      {
        type: "ticket.updated",
        beforeStatus: before.status,
        afterStatus: after.status
      }
    ]
  }
);

harness.recordInput({ message: userMessage });
const result = await runYourAgent({ tools: { updateTicket } });
harness.recordFinalOutput(result);

await harness.save("./traces/support-incident-001.json", {
  expectedOutcome: {
    assertions: [
      { type: "requires_approval", tool: "zendesk.ticket.update" },
      { type: "side_effect_exists", tool: "zendesk.ticket.update", sideEffectType: "ticket.updated" }
    ]
  }
});
```

## CI gate

```yaml
name: AgentReplay

on:
  pull_request:

jobs:
  replay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: node ./bin/agentreplay.js validate ./traces/billing-fixed-run.json --json
      - run: node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json --json
```

## Raw JSON integration

Use this path for custom bots, HTTP/webhook agents, voice agents, ADK-style tools, LangGraph nodes, OpenAI Agents tools, or any framework where adding a full SDK is not the first step.

1. Record ordered `user_input`, `tool_call`, and `final_output` events.
2. Redact secrets and PII before hashing.
3. Compute `argHash` and `responseHash` with the stable JSON rules in [TRACE_SPEC.md](./TRACE_SPEC.md).
4. Attach approvals and side-effect diffs to mutating tool calls.
5. Save the trace and gate it:

```bash
agentreplay validate trace.json --json
agentreplay gate trace.json --json
agentreplay diff bad.json fixed.json --json
```

The fixture at [examples/protocol/raw-trace.json](../examples/protocol/raw-trace.json) is hand-written JSON with no SDK dependency.

## Framework patterns

For LangGraph, wrap node-level tools or the state mutation functions they call. For OpenAI Agents and ADK-style tools, wrap the tool handler before it reaches the external API. For custom bots and webhook systems, record each outbound service call as a `tool_call`. For voice agents, record the intent text plus any downstream booking, ticket, CRM, email, or payment tool calls.

Runnable examples:

- [OpenAI Agents tool boundary](../examples/integrations/openai-agents-tool-boundary.js)
- [LangGraph tool boundary](../examples/integrations/langgraph-tool-boundary.js)
- [HTTP/webhook raw JSON trace](../examples/integrations/http-webhook-raw-json.js)

To scaffold CI in an existing repo:

```bash
agentreplay init .
```

## Where to start

Use AgentReplay first on agents that mutate state: refunds, subscription changes, CRM updates, ticket escalations, inventory edits, approval workflows, and outbound communication. Pure research/chat agents can still use traces, but the value is highest when the agent can cause costly side effects.
