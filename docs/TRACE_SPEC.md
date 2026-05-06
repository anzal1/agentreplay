# AgentReplay trace protocol v1

AgentReplay is language-neutral at the trace boundary. Any bot, agent framework, or service can emit `agentreplay.trace.v1` JSON and use the Node reference CLI for validation, gates, diffs, and the local console.

## Top-level trace

Required fields:

- `schemaVersion`: must be `agentreplay.trace.v1`
- `traceId`: stable trace identifier
- `project`: project or service name
- `agent`: object describing the agent, bot, model, prompt, or workflow
- `startedAt` / `endedAt`: ISO-8601 timestamps
- `events`: ordered event array

Optional fields:

- `sourceTraceId`: source trace used for replay
- `replayMismatches`: replay mismatch objects
- `toolManifest`: tool metadata
- `expectedOutcome.assertions`: deterministic gate assertions
- `metadata`: implementation-specific metadata

## Event types

`user_input` records the input that started the run:

```json
{ "id": "evt_0001", "type": "user_input", "ts": "2026-01-01T00:00:00.000Z", "input": {} }
```

`tool_call` records a tool boundary. It is the core portable event:

```json
{
  "id": "evt_0002",
  "type": "tool_call",
  "ts": "2026-01-01T00:00:00.000Z",
  "tool": "crm.pushRecords",
  "args": {},
  "argHash": "sha256-of-redacted-args",
  "response": {},
  "responseHash": "sha256-of-redacted-response",
  "approval": { "status": "approved", "by": "policy.crm_write", "reason": "consent captured" },
  "preState": {},
  "postState": {},
  "sideEffects": [{ "type": "crm.record.updated", "recordId": "rec_1" }],
  "durationMs": 12
}
```

`final_output` records the final response or result:

```json
{ "id": "evt_0003", "type": "final_output", "ts": "2026-01-01T00:00:00.000Z", "output": {} }
```

`note` can store non-gating diagnostic metadata.

## Hashing

`argHash` and `responseHash` are SHA-256 hashes of the redacted JSON values stored in the trace. Implementations must:

1. Recursively sort object keys lexicographically.
2. Preserve array order.
3. Serialize compact JSON with no extra whitespace.
4. Hash the UTF-8 serialized bytes with SHA-256.

The Node reference function is `sha256(value)` from `agentreplay`.

## Redaction

SDKs should redact before hashing and saving. The default policy redacts common secret/contact keys such as `token`, `secret`, `password`, `authorization`, `apiKey`, `email`, `to`, `from`, `cc`, and `bcc`, and also redacts plain email-address string values.

Teams should add domain-specific redaction for customer IDs, phone numbers, account numbers, query strings, and payload fields that may contain PII.

## Replay semantics

Replay compares the ordered source tool calls against the replayed tool calls. A replay mismatch is recorded for:

- unexpected tool call
- tool name mismatch
- tool argument mismatch
- missing expected tool call

The reference replay gate adds `no_replay_mismatches` automatically.

## Language support

The Node SDK is the reference implementation. Python and Go SDKs emit compatible trace JSON. Any other language can integrate by writing JSON traces that pass:

```bash
agentreplay validate trace.json --json
agentreplay gate trace.json --json
```
