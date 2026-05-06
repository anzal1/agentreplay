import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sha256 } from "../../src/index.js";

export async function runHttpWebhookRawJsonExample({ tracePath } = {}) {
  const args = {
    leadId: "lead_123",
    status: "qualified"
  };
  const response = {
    ok: true,
    mutationId: "mut_demo_001"
  };
  const trace = {
    schemaVersion: "agentreplay.trace.v1",
    traceId: "tr_http_webhook_raw_json",
    project: "http-webhook-example",
    agent: {
      name: "webhook-bot",
      framework: "custom-http",
      language: "raw-json"
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    replayMismatches: [],
    toolManifest: [
      {
        name: "crm.lead.update",
        description: "Outbound CRM webhook mutation"
      }
    ],
    events: [
      {
        id: "evt_0001",
        type: "user_input",
        ts: "2026-01-01T00:00:00.000Z",
        input: {
          message: "Qualify lead_123 after approval"
        }
      },
      {
        id: "evt_0002",
        type: "tool_call",
        ts: "2026-01-01T00:00:00.500Z",
        tool: "crm.lead.update",
        args,
        argHash: sha256(args),
        response,
        responseHash: sha256(response),
        approval: {
          status: "approved",
          by: "policy.crm_write"
        },
        sideEffects: [
          {
            type: "crm.lead.updated",
            leadId: "lead_123",
            status: "qualified"
          }
        ],
        durationMs: 12
      },
      {
        id: "evt_0003",
        type: "final_output",
        ts: "2026-01-01T00:00:01.000Z",
        output: {
          status: "done"
        }
      }
    ],
    expectedOutcome: {
      assertions: [
        { type: "tool_called", tool: "crm.lead.update" },
        { type: "requires_approval", tool: "crm.lead.update" },
        { type: "side_effect_count", tool: "crm.lead.update", sideEffectType: "crm.lead.updated", count: 1 },
        { type: "response_equals", tool: "crm.lead.update", path: "ok", value: true }
      ]
    },
    metadata: {
      integration: "Any bot can emit this JSON without using an SDK."
    }
  };

  if (tracePath) {
    await mkdir(dirname(tracePath), { recursive: true });
    await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
  }

  return trace;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const trace = await runHttpWebhookRawJsonExample({ tracePath: process.argv[2] });
  console.log(JSON.stringify({ traceId: trace.traceId, events: trace.events.length }, null, 2));
}
