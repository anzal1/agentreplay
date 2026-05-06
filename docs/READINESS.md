# Product readiness

## Current answer

AgentReplay is good enough for a market-facing alpha: a technical team can install it locally, emit protocol-compatible traces, wrap tools, record traces, assert on side effects, replay runs, diff behavior changes, and block regressions in CI.

It is not yet finished enough to sell as a mature enterprise platform. The core is real, but the buyer-facing surface still needs packaging, trust, and workflow depth before broad launch.

## Value add

AgentReplay turns production agent failures into deterministic regression tests. That gives teams a way to answer a question normal evals do not answer well:

> If we change the model, prompt, tool, or workflow, will this exact bad production behavior come back?

The strongest value is for agents that touch money, accounts, customer records, approvals, tickets, or outbound messages.

## Target users

- AI product teams shipping tool-using agents.
- Platform teams responsible for agent reliability.
- RevOps, billing, support, finance ops, and internal automation teams.
- AI consultancies that need proof their agent changes did not reintroduce known failures.

## Finished in this repo

- `agentreplay.trace.v1` protocol spec for language-neutral trace ingestion.
- Node reference SDK and CLI for recording, validating, gating, diffing, replaying, and serving traces.
- Python SDK for recording compatible traces from Python agent stacks.
- Go SDK for recording compatible traces from backend and infra services.
- Replay mode that returns recorded tool responses without calling live systems.
- Deterministic assertion engine.
- Trace diffing for tool order, arguments, and side effects.
- File-backed trace store.
- Local web console.
- CLI commands for inspect, validate, gate, diff, freeze, serve, and demo.
- JSON CLI output for CI.
- Configurable redaction for sensitive keys and values.
- Product tests around the billing wedge, schema validation, storage, redaction, web API, and CLI gates.
- CRM adversarial workflow proving the harness can catch injection-shaped CRM queries, missing approval, and over-broad CRM-style mutations.
- Cross-SDK conformance tests proving Node, Python, and Go produce compatible hashes and assertion behavior.
- Raw JSON protocol fixture proving non-SDK bots can validate and gate successfully.
- Public sanitization checks preventing private CRM pilot identifiers from entering the package surface.
- CRM pilot with 20 adversarial cases: 20 vulnerable runs caught, 20 hardened runs passed, and representative public traces validated.

## Before public paid launch

- Publish package with provenance and versioned release notes.
- Add framework-specific adapters for the top buyer stacks.
- Add signed trace artifacts or tamper-evident trace metadata.
- Add hosted trace storage, team auth, and retention controls.
- Add security documentation for redaction, PII handling, and live-tool isolation.
- Add real customer pilots and public proof from production failures.

## Market positioning

Do not position this as "the first agent harness." That claim is too broad.

Position it as:

> Deterministic side-effect regression testing for tool-using AI agents.

That is narrower, credible, and tied to an actual pain: teams can observe agent failures, but they still need a practical way to freeze those failures and prevent them from returning after model, prompt, and tool changes.
