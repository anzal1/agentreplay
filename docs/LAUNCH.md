# AgentReplay Launch

## Category

Agent side-effect regression testing.

Do not lead with observability, guardrails, or generic replay. Those categories already have default mental models and crowded vendor lists.

Lead with replay:

> Freeze, diff, and gate the real-world state changes your agent made.

## Landing page hero

Headline:

> Replay your AI agent's worst mistake before it happens again.

Subhead:

> AgentReplay records tool calls, pre/post state, approvals, and side effects, then turns production failures into deterministic regression gates for every model, prompt, or tool change.

Primary CTA:

> Freeze a Trace

Secondary CTA:

> Run the Billing Demo

## Unveiling demo

Use the billing-agent demo in this repo.

The story:

1. A billing agent receives: "Refund Acme for the duplicate invoice and let Sarah know."
2. The buggy agent refunds the original invoice.
3. It updates CRM.
4. It sends an email without approval.
5. AgentReplay freezes that run.
6. The fixed agent is compared against the bad trace.
7. The gate proves the bad behavior can no longer pass.

Demo commands:

```bash
node ./bin/agentreplay.js demo
node ./bin/agentreplay.js gate ./traces/billing-bad-run.json
node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json
node ./bin/agentreplay.js diff ./traces/billing-bad-run.json ./traces/billing-fixed-run.json
```

## Buyer

Start with teams building agents for:

- billing and finance ops
- RevOps
- customer support operations
- internal automation
- AI automation agencies

The first buyer already has a tool-using agent and has felt the pain of debugging a run that cannot be cleanly reproduced.

## Product thesis

Evals test imagined cases. Production creates the real cases.

AgentReplay turns the real cases into regression tests.

## What not to claim

Avoid:

- universal agent safety
- full AI observability platform
- model evaluation replacement
- generic agent framework

Claim:

- replay
- freeze
- diff
- gate
- trace-to-test
- side-effect regression testing
