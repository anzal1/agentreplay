# AgentReplay Python SDK

This SDK records `agentreplay.trace.v1` JSON from Python agent stacks. The Node CLI remains the reference validator, gate runner, diff tool, and replay implementation.

## Usage

```python
from agentreplay import AgentReplayHarness

harness = AgentReplayHarness(
    project="support-ops",
    agent={"name": "ticket-agent", "language": "python"},
)

harness.record_input({"message": "escalate ticket_123"})
harness.record_tool_call(
    "support.ticket.update",
    args={"ticketId": "ticket_123"},
    response={"ok": True},
    approval={"status": "approved", "by": "policy.support_escalation"},
    side_effects=[{"type": "ticket.updated", "ticketId": "ticket_123"}],
)
harness.record_final_output({"status": "done"})
harness.save(
    "./traces/support-ticket.json",
    expected_outcome={
        "assertions": [
            {"type": "tool_called", "tool": "support.ticket.update"},
            {"type": "requires_approval", "tool": "support.ticket.update"},
        ]
    },
)
```

Validate and gate with the reference CLI:

```bash
agentreplay validate ./traces/support-ticket.json --json
agentreplay gate ./traces/support-ticket.json --json
```

Run the conformance fixture:

```bash
python3 ./sdk/python/examples/conformance.py /tmp/python-agentreplay-trace.json
node ./bin/agentreplay.js validate /tmp/python-agentreplay-trace.json --json
node ./bin/agentreplay.js gate /tmp/python-agentreplay-trace.json --json
```
