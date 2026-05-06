# Claims Tested

Date: 2026-05-06

## Claim 1: "No one has built agent replay."

Status: false as stated.

The market already has adjacent products and research using replay language:

- Regres.ai: regression testing, production auditing, replay and compare for AI decisions.
- Laminar: AI-agent observability with rollout/replay from captured traces.
- Tracewire: prompt and tool-call tracing with replay from a point in the trace.
- Omium: production agent observability with time-travel replay.
- Decyra: AI-agent decision replay and auditing.
- AgentRR paper: record-and-replay paradigm for LLM agents.

Implication: AgentReplay should not claim to be the first agent replay product.

## Claim 2: "There is still a gap around side effects and state transitions."

Status: defensible but narrow.

The crowded category is observability/replay. The sharper wedge is deterministic side-effect regression:

- capture pre/post state around mutating tools
- record side-effect diffs
- validate tool ordering
- enforce approval invariants
- redact sensitive fields by default
- fail CI using deterministic assertions

This repo tests that wedge with the billing-agent scenario, a generic CRM adversarial fixture, cross-SDK conformance fixtures, and a hand-written raw JSON trace.

## Claim 3: "Turn every failed agent run into a replayable regression test."

Status: implemented locally for API/tool-call agents.

Evidence:

```bash
npm test
node ./bin/agentreplay.js demo
node ./bin/agentreplay.js gate ./traces/billing-bad-run.json
node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json
node ./bin/agentreplay.js diff ./traces/billing-bad-run.json ./traces/billing-fixed-run.json
node ./examples/crm-agent-workflow/pilot.js
node ./bin/agentreplay.js gate ./traces/crm-bad-run.json
node ./bin/agentreplay.js gate ./traces/crm-fixed-run.json
node ./bin/agentreplay.js validate ./examples/protocol/raw-trace.json
```

What the demo proves:

- a bad production-style run is captured as a trace
- a fixed candidate run is captured as a second trace
- deterministic assertions fail the bad trace
- deterministic assertions pass the fixed trace
- diff output shows changed tool args and side effects
- sensitive customer emails are redacted
- a 20-case CRM adversarial pilot catches 20/20 vulnerable runs and passes 20/20 hardened runs
- Node, Python, and Go SDK traces validate, gate, redact, and produce matching hashes
- a hand-written raw JSON trace validates and gates without any SDK

## Revised positioning

Do not position this as:

> The first AI-agent replay system.

Position it as:

> Deterministic side-effect regression testing for tool-using AI agents.

Short form:

> Freeze, diff, and gate the real-world state changes your agent made.
