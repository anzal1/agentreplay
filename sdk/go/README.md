# AgentReplay Go SDK

This SDK records `agentreplay.trace.v1` JSON from Go services and backend agent systems. The Node CLI remains the reference validator, gate runner, diff tool, and replay implementation.

## Usage

```go
package main

import "agentreplay-go-sdk/agentreplay"

func main() {
	harness := agentreplay.NewHarness(
		"support-ops",
		map[string]any{"name": "ticket-agent", "language": "go"},
		"",
		"",
	)

	harness.RecordInput(map[string]any{"message": "escalate ticket_123"})
	harness.RecordToolCall(
		"support.ticket.update",
		map[string]any{"ticketId": "ticket_123"},
		map[string]any{"ok": true},
		map[string]any{"status": "approved", "by": "policy.support_escalation"},
		nil,
		nil,
		[]map[string]any{{"type": "ticket.updated", "ticketId": "ticket_123"}},
		1,
	)
	harness.RecordFinalOutput(map[string]any{"status": "done"})
	_ = harness.Save("./traces/support-ticket.json", map[string]any{
		"assertions": []any{
			map[string]any{"type": "tool_called", "tool": "support.ticket.update"},
			map[string]any{"type": "requires_approval", "tool": "support.ticket.update"},
		},
	}, nil)
}
```

Validate and gate with the reference CLI:

```bash
agentreplay validate ./traces/support-ticket.json --json
agentreplay gate ./traces/support-ticket.json --json
```

Run the conformance fixture:

```bash
cd sdk/go
go run ./examples/conformance /tmp/go-agentreplay-trace.json
cd ../..
node ./bin/agentreplay.js validate /tmp/go-agentreplay-trace.json --json
node ./bin/agentreplay.js gate /tmp/go-agentreplay-trace.json --json
```
