# Generic CRM adversarial pilot

This public pilot uses an offline CRM fixture. It preserves the failure class AgentReplay is meant to catch without publishing private customer, connector, path, trace, or agent details.

## Failure class

The vulnerable workflow builds a broad CRM query from untrusted input, fetches multiple leads, and writes all fetched records without approval. The fixed workflow performs an exact email lookup, limits the fetch to one record, and attaches explicit approval metadata before the write.

AgentReplay gates the run with deterministic assertions for:

- fetch-before-write tool order
- injection-shaped query syntax
- required approval on CRM writes
- exactly one CRM lead side effect
- intended target record
- redaction of emails and phone numbers

## Result

Current public fixture result:

- 20 adversarial prompts
- 20 vulnerable runs caught
- 20 hardened runs passed
- 20 vulnerable-to-fixed diffs detected

Run it locally:

```bash
node ./examples/crm-agent-workflow/pilot.js
```

Generate public representative traces:

```bash
node --input-type=module -e "import { runCrmAdversaryDemo } from './examples/crm-agent-workflow/demo.js'; await runCrmAdversaryDemo({ badTracePath: './traces/crm-bad-run.json', fixedTracePath: './traces/crm-fixed-run.json' });"
```

The public package includes only the generic CRM example and representative traces. Private pilot evidence stays outside the package.
