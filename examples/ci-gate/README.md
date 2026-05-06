# CI gate example

This example shows the minimum product workflow:

1. Record or freeze a trace from a real failed run.
2. Add deterministic assertions to the trace.
3. Run the trace gate in CI every time the agent changes.

```bash
node ./bin/agentreplay.js validate ./traces/billing-fixed-run.json --json
node ./bin/agentreplay.js gate ./traces/billing-fixed-run.json --json
node ./bin/agentreplay.js diff ./traces/billing-bad-run.json ./traces/billing-fixed-run.json --json
```

The command exits non-zero when an assertion fails, so CI can block a model, prompt, tool, or workflow change before it ships.
