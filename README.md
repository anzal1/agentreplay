# AgentReplay

AgentReplay is a language-neutral trace protocol and replay harness for production AI agents.

It is built around one product promise:

> Turn every failed agent run into a replayable test.

Agent observability tells you what happened. AgentReplay freezes the run as `agentreplay.trace.v1` JSON so you can replay, diff, and gate future model, prompt, tool, or workflow changes against the same production failure.

## Why this exists

Agents fail differently than chatbots. The final text can look fine while the agent touched the wrong external state, called tools in the wrong order, skipped approval, or acted on stale context.

AgentReplay captures:

- user input
- agent metadata
- tool schemas and calls
- tool arguments and responses
- pre/post state snapshots
- side-effect diffs
- approvals
- final output
- deterministic assertions

The resulting trace becomes a regression artifact that can run in CI.

## Quick demo

```bash
npm test
npm run demo
npm install @anzalabidi/agentreplay
npx --yes --package @anzalabidi/agentreplay agentreplay validate ./examples/protocol/raw-trace.json --json
node ./bin/agentreplay.js demo
node ./bin/agentreplay.js init ./my-agent-repo
node ./bin/agentreplay.js inspect ./traces/billing-bad-run.json
node ./bin/agentreplay.js gate ./traces/billing-bad-run.json
node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json
node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json --json
node ./bin/agentreplay.js diff ./traces/billing-bad-run.json ./traces/billing-fixed-run.json
```

The demo records two billing-agent runs:

- a bad run that refunds the wrong invoice and sends an email without approval
- a fixed run that refunds the duplicate invoice and drafts the email

## SDKs and raw JSON

The Node SDK is the reference implementation. Python and Go SDKs emit the same trace semantics for teams outside the Node ecosystem. Other languages can write raw `agentreplay.trace.v1` JSON and still use the CLI:

```bash
agentreplay validate ./examples/protocol/raw-trace.json --json
agentreplay gate ./examples/protocol/raw-trace.json --json
```

See [docs/TRACE_SPEC.md](./docs/TRACE_SPEC.md) for required fields, hashing, redaction, approvals, side effects, and replay semantics.

Conformance examples:

- [examples/conformance/node.js](./examples/conformance/node.js)
- [sdk/python/examples/conformance.py](./sdk/python/examples/conformance.py)
- [sdk/go/examples/conformance/main.go](./sdk/go/examples/conformance/main.go)
- [examples/protocol/raw-trace.json](./examples/protocol/raw-trace.json)

Framework boundary examples:

- [examples/integrations/openai-agents-tool-boundary.js](./examples/integrations/openai-agents-tool-boundary.js)
- [examples/integrations/langgraph-tool-boundary.js](./examples/integrations/langgraph-tool-boundary.js)
- [examples/integrations/http-webhook-raw-json.js](./examples/integrations/http-webhook-raw-json.js)

## Node SDK

```js
import { AgentReplayHarness } from "@anzalabidi/agentreplay";

const harness = new AgentReplayHarness({
  project: "billing-ops",
  agent: {
    name: "refund-agent",
    model: "gpt-5.5",
    promptHash: "sha256:..."
  }
});

const refund = harness.wrapTool(
  "stripe.refund",
  async ({ invoiceId, amount }) => {
    return stripe.refunds.create({ invoice: invoiceId, amount });
  },
  {
    snapshot: async ({ invoiceId }) => stripe.invoices.retrieve(invoiceId),
    diff: async (before, after) => [
      {
        type: "invoice_status_changed",
        before: before.status,
        after: after.status
      }
    ]
  }
);

harness.recordInput({ message: "Refund the duplicate invoice." });
await refund({ invoiceId: "in_123", amount: 4999 });
harness.recordFinalOutput({ status: "done" });
await harness.save("./traces/prod-incident-123.json", {
  expectedOutcome: {
    assertions: [
      {
        type: "tool_not_called",
        name: "never_send_email_without_approval",
        tool: "gmail.send"
      }
    ]
  }
});
```

## CLI

```bash
agentreplay inspect <trace.json> [--json]
agentreplay validate <trace.json> [--json]
agentreplay gate <trace.json> [--json]
agentreplay diff <baseline.json> <candidate.json> [--json]
agentreplay init [directory] [--force] [--json]
```

Use `--json` in CI so failures can be stored as build artifacts instead of scraped from terminal text.

Use `agentreplay init` to scaffold `traces/gates`, `traces/incidents`, and a GitHub Actions workflow that validates and gates release-critical traces.

## Current proof

These are checked by the repository test suite and public fixtures:

- `npm test`: 21/21 tests passing.
- Billing fixture: bad trace fails, fixed trace passes, diff shows changed tool arguments and side effects.
- CRM adversarial pilot: 20/20 vulnerable runs caught, 20/20 hardened runs passed, 20/20 vulnerable-to-fixed diffs detected.
- CRM bad trace fails on injection-shaped query syntax, missing approval, and multi-record mutation.
- CRM fixed trace passes all gates.
- Node, Python, and Go conformance traces validate, gate, redact secrets/PII, and produce matching tool-call hashes.
- Hand-written raw JSON trace validates and gates without any SDK.
- Public package sanitization check rejects private CRM pilot identifiers.
- `npm pack --dry-run` ships only the public protocol, SDKs, examples, docs, console, and representative traces.

## Assertion types

Current deterministic assertions:

- `tool_called`
- `tool_not_called`
- `requires_approval`
- `tool_order`
- `arg_equals`
- `arg_matches`
- `arg_not_matches`
- `response_equals`
- `max_tool_calls`
- `side_effect_exists`
- `side_effect_count`
- `no_replay_mismatches`
- `redaction_applied`

The product should stay deterministic first. LLM judges can be useful later, but they should not be the foundation of a regression harness.

## Market readiness

AgentReplay is currently suitable as an installable alpha for engineering teams building tool-using agents in high-stakes workflows. It has a working protocol, Node reference SDK/CLI, Python and Go trace SDKs, replay engine, deterministic gates, side-effect diffs, redaction, a local console, and passing product tests.

It is not yet a hosted enterprise platform. Before a public paid launch, the remaining decisions are package publishing, security review, hosted trace storage, and polished framework adapters for the ecosystems buyers already use.

See [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) for the recommended tool-boundary integration pattern.
See [docs/READINESS.md](./docs/READINESS.md) for the current product-level checklist.

The repo also includes a generic CRM adversarial workflow in [examples/crm-agent-workflow](./examples/crm-agent-workflow). It proves the harness can catch injection-shaped CRM queries, unapproved CRM writes, and over-broad record mutation without exposing any private implementation. See [docs/CRM_PILOT.md](./docs/CRM_PILOT.md) for the 20-case pilot result.

## Initial wedge

The first commercial wedge is billing, finance ops, and RevOps agents:

- actions are high-stakes
- APIs are structured
- state diffs are clear
- auditability matters
- failures are easy to understand

The launch story:

> Evals test imagined cases. Production creates the real cases. AgentReplay turns those real cases into regression tests.
